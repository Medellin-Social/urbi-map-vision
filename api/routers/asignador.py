"""Asignador de intakes — asignar / pool / tomar."""
from __future__ import annotations

from types import SimpleNamespace
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from api.db import get_pool
from api.dependencies import get_current_user
from api.routers.admin import require_admin
from api.services.asignador_service import (
    AsignadorError, asignar_intake, sweep_asignados_vencidos, tomar_del_pool,
)

router = APIRouter()


async def _agent_del_usuario(user: dict, pool) -> SimpleNamespace:
    """Resuelve el agent vinculado al usuario autenticado."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, estado, usuario_id FROM agent WHERE usuario_id = $1",
            user.get("id"),
        )
    if not row:
        raise HTTPException(status_code=403, detail="El usuario no es un agente")
    return SimpleNamespace(**dict(row))


# admin-only: la asignación es una decisión de operaciones. Idealmente se
# auto-dispara al crear el intake (paso 4) — dejarlo manual da control mientras
# se estabiliza el reparto. Cuando madure: llamar asignar_intake en crear_intake.
@router.post("/intake/{intake_id}/asignar")
async def asignar(intake_id: str, admin: dict = Depends(require_admin), pool=Depends(get_pool)):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, estado, zona_nivel, zona_codigo, agent_id FROM intake WHERE id = $1",
            intake_id,
        )
    if not row:
        raise HTTPException(status_code=404, detail="Intake no encontrado")
    intake = SimpleNamespace(**dict(row), geom=None)
    try:
        return await asignar_intake(intake, pool)
    except AsignadorError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.get("/pool")
async def ver_pool(
    barrio_id: Optional[str] = Query(None, description="Filtra por zona (barrio_id)"),
    user: dict = Depends(get_current_user),
    pool=Depends(get_pool),
):
    """Intakes en el pool abierto, filtrables por zona del agente."""
    await sweep_asignados_vencidos(pool)
    async with pool.acquire() as conn:
        if barrio_id:
            rows = await conn.fetch(
                "SELECT id, operacion, tipo_inmueble, zona_codigo, barrio, municipio, "
                "created_at FROM intake WHERE estado = 'en_pool' AND zona_codigo = $1 "
                "ORDER BY created_at ASC",
                barrio_id,
            )
        else:
            rows = await conn.fetch(
                "SELECT id, operacion, tipo_inmueble, zona_codigo, barrio, municipio, "
                "created_at FROM intake WHERE estado = 'en_pool' ORDER BY created_at ASC"
            )
    return [dict(r) for r in rows]


@router.post("/pool/{intake_id}/tomar")
async def tomar(intake_id: str, user: dict = Depends(get_current_user), pool=Depends(get_pool)):
    """El agente autenticado toma un intake del pool (carrera resuelta en DB)."""
    agent = await _agent_del_usuario(user, pool)
    try:
        return await tomar_del_pool(intake_id, agent, pool)
    except AsignadorError as e:
        raise HTTPException(status_code=403, detail=str(e))
