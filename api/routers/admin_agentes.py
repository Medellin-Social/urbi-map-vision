"""Verificación manual de agentes (admin) — cola + aprobar/rechazar/suspender."""
from __future__ import annotations

from types import SimpleNamespace

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from api.db import get_pool
from api.routers.admin import require_admin
from api.services.agent_service import (
    AgentError, aprobar_agente, rechazar_agente, suspender_agente,
)

router = APIRouter()


class MotivoRequest(BaseModel):
    motivo: str


async def _cargar_agent(agent_id: str, pool):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, estado, usuario_id FROM agent WHERE id = $1", agent_id
        )
    if not row:
        raise HTTPException(status_code=404, detail="Agente no encontrado")
    return SimpleNamespace(**dict(row))


@router.get("/agentes")
async def cola_agentes(estado: str = Query("pendiente"), admin: dict = Depends(require_admin), pool=Depends(get_pool)):
    """Cola de verificación. Por defecto los 'pendiente'."""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, email, nombre, telefono, estado, usuario_id, created_at "
            "FROM agent WHERE estado = $1 ORDER BY created_at ASC",
            estado,
        )
    return [dict(r) for r in rows]


@router.post("/agentes/{agent_id}/aprobar")
async def aprobar(agent_id: str, admin: dict = Depends(require_admin), pool=Depends(get_pool)):
    agent = await _cargar_agent(agent_id, pool)
    try:
        await aprobar_agente(agent, admin["email"], pool)
    except AgentError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return {"id": agent_id, "estado": "activo"}


@router.post("/agentes/{agent_id}/rechazar")
async def rechazar(agent_id: str, req: MotivoRequest, admin: dict = Depends(require_admin), pool=Depends(get_pool)):
    agent = await _cargar_agent(agent_id, pool)
    try:
        await rechazar_agente(agent, admin["email"], req.motivo, pool)
    except AgentError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return {"id": agent_id, "estado": "rechazado"}


@router.post("/agentes/{agent_id}/suspender")
async def suspender(agent_id: str, req: MotivoRequest, admin: dict = Depends(require_admin), pool=Depends(get_pool)):
    agent = await _cargar_agent(agent_id, pool)
    try:
        await suspender_agente(agent, admin["email"], req.motivo, pool)
    except AgentError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return {"id": agent_id, "estado": "inactivo"}
