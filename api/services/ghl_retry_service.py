"""Reintento de pushes a GHL que fallaron (public.ghl_push_failures).

Cada fallo abierto (resolved_at IS NULL) se reintenta con backoff creciente por
`attempts`, hasta MAX_ATTEMPTS; pasado el tope queda "agotado" y solo se ve en el
panel admin (reintento manual). El sync_* correspondiente resuelve el fallo si
sale bien o suma un intento si vuelve a fallar.
"""
from __future__ import annotations

import logging
from typing import Optional

from api.utils import ghl_client

log = logging.getLogger(__name__)

MAX_ATTEMPTS = 8
# object_type -> (sync_fn, convierte el id guardado como texto al tipo que espera)
_SYNC = {
    "listing": (ghl_client.sync_listing, str),
    "agency": (ghl_client.sync_agency, str),
    "agent": (ghl_client.sync_agent, str),
    "visita": (ghl_client.sync_visita, str),
    "tienda": (ghl_client.sync_tienda, int),
    "evento": (ghl_client.sync_evento, int),
    "referidor": (ghl_client.sync_referidor, int),
    "lead_servicio": (ghl_client.sync_lead_servicio, str),
    "negocio": (ghl_client.sync_negocio, int),
}
TIPOS_REINTENTABLES = tuple(_SYNC)

# Backoff: espera 5 min × 2^(attempts-1) desde el último fallo (5, 10, 20 … min).
_DUE_SQL = """
SELECT id, object_type, internal_object_id
FROM public.ghl_push_failures
WHERE resolved_at IS NULL
  AND attempts < $1
  AND object_type = ANY($2::text[])
  AND last_failed_at < now() - (interval '5 minutes' * power(2, attempts - 1))
ORDER BY last_failed_at
LIMIT $3
"""


async def listar_fallos(pool, solo_abiertos: bool = True, limit: int = 100) -> list[dict]:
    rows = await pool.fetch(
        """
        SELECT id, object_type, internal_object_id, error, attempts,
               first_failed_at, last_failed_at, resolved_at,
               (resolved_at IS NULL AND attempts >= $1) AS agotado
        FROM public.ghl_push_failures
        WHERE ($2::boolean = FALSE OR resolved_at IS NULL)
        ORDER BY last_failed_at DESC
        LIMIT $3
        """,
        MAX_ATTEMPTS, solo_abiertos, limit,
    )
    return [dict(r) for r in rows]


async def _reintentar_uno(object_type: str, internal_id: str) -> None:
    fn, cast = _SYNC[object_type]
    await fn(cast(internal_id))


async def reintentar_pendientes(pool, limit: int = 50) -> dict:
    """Reintenta los fallos vencidos de backoff. Devuelve {intentados, resueltos, fallaron}."""
    if not ghl_client.is_configured():
        return {"intentados": 0, "resueltos": 0, "fallaron": 0}
    rows = await pool.fetch(_DUE_SQL, MAX_ATTEMPTS, list(TIPOS_REINTENTABLES), limit)
    return await _procesar(pool, rows)


async def reintentar_ids(pool, ids: list[int]) -> dict:
    """Reintento manual (admin): ignora backoff y tope de intentos."""
    rows = await pool.fetch(
        "SELECT id, object_type, internal_object_id FROM public.ghl_push_failures "
        "WHERE id = ANY($1::bigint[]) AND resolved_at IS NULL AND object_type = ANY($2::text[])",
        ids, list(TIPOS_REINTENTABLES),
    )
    return await _procesar(pool, rows)


async def _procesar(pool, rows) -> dict:
    resueltos = fallaron = 0
    for r in rows:
        try:
            await _reintentar_uno(r["object_type"], r["internal_object_id"])
        except Exception:  # noqa: BLE001 — un fallo no debe frenar el resto
            log.exception("reintento GHL %s/%s lanzó", r["object_type"], r["internal_object_id"])
        abierto: Optional[int] = await pool.fetchval(
            "SELECT id FROM public.ghl_push_failures WHERE id = $1 AND resolved_at IS NULL", r["id"]
        )
        if abierto is None:
            resueltos += 1
        else:
            fallaron += 1
    log.info("ghl_retry: %d intentados, %d resueltos, %d siguen fallando", len(rows), resueltos, fallaron)
    return {"intentados": len(rows), "resueltos": resueltos, "fallaron": fallaron}


async def alertar_agotados(pool) -> int:
    """Avisa UNA vez al admin (un solo email-resumen) de los fallos que ya agotaron
    los reintentos automáticos. Marca alerta_agotado_at solo si el email salió, para
    reintentar el aviso en la próxima corrida si el correo falló. Devuelve cuántos avisó."""
    from html import escape

    from api.utils.email import ADMIN_EMAIL, _wrap, send_email

    rows = await pool.fetch(
        "SELECT id, object_type, internal_object_id, error, attempts, last_failed_at "
        "FROM public.ghl_push_failures "
        "WHERE resolved_at IS NULL AND attempts >= $1 AND alerta_agotado_at IS NULL "
        "ORDER BY last_failed_at LIMIT 50",
        MAX_ATTEMPTS,
    )
    if not rows:
        return 0
    items = "".join(
        f"<li><b>{escape(str(r['object_type']))}</b> {escape(str(r['internal_object_id']))} — "
        f"{escape(str(r['error'] or '')[:200])}</li>"
        for r in rows
    )
    html = _wrap(
        f"<h2>{len(rows)} push(es) a GHL agotaron los reintentos</h2><ul>{items}</ul>"
        "<p>Revisa y reintenta desde el panel admin (GHL → fallos).</p>"
    )
    try:
        await send_email(ADMIN_EMAIL, f"[Urbi] {len(rows)} fallo(s) de GHL sin resolver", html)
    except Exception:  # noqa: BLE001 — se reintenta el aviso en la próxima corrida
        log.exception("no se pudo enviar el aviso de fallos GHL agotados")
        return 0
    await pool.execute(
        "UPDATE public.ghl_push_failures SET alerta_agotado_at = now() WHERE id = ANY($1::bigint[])",
        [r["id"] for r in rows],
    )
    return len(rows)
