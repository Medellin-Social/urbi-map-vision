from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.db import get_pool

router = APIRouter()


class AplicarEmbajadorIn(BaseModel):
    nombre: str
    email: str
    telefono: Optional[str] = None
    barrio_id: Optional[int] = None
    experiencia: Optional[str] = None
    motivacion: Optional[str] = None


class AplicarOut(BaseModel):
    ok: bool
    aplicacion_id: int
    mensaje: str


@router.post("/aplicar", response_model=AplicarOut)
async def aplicar_embajador(body: AplicarEmbajadorIn, pool=Depends(get_pool)):
    try:
        row = await pool.fetchrow(
            """
            INSERT INTO public.aplicaciones_embajador
                (nombre, email, telefono, barrio_id, experiencia, motivacion)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
            """,
            body.nombre, body.email, body.telefono,
            body.barrio_id, body.experiencia, body.motivacion,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return AplicarOut(
        ok=True,
        aplicacion_id=row["id"],
        mensaje="¡Recibimos tu aplicación! Revisamos tu perfil y te contactamos en 48 horas.",
    )
