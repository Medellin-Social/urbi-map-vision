import logging
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from pydantic import BaseModel

from api.db import get_pool
from api.limiter import limiter

logger = logging.getLogger(__name__)
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
@limiter.limit("5/minute")
async def aplicar_pasantia(request: Request, body: AplicarPasantiaIn = Body(...), pool=Depends(get_pool)):
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
    except Exception:
        logger.exception("Error inesperado")
        raise HTTPException(status_code=500, detail="Error interno del servidor")
    return AplicarOut(
        ok=True,
        aplicacion_id=row["id"],
        mensaje="¡Recibimos tu aplicación! Te contactamos en menos de 48 horas.",
    )
