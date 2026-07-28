"""Due diligence — el realtor verifica lo que declaró el owner (autoreporte).

Es un TRACKER manual, no un scraper. El certificado de tradición y libertad y
demás documentos los verifica el realtor a mano y marca cada item. Alimenta el
badge del dashboard ("Falta CTL", "Docs OK").
"""
from __future__ import annotations

import json
import uuid
from typing import Any, Dict, List

from api.schemas.intake_cuestionario import DECLARACIONES_KEYS

_ESTADOS_ITEM = frozenset(["verificado", "rechazado"])


def items_checklist(declaraciones: Dict[str, Any] | None) -> List[Dict[str, Any]]:
    """Puro: un item por cada clave del cuestionario legal (DECLARACIONES_KEYS).

    declarado = lo que dijo el owner (o None si no respondió). NO hardcodea la
    lista — la toma del schema del cuestionario (paso 4).
    """
    declaraciones = declaraciones or {}
    return [
        {"clave": clave, "declarado": declaraciones.get(clave)}
        for clave in sorted(DECLARACIONES_KEYS)
    ]


async def generar_checklist(intake: Any, pool: Any) -> int:
    """Crea un due_diligence_item 'pendiente' por cada declaración. Devuelve count."""
    items = items_checklist(getattr(intake, "declaraciones", None))
    async with pool.acquire() as conn:
        for it in items:
            await conn.execute(
                "INSERT INTO due_diligence_item "
                "(id, intake_id, clave, declarado, estado) "
                "VALUES ($1, $2, $3, $4::jsonb, 'pendiente')",
                str(uuid.uuid4()), intake.id, it["clave"], json.dumps(it["declarado"]),
            )
    return len(items)


async def verificar_item(
    item_id: str, agent_id: str, estado: str, nota: str | None, pool: Any
) -> None:
    """Marca un item como verificado|rechazado con quién y cuándo."""
    if estado not in _ESTADOS_ITEM:
        raise ValueError(f"Estado inválido: {estado!r} (usa verificado|rechazado)")
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE due_diligence_item SET estado = $1, nota = $2, "
            "verificado_por = $3, verificado_at = NOW() WHERE id = $4",
            estado, nota, agent_id, item_id,
        )


async def checklist_verificado(intake_id: str, pool: Any) -> bool:
    """True si TODOS los items quedaron 'verificado' (ninguno pendiente/rechazado).

    Condición para levantar listing.verificado — un item rechazado completa el
    checklist pero NO otorga el sello.
    """
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT COUNT(*) AS total, "
            "COUNT(*) FILTER (WHERE estado = 'verificado') AS ok "
            "FROM due_diligence_item WHERE intake_id = $1",
            intake_id,
        )
    return row["total"] > 0 and row["total"] == row["ok"]


async def checklist_completo(intake_id: str, pool: Any) -> bool:
    """True si no queda ningún item 'pendiente' para el intake."""
    async with pool.acquire() as conn:
        pendientes = await conn.fetchval(
            "SELECT COUNT(*) FROM due_diligence_item "
            "WHERE intake_id = $1 AND estado = 'pendiente'",
            intake_id,
        )
    return pendientes == 0
