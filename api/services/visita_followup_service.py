"""Seguimiento de visitas sin respuesta: recordatorio a las 12 h, reasignación a las 24 h.

Una visita 'pendiente' con agente es un comprador esperando. Si el realtor no la
toca (cambia de estado) en RECORDATORIO_HORAS se le recuerda; pasadas
REASIGNAR_HORAS se pasa al owner de su agencia (si es otro agente activo) o se
escala al buzón interno. Cada paso se "reclama" con UPDATE ... RETURNING sobre
una marca (recordatorio_at / reasignada_at / escalada_at): sin doble envío aunque
corran dos crons.
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict

from api.services.agent_service import ESTADOS_ASIGNABLES

logger = logging.getLogger(__name__)

RECORDATORIO_HORAS = int(os.getenv("VISITA_RECORDATORIO_HORAS", "12"))
REASIGNAR_HORAS = int(os.getenv("VISITA_REASIGNAR_HORAS", "24"))
ESCALAR_A = os.getenv("RENTAL_INQUIRIES_TO", "rentalinquiries@medellinsocial.com")


async def _avisar(conn: Any, visita_id: Any, agent_id: Any, asunto: str, intro: str) -> None:
    """Email best-effort al agente con los datos del comprador. Nunca lanza."""
    try:
        from api.utils.email import esc, send_email

        row = await conn.fetchrow(
            "SELECT a.email, a.nombre AS agente, v.nombre AS comprador, v.telefono "
            "FROM agent a, visita_solicitud v WHERE a.id = $1::uuid AND v.id = $2::uuid",
            str(agent_id), str(visita_id),
        )
        if not row or not row["email"]:
            return
        app_url = os.getenv("APP_URL", "https://medellin.social")
        await send_email(
            row["email"], asunto,
            f"<p>Hola {esc(row['agente'])}, {esc(intro)}</p>"
            f"<p><strong>{esc(row['comprador'] or 'Un comprador')}</strong>"
            f"{(' · ' + esc(row['telefono'])) if row['telefono'] else ''}</p>"
            f'<p><a href="{app_url}/realtor/dashboard?tab=agenda">Abrir mi agenda →</a></p>',
        )
    except Exception:
        logger.exception("visita followup: aviso falló (visita=%s)", visita_id)


async def recordar_pendientes(pool: Any) -> int:
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "UPDATE visita_solicitud SET recordatorio_at = NOW() "
            "WHERE estado = 'pendiente' AND agent_id IS NOT NULL AND recordatorio_at IS NULL "
            "AND created_at < NOW() - make_interval(hours => $1) RETURNING id, agent_id",
            RECORDATORIO_HORAS,
        )
        for r in rows:
            await _avisar(conn, r["id"], r["agent_id"],
                          "Recordatorio: un comprador espera tu respuesta",
                          "tienes una visita sin responder. Confírmala o cancélala; si no, pasará a tu agencia:")
    return len(rows)


async def reasignar_vencidas(pool: Any) -> Dict[str, int]:
    """Pasa al owner de la agencia (otro agente activo) o escala al buzón interno."""
    reasignadas = escaladas = 0
    async with pool.acquire() as conn:
        due = await conn.fetch(
            "SELECT v.id, v.agent_id, v.listing_url, v.nombre, v.telefono FROM visita_solicitud v "
            "WHERE v.estado = 'pendiente' AND v.agent_id IS NOT NULL "
            "AND v.reasignada_at IS NULL AND v.escalada_at IS NULL "
            "AND v.created_at < NOW() - make_interval(hours => $1) LIMIT 100",
            REASIGNAR_HORAS,
        )
        for v in due:
            owner = await conn.fetchval(
                "SELECT o.agent_id FROM agency_member me "
                "JOIN agency_member o ON o.agency_id = me.agency_id AND o.rol::text = 'owner' "
                "JOIN agent a ON a.id = o.agent_id AND a.estado::text = ANY($2::text[]) "
                "WHERE me.agent_id = $1 AND o.agent_id <> $1 LIMIT 1",
                v["agent_id"], list(ESTADOS_ASIGNABLES),
            )
            if owner:
                row = await conn.fetchrow(
                    "UPDATE visita_solicitud SET agent_id = $2, reasignada_at = NOW(), updated_at = NOW() "
                    "WHERE id = $1 AND estado = 'pendiente' AND reasignada_at IS NULL RETURNING id",
                    v["id"], owner,
                )
                if row:
                    reasignadas += 1
                    await _avisar(conn, v["id"], owner, "Visita reasignada a ti",
                                  "una visita de tu agencia llevaba 24 h sin respuesta y ahora es tuya:")
            else:
                row = await conn.fetchrow(
                    "UPDATE visita_solicitud SET escalada_at = NOW() "
                    "WHERE id = $1 AND estado = 'pendiente' AND escalada_at IS NULL RETURNING id",
                    v["id"],
                )
                if row:
                    escaladas += 1
                    try:
                        from api.utils.email import esc, send_email
                        await send_email(
                            ESCALAR_A, "Visita sin respuesta 24 h (sin a quién reasignar)",
                            f"<p>{esc(v['nombre'] or 'Comprador')} · {esc(v['telefono'] or '—')}</p>"
                            f"<p>{esc(v['listing_url'])}</p>",
                        )
                    except Exception:
                        logger.exception("visita followup: escalada falló (visita=%s)", v["id"])
    if reasignadas or escaladas:
        logger.info("visita followup: %d reasignada(s), %d escalada(s)", reasignadas, escaladas)
    return {"reasignadas": reasignadas, "escaladas": escaladas}
