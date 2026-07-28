"""Moderación de la publicación inicial del listing (admin)."""
from __future__ import annotations

from types import SimpleNamespace

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel  # noqa: F401 (usado en RechazoRequest)

from api.db import get_pool
from api.routers.admin import require_admin
from api.services.listing_service import EstadoError
from api.services.moderacion_service import aprobar, rechazar

router = APIRouter()


class RechazoRequest(BaseModel):
    motivo: str


async def _cargar_listing(listing_id: str, pool):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, estado, published_at FROM listing WHERE id = $1", listing_id
        )
    if not row:
        raise HTTPException(status_code=404, detail="Listing no encontrado")
    return SimpleNamespace(**dict(row))


@router.post("/listings/{listing_id}/aprobar")
async def aprobar_listing(listing_id: str, admin: dict = Depends(require_admin), pool=Depends(get_pool)):
    listing = await _cargar_listing(listing_id, pool)
    try:
        await aprobar(listing, admin["email"], pool)
    except EstadoError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return {"id": listing_id, "estado": "publicado"}


@router.post("/listings/{listing_id}/rechazar")
async def rechazar_listing(
    listing_id: str, req: RechazoRequest,
    admin: dict = Depends(require_admin), pool=Depends(get_pool),
):
    listing = await _cargar_listing(listing_id, pool)
    try:
        await rechazar(listing, admin["email"], req.motivo, pool)
    except (EstadoError, ValueError) as e:
        raise HTTPException(status_code=409, detail=str(e))
    return {"id": listing_id, "estado": "rechazado"}


@router.get("/listings/en-revision")
async def listar_en_revision(admin: dict = Depends(require_admin), pool=Depends(get_pool)):
    """Listings de propietario pendientes de aprobación (estado = en_revision)."""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT l.id::text, l.operacion::text AS tipo_operacion,
                   l.tipo_inmueble::text, l.precio AS precio_cop,
                   l.barrio, l.municipio, l.estado::text,
                   l.nombre_contacto, l.telefono, l.email_contacto,
                   l.created_at,
                   (SELECT array_agg(m.url ORDER BY m.orden)
                    FROM listing_media m WHERE m.listing_id = l.id) AS fotos
            FROM listing l
            WHERE l.estado = 'en_revision'
            ORDER BY l.created_at ASC
            """
        )
    return [dict(r) for r in rows]
