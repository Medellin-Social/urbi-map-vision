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


# ── Zonas del realtor (asignar/quitar patrocinio comuna/barrio) ───────────────
from api.services.zona_sponsor_service import (
    ZonaOcupadaError, asignar_zona as svc_asignar_zona,
)


@router.get("/agentes/{agent_id}/zonas")
async def zonas_agente(agent_id: str, admin: dict = Depends(require_admin), pool=Depends(get_pool)):
    """Zonas (sponsorships) de la agencia del agente, con nombre resuelto."""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT s.id, s.zona_nivel::text AS zona_nivel, s.zona_codigo, s.tier,
                   s.precio_mensual, s.fecha_inicio, s.fecha_fin, s.estado::text AS estado,
                   CASE
                     WHEN s.zona_nivel = 'comuna' THEN
                       (SELECT INITCAP(LOWER(b.comuna)) FROM raw.barrios b
                        JOIN analytics.barrios_cd bc ON bc.barrio_id = b.id
                        WHERE bc.cd_comuna::text = s.zona_codigo LIMIT 1)
                     WHEN s.zona_nivel = 'barrio' THEN
                       (SELECT INITCAP(LOWER(nombre)) FROM raw.barrios WHERE id::text = s.zona_codigo)
                     ELSE s.zona_codigo
                   END AS nombre
            FROM sponsorship s
            JOIN agency_member am ON am.agency_id = s.agency_id
            WHERE am.agent_id = $1
            ORDER BY s.estado, s.fecha_fin DESC
            """,
            agent_id,
        )
    return [
        {**dict(r), "precio_mensual": float(r["precio_mensual"] or 0),
         "fecha_inicio": r["fecha_inicio"].isoformat(), "fecha_fin": r["fecha_fin"].isoformat()}
        for r in rows
    ]


class ZonaCreate(BaseModel):
    zona_nivel: str            # comuna | barrio
    zona_codigo: str           # cd_comuna (comuna) | barrio_id (barrio)
    meses: int = 12
    precio_mensual: float | None = None


@router.post("/agentes/{agent_id}/zonas", status_code=201)
async def asignar_zona_admin(agent_id: str, body: ZonaCreate, admin: dict = Depends(require_admin), pool=Depends(get_pool)):
    """Asignación manual (admin). Usa el mismo servicio que el webhook de pago."""
    await _cargar_agent(agent_id, pool)  # 404 si no existe
    try:
        async with pool.acquire() as conn:
            async with conn.transaction():
                sid = await svc_asignar_zona(conn, agent_id, body.zona_nivel, body.zona_codigo, body.meses, body.precio_mensual)
    except ValueError:
        raise HTTPException(status_code=400, detail="zona_nivel debe ser comuna o barrio")
    except ZonaOcupadaError:
        raise HTTPException(status_code=409, detail="Esa zona ya tiene patrocinador activo")
    return {"id": sid, "estado": "activa"}


@router.delete("/sponsorship/{sponsorship_id}", status_code=204)
async def quitar_zona(sponsorship_id: str, admin: dict = Depends(require_admin), pool=Depends(get_pool)):
    async with pool.acquire() as conn:
        r = await conn.execute("DELETE FROM sponsorship WHERE id = $1", sponsorship_id)
    if r.endswith("0"):
        raise HTTPException(status_code=404, detail="Zona no encontrada")


@router.get("/zonas-catalogo")
async def zonas_catalogo(admin: dict = Depends(require_admin), pool=Depends(get_pool)):
    """Comunas + barrios de Medellín para el selector de zonas."""
    async with pool.acquire() as conn:
        comunas = await conn.fetch(
            "SELECT DISTINCT bc.cd_comuna, INITCAP(LOWER(b.comuna)) AS nombre "
            "FROM analytics.barrios_cd bc JOIN raw.barrios b ON b.id = bc.barrio_id "
            "WHERE b.municipio ILIKE '%medellin%' AND bc.cd_comuna IS NOT NULL ORDER BY bc.cd_comuna"
        )
        barrios = await conn.fetch(
            "SELECT b.id, INITCAP(LOWER(b.nombre)) AS nombre, bc.cd_comuna "
            "FROM raw.barrios b JOIN analytics.barrios_cd bc ON bc.barrio_id = b.id "
            "WHERE b.municipio ILIKE '%medellin%' AND bc.cd_comuna IS NOT NULL ORDER BY b.nombre"
        )
    return {
        "comunas": [{"cd_comuna": r["cd_comuna"], "nombre": r["nombre"]} for r in comunas],
        "barrios": [{"id": r["id"], "nombre": r["nombre"], "cd_comuna": r["cd_comuna"]} for r in barrios],
    }
