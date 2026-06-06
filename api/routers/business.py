from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr

from api.db import get_pool

router = APIRouter()


# ── Planes ────────────────────────────────────────────────────────────────────

class PlanOut(BaseModel):
    id: int
    nombre: str
    tipo: str
    precio_usd: Optional[float]
    precio_cop: Optional[float]
    descripcion: Optional[str]
    features: Any


@router.get("/planes", response_model=list[PlanOut])
async def get_planes(pool=Depends(get_pool)):
    try:
        rows = await pool.fetch(
            "SELECT id, nombre, tipo, precio_usd, precio_cop, descripcion, features "
            "FROM public.planes_negocio WHERE activo = TRUE ORDER BY precio_usd ASC"
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return [
        PlanOut(
            id=r["id"], nombre=r["nombre"], tipo=r["tipo"],
            precio_usd=float(r["precio_usd"]) if r["precio_usd"] is not None else None,
            precio_cop=float(r["precio_cop"]) if r["precio_cop"] is not None else None,
            descripcion=r["descripcion"], features=r["features"],
        )
        for r in rows
    ]


# ── Aplicar (lead form) ───────────────────────────────────────────────────────

class AplicarIn(BaseModel):
    nombre_negocio: str
    email: str
    telefono: Optional[str] = None
    categoria: Optional[str] = None
    barrio_id: Optional[int] = None
    plan_tipo: Optional[str] = None
    mensaje: Optional[str] = None


class AplicarOut(BaseModel):
    ok: bool
    lead_id: int
    mensaje: str


@router.post("/aplicar", response_model=AplicarOut)
async def aplicar_negocio(body: AplicarIn, pool=Depends(get_pool)):
    try:
        row = await pool.fetchrow(
            """
            INSERT INTO public.leads_negocio
                (nombre_negocio, email, telefono, categoria, barrio_id, plan_tipo, mensaje)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id
            """,
            body.nombre_negocio, body.email, body.telefono,
            body.categoria, body.barrio_id, body.plan_tipo, body.mensaje,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return AplicarOut(
        ok=True,
        lead_id=row["id"],
        mensaje="Gracias por tu interés. Te contactaremos en las próximas 24 horas.",
    )


# ── Deals ─────────────────────────────────────────────────────────────────────

class DealOut(BaseModel):
    id: int
    tipo_deal: str
    descripcion: str
    categoria: Optional[str]
    tienda_nombre: str
    foto_url: Optional[str]
    lat: Optional[float]
    lon: Optional[float]
    barrio_nombre: Optional[str]


class DealsResponse(BaseModel):
    ciudad_id: int
    total: int
    deals: list[DealOut]


_DEALS_QUERY = """
SELECT
    d.id,
    d.tipo_deal,
    d.descripcion,
    d.categoria,
    t.nombre   AS tienda_nombre,
    COALESCE(d.foto_url, t.foto_url) AS foto_url,
    t.lat,
    t.lon,
    b.nombre   AS barrio_nombre
FROM public.deals d
JOIN public.tiendas t ON d.tienda_id = t.id
LEFT JOIN raw.barrios b ON COALESCE(d.barrio_id, t.barrio_id) = b.id
WHERE d.activo    = TRUE
  AND d.destacado = TRUE
  AND (d.fecha_fin IS NULL OR d.fecha_fin >= CURRENT_DATE)
  AND (
    ($2::int IS NOT NULL AND COALESCE(d.barrio_id, t.barrio_id) IN (
        SELECT id FROM raw.barrios b2
        WHERE ST_DWithin(
            b2.geometry,
            (SELECT geometry FROM raw.barrios WHERE id = $2),
            3000
        )
    ))
    OR ($2::int IS NULL AND d.ciudad_id = $1)
  )
ORDER BY d.created_at DESC
LIMIT 4
"""


@router.get("/deals", response_model=DealsResponse)
async def get_deals(
    ciudad_id: int = Query(1),
    barrio_id: Optional[int] = Query(None),
    pool=Depends(get_pool),
):
    try:
        rows = await pool.fetch(_DEALS_QUERY, ciudad_id, barrio_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    deals = [
        DealOut(
            id=r["id"], tipo_deal=r["tipo_deal"], descripcion=r["descripcion"],
            categoria=r["categoria"], tienda_nombre=r["tienda_nombre"],
            foto_url=r["foto_url"], lat=r["lat"], lon=r["lon"],
            barrio_nombre=r["barrio_nombre"],
        )
        for r in rows
    ]
    return DealsResponse(ciudad_id=ciudad_id, total=len(deals), deals=deals)


# ── Directorio Featured ───────────────────────────────────────────────────────

class DirectorioOut(BaseModel):
    id: int
    nombre: str
    categoria: str
    rating_google: Optional[float]
    google_place_id: Optional[str]
    foto_url: Optional[str]
    direccion: Optional[str]
    whatsapp: Optional[str]
    website: Optional[str]
    lat: Optional[float]
    lon: Optional[float]
    barrio_nombre: Optional[str]


class DirectorioResponse(BaseModel):
    ciudad_id: int
    total: int
    negocios: list[DirectorioOut]


_DIRECTORIO_CATEGORIAS = [
    "brunch", "cena", "gimnasios", "masajes_spa", "medicos",
    "cafes", "bares", "yoga", "dentistas", "peluquerias",
]

_DIRECTORIO_QUERY = """
WITH ranked AS (
    SELECT
        t.id, t.nombre, t.categoria, t.rating_google,
        t.google_place_id,
        t.foto_url, t.direccion, t.whatsapp, t.website,
        t.lat, t.lon,
        b.nombre AS barrio_nombre,
        ROW_NUMBER() OVER (
            PARTITION BY t.categoria
            ORDER BY t.rating_google DESC, t.nombre ASC
        ) AS rn
    FROM public.tiendas t
    LEFT JOIN raw.barrios b ON t.barrio_id = b.id
    WHERE t.activo        = TRUE
      AND t.rating_google >= 4.8
      AND t.categoria     = ANY($3::text[])
      AND (
        ($2::int IS NOT NULL AND t.barrio_id IN (
            SELECT id FROM raw.barrios b2
            WHERE ST_DWithin(
                b2.geometry,
                (SELECT geometry FROM raw.barrios WHERE id = $2),
                3000
            )
        ))
        OR ($2::int IS NULL AND t.ciudad_id = $1)
      )
)
SELECT * FROM ranked WHERE rn = 1 ORDER BY rating_google DESC LIMIT 4
"""


@router.get("/directorio", response_model=DirectorioResponse)
async def get_directorio(
    ciudad_id: int = Query(1),
    barrio_id: Optional[int] = Query(None),
    pool=Depends(get_pool),
):
    try:
        rows = await pool.fetch(_DIRECTORIO_QUERY, ciudad_id, barrio_id, _DIRECTORIO_CATEGORIAS)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    negocios = [
        DirectorioOut(
            id=r["id"], nombre=r["nombre"], categoria=r["categoria"],
            rating_google=r["rating_google"], google_place_id=r["google_place_id"],
            foto_url=r["foto_url"], direccion=r["direccion"],
            whatsapp=r["whatsapp"], website=r["website"],
            lat=r["lat"], lon=r["lon"], barrio_nombre=r["barrio_nombre"],
        )
        for r in rows
    ]
    return DirectorioResponse(ciudad_id=ciudad_id, total=len(negocios), negocios=negocios)
