from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.db import get_pool

router = APIRouter()


class AplicarPasantiaIn(BaseModel):
    nombre: str
    email: str
    telefono: Optional[str] = None
    programa_semestre: str
    ruta_interes: str
    mensaje: Optional[str] = None


class AplicarOut(BaseModel):
    ok: bool
    aplicacion_id: int
    mensaje: str


@router.post("/aplicar", response_model=AplicarOut)
async def aplicar_pasantia(body: AplicarPasantiaIn, pool=Depends(get_pool)):
    try:
        row = await pool.fetchrow(
            """
            INSERT INTO public.aplicaciones_pasantia
                (nombre, email, telefono, programa_semestre, ruta_interes, mensaje)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
            """,
            body.nombre, body.email, body.telefono,
            body.programa_semestre, body.ruta_interes, body.mensaje,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return AplicarOut(
        ok=True,
        aplicacion_id=row["id"],
        mensaje="¡Recibimos tu aplicación! Te contactamos en menos de 48 horas.",
    )
