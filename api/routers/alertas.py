"""Alertas de precio — notify Pro users when listings match their criteria."""
from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from api.db import get_pool
from api.dependencies import get_current_user

router = APIRouter()


class AlertaCreate(BaseModel):
    barrio_id: int
    tipo_operacion: str
    precio_max: Optional[float] = None
    tipo_inmueble: Optional[str] = None


@router.post("", status_code=201)
async def crear_alerta(
    body: AlertaCreate,
    current_user: dict = Depends(get_current_user),
):
    pool = get_pool()
    row = await pool.fetchrow(
        """
        INSERT INTO public.alertas_precio
            (usuario_id, barrio_id, tipo_operacion, precio_max, tipo_inmueble)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, barrio_id, tipo_operacion, precio_max, tipo_inmueble, activa
        """,
        current_user["id"], body.barrio_id, body.tipo_operacion,
        body.precio_max, body.tipo_inmueble,
    )
    return dict(row)


@router.get("/mis")
async def mis_alertas(current_user: dict = Depends(get_current_user)):
    pool = get_pool()
    rows = await pool.fetch(
        """
        SELECT a.id, a.barrio_id, b.nombre AS barrio_nombre,
               a.tipo_operacion, a.precio_max, a.tipo_inmueble,
               a.activa, a.fecha_creacion
        FROM public.alertas_precio a
        JOIN raw.barrios b ON b.id = a.barrio_id
        WHERE a.usuario_id = $1
        ORDER BY a.fecha_creacion DESC
        """,
        current_user["id"],
    )
    return [dict(r) for r in rows]


@router.delete("/{alerta_id}", status_code=204)
async def desactivar_alerta(
    alerta_id: int,
    current_user: dict = Depends(get_current_user),
):
    pool = get_pool()
    await pool.execute(
        "UPDATE public.alertas_precio SET activa = false WHERE id = $1 AND usuario_id = $2",
        alerta_id, current_user["id"],
    )
