import logging
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field

from api.db import get_pool
from api.limiter import limiter

logger = logging.getLogger(__name__)
router = APIRouter()


class AplicarPasantiaIn(BaseModel):
    nombre: str = Field(min_length=1, max_length=120)
    email: EmailStr = Field(max_length=254)
    telefono: Optional[str] = Field(None, max_length=30)
    programa_semestre: str = Field(min_length=1, max_length=120)
    ruta_interes: str = Field(min_length=1, max_length=120)
    mensaje: Optional[str] = Field(None, max_length=1000)


class AplicarOut(BaseModel):
    ok: bool
    aplicacion_id: int
    mensaje: str


@router.post("/aplicar", response_model=AplicarOut)
@limiter.limit("5/minute")
async def aplicar_pasantia(request: Request, body: AplicarPasantiaIn = Body(...), pool=Depends(get_pool)):
    # Dedup: mismo correo en las últimas 24 h → devolvemos la misma solicitud (sin duplicar fila ni push a GHL).
    previa = await pool.fetchval(
        "SELECT id FROM public.aplicaciones_pasantia WHERE lower(email) = $1 AND created_at > NOW() - INTERVAL '24 hours' LIMIT 1",
        body.email.lower(),
    )
    if previa:
        return AplicarOut(ok=True, aplicacion_id=previa, mensaje="¡Recibimos tu aplicación! Te contactamos en menos de 48 horas.")
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
    from api.utils import ghl_client
    ghl_client.spawn(ghl_client.sync_contact_safe(body.email, body.nombre, body.telefono, ["pasante"], "pasantias"))
    return AplicarOut(
        ok=True,
        aplicacion_id=row["id"],
        mensaje="¡Recibimos tu aplicación! Te contactamos en menos de 48 horas.",
    )
