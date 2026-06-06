from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.db import get_pool

router = APIRouter()


class AplicarAfiliadoIn(BaseModel):
    nombre: str
    email: str
    telefono: Optional[str] = None
    canal: Optional[str] = None


class AplicarOut(BaseModel):
    ok: bool
    aplicacion_id: int
    mensaje: str


@router.post("/aplicar", response_model=AplicarOut)
async def aplicar_afiliado(body: AplicarAfiliadoIn, pool=Depends(get_pool)):
    try:
        row = await pool.fetchrow(
            """
            INSERT INTO public.aplicaciones_afiliado
                (nombre, email, telefono, canal)
            VALUES ($1, $2, $3, $4)
            RETURNING id
            """,
            body.nombre, body.email, body.telefono, body.canal,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return AplicarOut(
        ok=True,
        aplicacion_id=row["id"],
        mensaje="¡Solicitud recibida! Te enviamos tu código de afiliado en 24 horas.",
    )
