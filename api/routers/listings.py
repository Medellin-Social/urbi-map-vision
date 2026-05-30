from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from api.config import USD_TO_COP
from api.db import get_pool
from api.dependencies import get_optional_user
from api.services.personalizacion import calcular_relevancia, get_match_label

router = APIRouter()

_USD = USD_TO_COP


class ListingFull(BaseModel):
    id: int
    fuente: Optional[str] = None
    tipo_operacion: Optional[str] = None
    tipo_inmueble: Optional[str] = None
    precio_cop: Optional[int] = None
    precio_usd: Optional[int] = None
    area_m2: Optional[float] = None
    precio_m2: Optional[int] = None
    habitaciones: Optional[int] = None
    banos: Optional[float] = None
    direccion_raw: Optional[str] = None
    url: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    barrio_id: Optional[int] = None
    barrio_nombre: Optional[str] = None
    municipio: Optional[str] = None
    cd_comuna: Optional[int] = None
    buena_oferta: Optional[bool] = None
    pct_bajo_mediana: Optional[float] = None
    precio_m2_mediana_barrio: Optional[int] = None
    # URL availability — populated after running validate_listings_urls.py
    disponible_actualmente: Optional[bool] = None
    dias_en_mercado: Optional[int] = None
    fecha_ultima_verificacion: Optional[datetime] = None
    # Personalization fields — populated when user is authenticated with a perfil
    relevancia_score: Optional[float] = None
    match_label: Optional[str] = None
    match_razones: Optional[list[str]] = None


class ListingsAllResponse(BaseModel):
    total: int
    listings: list[ListingFull]


