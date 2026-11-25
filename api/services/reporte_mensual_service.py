"""Reporte mensual al realtor: qué logró su presencia en el mes anterior.

Muestra valor (vistas, aperturas, visitas) para bajar churn. Idempotente por
(agente, periodo) vía INSERT ... ON CONFLICT DO NOTHING; solo se envía a agentes
activos con email y alguna actividad. Nunca lanza por un agente (aísla fallos).
"""
from __future__ import annotations

import logging
import os
from datetime import date
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# $1 agent_id, $2 usuario_id, $3 inicio (date), $4 fin exclusivo (date)
_METRICAS_SQL = """
WITH mis_urls AS (
    SELECT l.id::text AS url FROM listing l WHERE l.agent_id = $1
    UNION ALL SELECT l.slug FROM listing l WHERE l.agent_id = $1 AND l.slug IS NOT NULL
    UNION ALL
    SELECT lp.id::text FROM public.listings_propios lp
    JOIN public.agentes ag ON ag.id = lp.agente_id WHERE ag.usuario_id = $2
)
SELECT
  (SELECT count(*) FROM public.user_events e JOIN mis_urls m ON m.url = e.entity_id
    WHERE e.event_type = 'listing_preview' AND e.created_at >= $3 AND e.created_at < $4)::int AS vistas_mapa,
  (SELECT count(*) FROM public.user_events e JOIN mis_urls m ON m.url = e.entity_id
    WHERE e.event_type = 'listing_view' AND e.created_at >= $3 AND e.created_at < $4)::int AS aperturas,
  (SELECT count(*) FROM visita_solicitud v WHERE v.agent_id = $1
    AND v.created_at >= $3 AND v.created_at < $4)::int AS visitas_recibidas,
  (SELECT count(*) FROM visita_solicitud v WHERE v.agent_id = $1
    AND v.created_at >= $3 AND v.created_at < $4 AND v.estado <> 'pendiente')::int AS visitas_respondidas,
  (SELECT count(*) FROM visita_solicitud v WHERE v.agent_id = $1
    AND v.created_at >= $3 AND v.created_at < $4 AND v.estado = 'realizada')::int AS visitas_realizadas
"""

_MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
          "septiembre", "octubre", "noviembre", "diciembre"]


def periodo_anterior(hoy: Optional[date] = None) -> tuple[date, date]:
    """(primer día del mes anterior, primer día del mes actual)."""
    hoy = hoy or date.today()
    fin = hoy.replace(day=1)
    inicio = date(fin.year - 1, 12, 1) if fin.month == 1 else date(fin.year, fin.month - 1, 1)
    return inicio, fin


def _hay_actividad(m: Dict[str, int]) -> bool:
    return any(m[k] for k in ("vistas_mapa", "aperturas", "visitas_recibidas"))


def _html(nombre: str, inicio: date, m: Dict[str, int]) -> str:
    from api.utils.email import esc

    app_url = os.getenv("APP_URL", "https://medellin.social")
    resp = (f"{round(100 * m['visitas_respondidas'] / m['visitas_recibidas'])} %"
            if m["visitas_recibidas"] else "—")
    return f"""
    <h3 style="color:#1D9E75">Tu resultado de {_MESES[inicio.month - 1]}</h3>
    <p>Hola {esc(nombre)}, esto logró tu presencia en Medellín Social:</p>
    <ul>
      <li><strong>{m['vistas_mapa']}</strong> vistas de tus inmuebles en el mapa</li>
      <li><strong>{m['aperturas']}</strong> aperturas del detalle</li>
      <li><strong>{m['visitas_recibidas']}</strong> solicitudes de visita ({resp} respondidas)</li>
      <li><strong>{m['visitas_realizadas']}</strong> visitas realizadas</li>
    </ul>
    <p>Responder en menos de 12 h sube tu posición en el ranking.</p>
    <p><a href="{app_url}/realtor/dashboard" style="color:#085041;font-weight:600">Ver mi panel →</a></p>
    """


async def enviar_reportes(pool: Any, hoy: Optional[date] = None) -> Dict[str, int]:
    from api.utils.email import send_email

    inicio, fin = periodo_anterior(hoy)
    enviados = sin_actividad = fallaron = 0
    agentes = await pool.fetch(
        "SELECT id, usuario_id, nombre, email FROM agent "
        "WHERE estado::text = 'activo' AND email IS NOT NULL AND email <> ''"
    )
    for a in agentes:
        try:
            m = dict(await pool.fetchrow(_METRICAS_SQL, a["id"], a["usuario_id"], inicio, fin))
            if not _hay_actividad(m):
                sin_actividad += 1
                continue
            claimed = await pool.fetchval(
                "INSERT INTO agent_reporte_mensual (agent_id, periodo) VALUES ($1, $2) "
                "ON CONFLICT DO NOTHING RETURNING agent_id", a["id"], inicio)
            if not claimed:
                continue  # ya enviado este periodo
            try:
                await send_email(a["email"], f"Tu resultado de {_MESES[inicio.month - 1]} en Medellín Social",
                                 _html(a["nombre"] or "", inicio, m))
                enviados += 1
            except Exception:
                # liberar para que el siguiente run lo reintente
                await pool.execute("DELETE FROM agent_reporte_mensual WHERE agent_id = $1 AND periodo = $2",
                                   a["id"], inicio)
                raise
        except Exception:
            fallaron += 1
            logger.exception("reporte mensual falló (agent=%s)", a["id"])
    return {"enviados": enviados, "sin_actividad": sin_actividad, "fallaron": fallaron}
