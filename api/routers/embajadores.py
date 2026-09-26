import logging
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from pydantic import BaseModel

from api.db import get_pool
from api.limiter import limiter
from api.utils import ghl_client

logger = logging.getLogger(__name__)
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
@limiter.limit("5/minute")
async def aplicar_embajador(request: Request, body: AplicarEmbajadorIn = Body(...), pool=Depends(get_pool)):
    try:
        row = await pool.fetchrow(
            """
            INSERT INTO public.aplicacion_referidor
                (tipo, nombre, email, telefono, barrio_id, experiencia, motivacion)
            VALUES ('embajador', $1, $2, $3, $4, $5, $6)
            RETURNING id
            """,
            body.nombre, body.email, body.telefono,
            body.barrio_id, body.experiencia, body.motivacion,
        )
    except Exception:
        logger.exception("Error inesperado")
        raise HTTPException(status_code=500, detail="Error interno del servidor")

    try:
        await ghl_client.sync_referidor(row["id"])
    except Exception:
        logger.exception("sync_referidor(%s) falló", row["id"])  # best-effort, no bloquea la aplicación

    return AplicarOut(
        ok=True,
        aplicacion_id=row["id"],
        mensaje="¡Recibimos tu aplicación! Revisamos tu perfil y te contactamos en 48 horas.",
    )