# Barrio context CTE — joins analytics tables for personalization scoring.
# Extra columns (score_corto, etc.) are returned in the row dict but ignored
# by ListingFull (Pydantic v2 silently drops extra fields).
_LISTINGS_SQL = """
WITH med AS (
    -- Per-(barrio, tipo_inmueble) medians.
    -- m2_mediana: venta only, outliers [500K–50M] COP/m² filtered, ::bigint avoids int4 overflow.
    -- arr_mediana: arriendo only, median monthly rent price.
    SELECT
        barrio_id,
        tipo_inmueble,
        ROUND(
            PERCENTILE_CONT(0.5) WITHIN GROUP (
                ORDER BY precio::float / NULLIF(area_m2, 0)
            ) FILTER (WHERE
                tipo_operacion = 'venta'
                AND area_m2 > 0
                AND precio::float / area_m2 > 500000
                AND precio::float / area_m2 < 50000000
            )
        )::bigint  AS m2_mediana,
        PERCENTILE_CONT(0.5) WITHIN GROUP (
            ORDER BY precio::float
        ) FILTER (WHERE tipo_operacion = 'arriendo')::bigint AS arr_mediana
    FROM staging.stg_listings
    WHERE activo = TRUE AND precio > 0
    GROUP BY barrio_id, tipo_inmueble
),
bctx AS (
    SELECT
        bm.barrio_id,
        bm.yield_bruto                AS yield_bruto_pct,
        sc.score_corto,
        sc.score_mediano,
        sc.score_largo,
        lq.liquidez_score,
        poi.indice_nomada,
        seg.score_seguridad_residente AS seguridad_score,
        sl.var_anual_5anos_pct        AS var_anual_pct
    FROM analytics.barrios_mercado bm
    LEFT JOIN analytics.barrios_score_consolidado sc  ON sc.barrio_id = bm.barrio_id
    LEFT JOIN analytics.barrios_liquidez          lq  ON lq.barrio_id = bm.barrio_id
    LEFT JOIN analytics.barrios_pois_distancia    poi ON poi.barrio_id = bm.barrio_id
    LEFT JOIN analytics.barrios_seguridad         seg ON seg.barrio_id = bm.barrio_id
    LEFT JOIN analytics.score_largo_plazo         sl  ON sl.barrio_id = bm.barrio_id
),
barrio_cd AS (
    SELECT DISTINCT ON (b2.id) b2.id AS barrio_id, c.cd_comuna
    FROM raw.barrios b2
    JOIN raw.catastro_medellin c ON UPPER(c.ds_comuna) = UPPER(b2.comuna)
    ORDER BY b2.id
),
lraw AS (
    SELECT *,
        CASE
            WHEN precio_m2 > 0 AND precio_m2 < 2147483647 THEN precio_m2::int
            WHEN area_m2 > 0                               THEN ROUND(precio::float8 / area_m2)::int
            ELSE NULL
        END AS pm2
    FROM staging.stg_listings
    WHERE activo = TRUE
      AND precio >= 500000
      AND NOT (tipo_operacion = 'arriendo' AND precio > 50000000)
      AND NOT (tipo_operacion = 'venta'    AND precio > 50000000000)
)
SELECT
    l.id,
    l.fuente,
    l.tipo_operacion,
    l.tipo_inmueble,
    l.precio::bigint            AS precio_cop,
    (l.precio / {usd})::bigint  AS precio_usd,
    l.area_m2::float8,
    l.pm2                       AS precio_m2,
    l.habitaciones,
    l.banos::float8,
    l.direccion_raw,
    l.url,
    COALESCE(lm.lat, lf.lat)    AS lat,
    COALESCE(lm.lon, lf.lon)    AS lon,
    l.barrio_id,
    b.nombre    AS barrio_nombre,
    b.municipio AS municipio,
    bc.cd_comuna AS cd_comuna,
    CASE
        WHEN l.tipo_operacion = 'venta'
             AND l.pm2 IS NOT NULL AND l.pm2 > 0
             AND m.m2_mediana > 0
             AND (m.m2_mediana - l.pm2)::float8 / m.m2_mediana > 0.10
        THEN TRUE
        WHEN l.tipo_operacion = 'arriendo'
             AND l.precio > 0
             AND m.arr_mediana > 0
             AND (m.arr_mediana - l.precio)::float8 / m.arr_mediana > 0.10
        THEN TRUE
        ELSE FALSE
    END AS buena_oferta,
    CASE
        WHEN l.tipo_operacion = 'venta'
             AND l.pm2 IS NOT NULL AND l.pm2 > 0
             AND m.m2_mediana > 0
        THEN round(((m.m2_mediana - l.pm2)::float8 / m.m2_mediana * 100)::numeric, 1)::float8
        WHEN l.tipo_operacion = 'arriendo'
             AND l.precio > 0 AND m.arr_mediana > 0
        THEN round(((m.arr_mediana - l.precio)::float8 / m.arr_mediana * 100)::numeric, 1)::float8
        ELSE NULL
    END AS pct_bajo_mediana,
    m.m2_mediana::int             AS precio_m2_mediana_barrio,
    -- url_activa columns: populated after running scripts/sql/add_url_validation_columns.sql
    TRUE::boolean                 AS disponible_actualmente,
    NULL::int                     AS dias_en_mercado,
    NULL::timestamp               AS fecha_ultima_verificacion,
    ctx.yield_bruto_pct,
    ctx.score_corto,
    ctx.score_mediano,
    ctx.score_largo,
    ctx.liquidez_score,
    ctx.indice_nomada,
    ctx.seguridad_score,
    ctx.var_anual_pct
FROM lraw l
JOIN raw.barrios b ON b.id = l.barrio_id
LEFT JOIN raw.listings_metrocuadrado lm ON lm.url = l.url AND l.fuente = 'metrocuadrado'
LEFT JOIN raw.listings_fincaraiz lf     ON lf.url = l.url AND l.fuente = 'fincaraiz'
LEFT JOIN med m ON m.barrio_id = l.barrio_id
              AND m.tipo_inmueble IS NOT DISTINCT FROM l.tipo_inmueble
LEFT JOIN barrio_cd bc ON bc.barrio_id = b.id
LEFT JOIN bctx ctx ON ctx.barrio_id = l.barrio_id
WHERE ($1::text    IS NULL OR UPPER(b.municipio) = UPPER($1))
  AND (
      -- barrio_id OR cd_comuna; if both provided use OR so commune listings
      -- still appear even when barrio_cd CTE misses some barrios
      ($2::int IS NOT NULL AND l.barrio_id = $2)
      OR ($9::int IS NOT NULL AND bc.cd_comuna = $9 AND UPPER(b.municipio) = 'MEDELLIN')
      OR ($2::int IS NULL AND $9::int IS NULL)
  )
  AND ($3::text    IS NULL OR l.tipo_operacion = $3)
  AND ($4::text    IS NULL OR LOWER(l.tipo_inmueble) LIKE '%' || LOWER($4) || '%')
  AND ($5::bigint  IS NULL OR l.precio >= $5)
  AND ($6::bigint  IS NULL OR l.precio <= $6)
  AND ($7::float8  IS NULL OR l.area_m2 >= $7)
  AND ($8::int     IS NULL OR l.habitaciones = $8)
  AND COALESCE(lm.lat, lf.lat) IS NOT NULL
  AND COALESCE(lm.lat, lf.lat) != 0
ORDER BY l.pm2 ASC NULLS LAST
""".format(usd=int(_USD))

