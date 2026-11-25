import logging
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field

from api.db import get_pool
from api.limiter import limiter
from api.utils import ghl_client

logger = logging.getLogger(__name__)
router = APIRouter()


class AplicarAfiliadoIn(BaseModel):
    nombre: str = Field(min_length=1, max_length=120)
    email: EmailStr = Field(max_length=254)
    telefono: Optional[str] = Field(None, max_length=30)
    canal: Optional[str] = Field(None, max_length=200)


class AplicarOut(BaseModel):
    ok: bool
    aplicacion_id: int
    mensaje: str


@router.post("/aplicar", response_model=AplicarOut)
@limiter.limit("5/minute")
async def aplicar_afiliado(request: Request, body: AplicarAfiliadoIn = Body(...), pool=Depends(get_pool)):
    # Dedup: mismo correo en las últimas 24 h → devolvemos la misma solicitud (sin duplicar fila ni push a GHL).
    previa = await pool.fetchval(
        "SELECT id FROM public.aplicacion_referidor WHERE lower(email) = $1 AND tipo = 'afiliado' AND created_at > NOW() - INTERVAL '24 hours' LIMIT 1",
        body.email.lower(),
    )
    if previa:
        return AplicarOut(ok=True, aplicacion_id=previa, mensaje="¡Solicitud recibida! Te enviamos tu código de afiliado en 24 horas.")
    try:
        row = await pool.fetchrow(
            """
            INSERT INTO public.aplicacion_referidor
                (tipo, nombre, email, telefono, canal)
            VALUES ('afiliado', $1, $2, $3, $4)
            RETURNING id
            """,
            body.nombre, body.email, body.telefono, body.canal,
        )
    except Exception:
        logger.exception("Error inesperado")
        raise HTTPException(status_code=500, detail="Error interno del servidor")

    ghl_client.spawn(ghl_client.sync_referidor(row["id"]))  # background, best-effort

    return AplicarOut(
        ok=True,
        aplicacion_id=row["id"],
        mensaje="¡Solicitud recibida! Te enviamos tu código de afiliado en 24 horas.",
    )
