"""Realtor intake — captación del inventario del owner + cuestionario."""
from __future__ import annotations

import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from api.db import get_pool
from api.dependencies import get_current_user
from api.schemas.intake_cuestionario import cuestionario_para
from api.services.intake_service import IntakeError, crear_intake

router = APIRouter()


# ── Models ────────────────────────────────────────────────────────────────────

class IntakeCreateRequest(BaseModel):
    operacion: str          # 'venta' | 'arriendo'
    tipo_inmueble: str
    geom: str               # WKT Point "POINT(lon lat)"
    direccion_aprox: Optional[str] = None
    precio_esperado: Optional[float] = None
    area_m2: Optional[float] = None
    habitaciones: Optional[int] = None
    banos: Optional[int] = None
    # Declaraciones legales (autoreporte)
    en_propiedad_horizontal: Optional[bool] = None
    al_dia_administracion: Optional[bool] = None
    al_dia_predial: Optional[bool] = None
    tiene_hipoteca: Optional[bool] = None
    tiene_escritura: Optional[bool] = None
    servicios_al_dia: Optional[bool] = None
    estado_civil: Optional[str] = None
    es_persona_juridica: Optional[bool] = None
    notas_owner: Optional[str] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/intake", status_code=201)
async def crear_intake_endpoint(
    req: IntakeCreateRequest,
    user: dict = Depends(get_current_user),
    pool=Depends(get_pool),
):
    """Owner crea una solicitud de captación. Valida cuestionario, resuelve zona,
    guarda en 'nuevo'."""
    owner_id = user.get("id")
    if not owner_id:
        raise HTTPException(status_code=403, detail="No owner linked to user")

    payload = req.model_dump(exclude={"operacion", "tipo_inmueble", "geom"})
    try:
        intake = await crear_intake(
            owner_id=owner_id,
            geom=req.geom,
            operacion=req.operacion,
            tipo_inmueble=req.tipo_inmueble,
            payload=payload,
            pool=pool,
        )
    except (IntakeError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))

    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO intake (
                id, owner_id, estado, operacion, tipo_inmueble, geom, municipio,
                barrio, zona_nivel, zona_codigo, direccion_aprox, precio_esperado,
                area_m2, habitaciones, banos, declaraciones, notas_owner
            ) VALUES (
                $1, $2, $3, $4, $5, ST_GeomFromText($6, 4326), $7, $8, $9, $10,
                $11, $12, $13, $14, $15, $16::jsonb, $17
            )
            """,
            intake["id"], intake["owner_id"], intake["estado"],
            intake["operacion"], intake["tipo_inmueble"], req.geom,
            intake["municipio"], intake["barrio"], intake["zona_nivel"],
            intake["zona_codigo"], intake["direccion_aprox"],
            intake["precio_esperado"], intake["area_m2"],
            intake["habitaciones"], intake["banos"],
            json.dumps(intake["declaraciones"]), intake["notas_owner"],
        )

    return {"id": intake["id"], "estado": "nuevo"}


@router.get("/intake/mias")
async def mis_intakes(
    user: dict = Depends(get_current_user),
    pool=Depends(get_pool),
):
    """Owner ve sus propias solicitudes."""
    owner_id = user.get("id")
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, estado, operacion, tipo_inmueble, zona_codigo, created_at "
            "FROM intake WHERE owner_id = $1 ORDER BY created_at DESC",
            owner_id,
        )
    return [dict(r) for r in rows]


@router.get("/intake/{intake_id}")
async def get_intake(
    intake_id: str,
    user: dict = Depends(get_current_user),
    pool=Depends(get_pool),
):
    """Detalle del intake (owner dueño o realtor asignado)."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM intake WHERE id = $1", intake_id)
    if not row:
        raise HTTPException(status_code=404)

    uid = str(user.get("id"))
    if str(row["owner_id"]) != uid and str(row["agent_id"]) != uid:
        raise HTTPException(status_code=403)
    return dict(row)


@router.get("/intake/{intake_id}/due-diligence")
async def get_due_diligence(
    intake_id: str,
    user: dict = Depends(get_current_user),
    pool=Depends(get_pool),
):
    """Checklist de due diligence del intake (alimenta el badge del dashboard)."""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, clave, declarado, estado, nota, verificado_por, verificado_at "
            "FROM due_diligence_item WHERE intake_id = $1 ORDER BY clave",
            intake_id,
        )
    items = [dict(r) for r in rows]
    return {
        "intake_id": intake_id,
        "items": items,
        "completo": all(i["estado"] != "pendiente" for i in items) if items else False,
    }


@router.get("/cuestionario")
async def get_cuestionario(operacion: str = Query(...)):
    """Devuelve el esquema del cuestionario para el front (venta | arriendo)."""
    try:
        cuestionario = cuestionario_para(operacion)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return [
        {
            "id": p["id"],
            "texto": p["texto"],
            "tipo": p["tipo"],
            "obligatoria": p.get("obligatoria", False),
            "condicional_si": p.get("condicional_si"),
        }
        for p in cuestionario
    ]