_COUNT_SQL = """
WITH barrio_cd AS (
    SELECT DISTINCT ON (b2.id) b2.id AS barrio_id, c.cd_comuna
    FROM raw.barrios b2
    JOIN raw.catastro_medellin c ON UPPER(c.ds_comuna) = UPPER(b2.comuna)
    ORDER BY b2.id
),
lraw AS (
    SELECT *
    FROM staging.stg_listings
    WHERE activo = TRUE
      AND precio >= 500000
      AND NOT (tipo_operacion = 'arriendo' AND precio > 50000000)
      AND NOT (tipo_operacion = 'venta'    AND precio > 50000000000)
)
SELECT COUNT(*)
FROM lraw l
JOIN raw.barrios b ON b.id = l.barrio_id
LEFT JOIN raw.listings_metrocuadrado lm ON lm.url = l.url AND l.fuente = 'metrocuadrado'
LEFT JOIN raw.listings_fincaraiz lf     ON lf.url = l.url AND l.fuente = 'fincaraiz'
LEFT JOIN barrio_cd bc ON bc.barrio_id = b.id
WHERE ($1::text   IS NULL OR UPPER(b.municipio) = UPPER($1))
  AND (
      ($2::int IS NOT NULL AND l.barrio_id = $2)
      OR ($9::int IS NOT NULL AND bc.cd_comuna = $9 AND UPPER(b.municipio) = 'MEDELLIN')
      OR ($2::int IS NULL AND $9::int IS NULL)
  )
  AND ($3::text   IS NULL OR l.tipo_operacion = $3)
  AND ($4::text   IS NULL OR LOWER(l.tipo_inmueble) LIKE '%' || LOWER($4) || '%')
  AND ($5::bigint IS NULL OR l.precio >= $5)
  AND ($6::bigint IS NULL OR l.precio <= $6)
  AND ($7::float8 IS NULL OR l.area_m2 >= $7)
  AND ($8::int    IS NULL OR l.habitaciones = $8)
  AND COALESCE(lm.lat, lf.lat) IS NOT NULL
  AND COALESCE(lm.lat, lf.lat) != 0
"""

_BARRIO_CTX_KEYS = (
    "score_corto", "score_mediano", "score_largo",
    "yield_bruto_pct", "liquidez_score", "indice_nomada",
    "seguridad_score", "var_anual_pct",
)


@router.get("", response_model=ListingsAllResponse)
async def get_all_listings(
    municipio: Optional[str] = Query(default=None),
    barrio_id: Optional[int] = Query(default=None),
    cd_comuna: Optional[int] = Query(default=None),
    tipo_operacion: Optional[str] = Query(default=None),
    tipo_inmueble: Optional[str] = Query(default=None),
    precio_min: Optional[int] = Query(default=None),
    precio_max: Optional[int] = Query(default=None),
    area_min: Optional[float] = Query(default=None),
    habitaciones: Optional[int] = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    current_user: Optional[dict] = Depends(get_optional_user),
):
    pool = get_pool()
    args = (municipio, barrio_id, tipo_operacion, tipo_inmueble,
            precio_min, precio_max, area_min, habitaciones, cd_comuna)

    # Fetch investor profile if authenticated
    perfil_dict: Optional[dict] = None
    if current_user:
        try:
            prow = await pool.fetchrow(
                "SELECT objetivo, perfil_riesgo FROM perfil_inversor "
                "WHERE usuario_id = $1 ORDER BY id DESC LIMIT 1",
                current_user["id"],
            )
            if prow and prow["objetivo"]:
                perfil_dict = dict(prow)
        except Exception:
            pass

    total = await pool.fetchval(_COUNT_SQL, *args)

    # When personalized: over-fetch so Python sort+slice is correct across pages
    if perfil_dict:
        fetch_limit = min(500, max(limit * 3, 200))
        fetch_offset = 0
    else:
        fetch_limit = limit
        fetch_offset = offset

    rows = await pool.fetch(
        _LISTINGS_SQL + f" LIMIT {fetch_limit} OFFSET {fetch_offset}",
        *args,
    )

    items: list[ListingFull] = []
    for r in rows:
        row_d = dict(r)
        if perfil_dict:
            barrio_ctx = {k: row_d.get(k) for k in _BARRIO_CTX_KEYS}
            score, razones = calcular_relevancia(row_d, barrio_ctx, perfil_dict)
            row_d["relevancia_score"] = score
            row_d["match_label"] = get_match_label(score)
            row_d["match_razones"] = razones
        items.append(ListingFull(**row_d))

    if perfil_dict:
        items.sort(key=lambda x: x.relevancia_score or 0.0, reverse=True)
        items = items[offset: offset + limit]

    return ListingsAllResponse(total=total or 0, listings=items)
