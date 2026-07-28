"""Compra de zonas patrocinadas por el realtor (self-serve).

Flujo: /disponibles (ver libres) → /checkout (crear pago) → pasarela → webhook
APROBADO → procesar_pago_zona (auto-asigna). Sin pasarela conectada, /checkout
devuelve modo 'simulado' y /confirmar-simulado completa el pago en dev.

⚠️ La zona SOLO se asigna tras pago verificado (webhook o confirmador dev), nunca
desde el redirect de éxito del front.
"""
from __future__ import annotations

import os

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from api.db import get_pool
from api.dependencies import get_current_user
from api.services.zona_sponsor_service import (
    ZonaOcupadaError, get_or_create_agency, precio_zona, procesar_pago_zona, zona_ocupada_por_otro,
)

router = APIRouter()


def _gateway_configurado() -> bool:
    return bool(os.getenv("WOMPI_PRIVATE_KEY") or os.getenv("STRIPE_SECRET_KEY"))


async def _agente_activo(user: dict, pool) -> str:
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT id, estado::text AS estado FROM agent WHERE usuario_id = $1", user.get("id"))
    if not row:
        raise HTTPException(status_code=403, detail="No eres agente")
    if row["estado"] != "activo":
        raise HTTPException(status_code=403, detail="Tu cuenta de agente no está activa")
    return str(row["id"])


@router.get("/disponibles")
async def zonas_disponibles(user: dict = Depends(get_current_user), pool=Depends(get_pool)):
    """Catálogo de zonas (Medellín) + cuáles están ocupadas (patrocinador activo)."""
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
        ocup = await conn.fetch(
            "SELECT zona_nivel::text AS nivel, zona_codigo FROM sponsorship "
            "WHERE estado = 'activa' AND CURRENT_DATE BETWEEN fecha_inicio AND fecha_fin"
        )
    return {
        "comunas": [{"cd_comuna": r["cd_comuna"], "nombre": r["nombre"]} for r in comunas],
        "barrios": [{"id": r["id"], "nombre": r["nombre"], "cd_comuna": r["cd_comuna"]} for r in barrios],
        "ocupadas": {
            "comuna": [r["zona_codigo"] for r in ocup if r["nivel"] == "comuna"],
            "barrio": [r["zona_codigo"] for r in ocup if r["nivel"] == "barrio"],
        },
        "precios": {"comuna": precio_zona("comuna"), "barrio": precio_zona("barrio")},
    }


class ZonaCheckout(BaseModel):
    zona_nivel: str
    zona_codigo: str
    meses: int = Field(default=1, ge=1, le=12)


@router.post("/checkout")
async def checkout(body: ZonaCheckout, user: dict = Depends(get_current_user), pool=Depends(get_pool)):
    """Inicia la compra de una zona. Devuelve checkout_url (pasarela) o modo simulado."""
    if body.zona_nivel not in ("comuna", "barrio"):
        raise HTTPException(status_code=400, detail="zona_nivel debe ser comuna o barrio")
    agent_id = await _agente_activo(user, pool)
    async with pool.acquire() as conn:
        agency_id = await get_or_create_agency(conn, agent_id)
        if await zona_ocupada_por_otro(conn, body.zona_nivel, body.zona_codigo, agency_id):
            raise HTTPException(status_code=409, detail="Esa zona ya tiene patrocinador")
    precio = precio_zona(body.zona_nivel)

    if _gateway_configurado():
        # TODO(wompi): crear link de pago con metadata {tipo:'zona', agent_id,
        # zona_nivel, zona_codigo, meses}; el webhook APROBADO llama procesar_pago_zona.
        raise HTTPException(status_code=501, detail="Checkout de zona con pasarela pendiente de cablear")
    return {
        "modo": "simulado",
        "zona_nivel": body.zona_nivel, "zona_codigo": body.zona_codigo, "meses": body.meses,
        "precio_mensual": precio, "total": precio * body.meses,
        "mensaje": "Pasarela no conectada. Confirma con /zonas/confirmar-simulado (solo dev).",
    }


@router.post("/confirmar-simulado")
async def confirmar_simulado(body: ZonaCheckout, user: dict = Depends(get_current_user), pool=Depends(get_pool)):
    """DEV: simula el webhook de pago aprobado → asigna la zona. Deshabilitado
    cuando hay pasarela real configurada (ahí manda el webhook)."""
    if _gateway_configurado():
        raise HTTPException(status_code=403, detail="Pasarela real activa — el pago se confirma por webhook")
    agent_id = await _agente_activo(user, pool)
    try:
        sid = await procesar_pago_zona(pool, agent_id, body.zona_nivel, body.zona_codigo, body.meses)
    except ZonaOcupadaError:
        raise HTTPException(status_code=409, detail="Esa zona ya tiene patrocinador")
    return {"ok": True, "sponsorship_id": sid, "estado": "activa"}
