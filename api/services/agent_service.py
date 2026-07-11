"""Verificación manual de agentes — aprobar / rechazar / suspender.

Ciclo de vida: pendiente → activo (aprobar) → inactivo (suspender).
                pendiente → rechazado (rechazar).

Solo un agent 'activo' opera y recibe asignaciones. ESTADOS_ASIGNABLES es la
verdad única que el asignador (paso 5, aún no creado) DEBE consultar: filtra por
estado='activo', NO por "no rechazado" — un 'inactivo'/'pendiente' no toma pool.
"""
from __future__ import annotations

from typing import Any, FrozenSet

# El asignador debe filtrar candidatos por este set. NO incluye inactivo/pendiente.
ESTADOS_ASIGNABLES: FrozenSet[str] = frozenset(["activo"])


class AgentError(ValueError):
    """Error de dominio en el ciclo de vida del agente."""


def _val(x: Any) -> Any:
    return x.value if hasattr(x, "value") else x


async def aprobar_agente(agent: Any, admin_id: str, pool: Any) -> None:
    """pendiente → activo. Respeta chk_agent_activo_requires_usuario: si el agent
    no tiene cuenta vinculada, rechaza ANTES de tocar la DB (no revienta el CHECK)."""
    if _val(agent.estado) != "pendiente":
        raise AgentError(f"Solo se aprueba un agente 'pendiente' (está {_val(agent.estado)})")
    if getattr(agent, "usuario_id", None) is None:
        raise AgentError("El agente debe tener cuenta antes de activarse")
    async with pool.acquire() as conn:
        await conn.execute("UPDATE agent SET estado = 'activo' WHERE id = $1", agent.id)
    agent.estado = "activo"


async def rechazar_agente(agent: Any, admin_id: str, motivo: str, pool: Any) -> None:
    """pendiente → rechazado, guarda el motivo."""
    if _val(agent.estado) != "pendiente":
        raise AgentError(f"Solo se rechaza un agente 'pendiente' (está {_val(agent.estado)})")
    if not motivo:
        raise AgentError("El rechazo requiere un motivo")
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE agent SET estado = 'rechazado', motivo_estado = $2 WHERE id = $1",
            agent.id, motivo,
        )
    agent.estado = "rechazado"


async def suspender_agente(agent: Any, admin_id: str, motivo: str, pool: Any) -> None:
    """activo → inactivo. Desactiva sin borrar; deja reasignar sus listings antes
    de dar de baja (por el RESTRICT de listing.agent_id)."""
    if _val(agent.estado) != "activo":
        raise AgentError(f"Solo se suspende un agente 'activo' (está {_val(agent.estado)})")
    if not motivo:
        raise AgentError("La suspensión requiere un motivo")
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE agent SET estado = 'inactivo', motivo_estado = $2 WHERE id = $1",
            agent.id, motivo,
        )
    agent.estado = "inactivo"
