from __future__ import annotations

import asyncio
import time
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from api.config import USD_TO_COP
from api.db import get_pool
from api.dependencies import get_optional_user
from api.services.personalizacion import calcular_relevancia, get_match_label, PRESUPUESTO_MAX

router = APIRouter()

_USD = USD_TO_COP

# In-process TTL cache for _expand_neighbors — barrios/geometry never change at runtime.
_NEIGHBORS_TTL = 60  # seconds
_NEIGHBORS_CACHE: dict[tuple, tuple] = {}


class ListingFull(BaseModel):
    id: int
    listing_uid: Optional[str] = None
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
    dias_en_mercado: Optional[int] = None
    fecha_publicacion: Optional[str] = None
    # URL availability — populated after running validate_listings_urls.py
    disponible_actualmente: Optional[bool] = None
    dias_en_mercado: Optional[int] = None
    fecha_ultima_verificacion: Optional[datetime] = None
    estrato_real: Optional[int] = None
    tier: Optional[str] = None
    # Personalization fields — populated when user is authenticated with a perfil
    relevancia_score: Optional[float] = None
    match_label: Optional[str] = None
    match_razones: Optional[list[str]] = None


class ListingDetail(ListingFull):
    descripcion: Optional[str] = None
    arriendo_p50_barrio: Optional[int] = None
    yield_estimado: Optional[float] = None
    # Barrio context fields
    yield_bruto_pct: Optional[float] = None
    score_corto: Optional[float] = None
    score_mediano: Optional[float] = None
    score_largo: Optional[float] = None
    liquidez_score: Optional[float] = None
    indice_nomada: Optional[float] = None
    seguridad_score: Optional[float] = None
    var_anual_pct: Optional[float] = None


class ListingsAllResponse(BaseModel):
    total: int
    listings: list[ListingFull]
    barrios_incluidos: Optional[list[str]] = None
    radio_usado_metros: Optional[int] = None


# Uses pre-computed cache tables (refreshed hourly) instead of per-request CTEs.
# analytics.barrios_medianas  replaces: med CTE (PERCENTILE_CONT full scan)
# analytics.barrios_contexto  replaces: bctx CTE (6 analytics table JOINs)
# analytics.barrios_cd        replaces: barrio_cd CTE (catastro JOIN)
# analytics.listings_georef   replaces: 3 LEFT JOINs (lm/lf/lp) + COALESCE lat/lon filter
_LISTINGS_SQL = """
WITH lraw AS (
    SELECT ('x'||substr(md5(url),1,8))::bit(32)::int AS id,
           listing_uid,
           fuente, tier, tipo_operacion, tipo_inmueble,
           precio_cop                                  AS precio,
           area_m2, habitaciones, banos,
           direccion_raw, barrio_raw, barrio_id, url, fecha_scraping,
           CASE
               WHEN precio_m2 > 0 AND precio_m2 < 2147483647 THEN precio_m2::int
               WHEN area_m2 > 0 THEN ROUND(precio_cop::float8 / area_m2)::int
               ELSE NULL
           END AS pm2
    FROM staging.stg_listings_unificado
    WHERE precio_cop >= 500000
      AND NOT (tipo_operacion = 'arriendo' AND precio_cop > 50000000)
      AND NOT (tipo_operacion = 'venta'    AND precio_cop > 50000000000)
)
SELECT
    l.id,
    l.listing_uid,
    l.fuente,
    l.tier,
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
    g.lat,
    g.lon,
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
    g.url_activa                  AS disponible_actualmente,
    NULL::int                     AS dias_en_mercado,
    NULL::timestamp               AS fecha_ultima_verificacion,
    ctx.yield_bruto_pct,
    ctx.n_listings_airbnb,
    ctx.score_corto,
    ctx.score_mediano,
    ctx.score_largo,
    ctx.liquidez_score,
    ctx.indice_nomada,
    ctx.seguridad_score,
    ctx.var_anual_pct,
    ctx.pct_wifi,
    g.estrato_real
FROM lraw l
JOIN raw.barrios b                    ON b.id = l.barrio_id
JOIN analytics.listings_georef g      ON g.url = l.url
LEFT JOIN analytics.barrios_medianas m ON m.barrio_id = l.barrio_id
               AND m.tipo_inmueble IS NOT DISTINCT FROM l.tipo_inmueble
LEFT JOIN analytics.barrios_cd bc     ON bc.barrio_id = b.id
LEFT JOIN analytics.barrios_contexto ctx ON ctx.barrio_id = l.barrio_id
WHERE ($1::text    IS NULL OR UPPER(b.municipio) = UPPER($1))
  AND ($2::int[]   IS NULL OR l.barrio_id = ANY($2))
  AND ($3::text    IS NULL OR l.tipo_operacion = $3)
  AND ($4::text    IS NULL OR LOWER(l.tipo_inmueble) LIKE '%' || LOWER($4) || '%')
  AND ($5::bigint  IS NULL OR l.precio >= $5)
  AND ($6::bigint  IS NULL OR l.precio <= $6)
  AND ($7::float8  IS NULL OR l.area_m2 >= $7)
  AND ($8::int     IS NULL OR l.habitaciones = $8)
  AND ($9::boolean IS NOT TRUE OR l.fuente = 'medellinliving')
ORDER BY
    CASE WHEN $9::boolean IS TRUE THEN 0
         WHEN l.barrio_id = ANY(COALESCE($2, ARRAY[]::int[])) THEN 1
         ELSE 2 END,
    CASE WHEN l.fuente = 'medellinliving' THEN 0 ELSE 1 END,
    l.pm2 ASC NULLS LAST
""".format(usd=int(_USD))

_COUNT_SQL = """
WITH lraw AS (
    SELECT fuente, tipo_operacion, tipo_inmueble,
           precio_cop AS precio, area_m2, habitaciones, banos, barrio_id, url
    FROM staging.stg_listings_unificado
    WHERE precio_cop >= 500000
      AND NOT (tipo_operacion = 'arriendo' AND precio_cop > 50000000)
      AND NOT (tipo_operacion = 'venta'    AND precio_cop > 50000000000)
)
SELECT COUNT(*)
FROM lraw l
JOIN raw.barrios b               ON b.id = l.barrio_id
JOIN analytics.listings_georef g ON g.url = l.url
WHERE ($1::text   IS NULL OR UPPER(b.municipio) = UPPER($1))
  AND ($2::int[]  IS NULL OR l.barrio_id = ANY($2))
  AND ($3::text   IS NULL OR l.tipo_operacion = $3)
  AND ($4::text   IS NULL OR LOWER(l.tipo_inmueble) LIKE '%' || LOWER($4) || '%')
  AND ($5::bigint IS NULL OR l.precio >= $5)
  AND ($6::bigint IS NULL OR l.precio <= $6)
  AND ($7::float8  IS NULL OR l.area_m2 >= $7)
  AND ($8::int     IS NULL OR l.habitaciones = $8)
  AND ($9::boolean IS NOT TRUE OR l.fuente = 'medellinliving')
"""

_BARRIO_CTX_KEYS = (
    "score_corto", "score_mediano", "score_largo",
    "yield_bruto_pct", "liquidez_score", "indice_nomada",
    "seguridad_score", "var_anual_pct",
    "n_listings_airbnb", "pct_wifi",
)

_NEARBY_BARRIOS_SQL = """
    SELECT b.id, b.nombre
    FROM raw.barrios b, raw.barrios base
    WHERE base.id = $1
      AND b.id != base.id
      AND b.municipio = base.municipio
      AND ST_DWithin(
          b.geometry::geography,
          base.geometry::geography,
          $2
      )
    ORDER BY ST_Distance(b.geometry::geography, base.geometry::geography)
    LIMIT 8
"""

_LISTINGS_COUNT_BY_IDS = """
    SELECT COUNT(*)::bigint
    FROM staging.stg_listings_unificado l
    WHERE l.precio_cop >= 500000
      AND NOT (l.tipo_operacion = 'arriendo' AND l.precio_cop > 50000000)
      AND NOT (l.tipo_operacion = 'venta'    AND l.precio_cop > 50000000000)
      AND l.barrio_id = ANY($1::int[])
"""

_PREMIUM_COUNT_BY_IDS = """
    SELECT COUNT(*)
    FROM raw.listings_premium lp
    JOIN raw.barrios b ON b.id = lp.barrio_id
    WHERE lp.barrio_id = ANY($1::int[])
      AND lp.lat IS NOT NULL AND lp.lat != 0
"""


def _get_prefiltros(perfil: dict) -> dict:
    filtros: dict = {}
    objetivo = perfil.get("objetivo", "")

    if objetivo == "airbnb":
        filtros["tipo_operacion"] = "venta"
        filtros["tipo_inmueble_pref"] = "apartamento"
    elif objetivo == "mediano_plazo":
        target = perfil.get("target_inquilino")
        if target == "ejecutivo":
            filtros["min_seguridad"] = 60
    elif objetivo in ("renta_larga", "largo_plazo"):
        filtros["tipo_operacion"] = "venta"
        horizonte = perfil.get("horizonte_inversion")
        pago = perfil.get("tipo_pago")
        if horizonte == "5" and pago == "credito":
            filtros["min_yield"] = 6.0
        if horizonte == "20+":
            filtros["prefer_estado_precio"] = "BAJO"

    pmax = PRESUPUESTO_MAX.get(perfil.get("presupuesto", ""))
    if pmax and pmax < 9_999_999_999:
        filtros["precio_max_soft"] = pmax

    return filtros


async def _expand_neighbors(
    pool: Any,
    barrio_id: int,
    radios: tuple[int, ...] = (0, 500, 1000),
    min_listings: int = 5,
    only_premium: bool = False,
) -> tuple[list[int], list[str], int]:
    """Cascade-expand barrio → neighbors until min_listings reached.
    Results cached for _NEIGHBORS_TTL seconds — barrio geometry is static at runtime.
    """
    cache_key = (barrio_id, only_premium)
    cached = _NEIGHBORS_CACHE.get(cache_key)
    if cached is not None:
        result, ts = cached
        if time.time() - ts < _NEIGHBORS_TTL:
            return result  # type: ignore[return-value]

    if only_premium:
        min_listings = 1

    ids = [barrio_id]
    names: list[str] = []

    base = await pool.fetchrow("SELECT nombre FROM raw.barrios WHERE id = $1", barrio_id)
    if base:
        names = [base["nombre"]]

    count_sql = _PREMIUM_COUNT_BY_IDS if only_premium else _LISTINGS_COUNT_BY_IDS

    for radio in radios:
        count = await pool.fetchval(count_sql, ids)
        if (count or 0) >= min_listings:
            result = (ids, names, radio if radio == 0 else radios[radios.index(radio) - 1])
            _NEIGHBORS_CACHE[cache_key] = (result, time.time())
            return result
        if radio == 0:
            continue
        nearby = await pool.fetch(_NEARBY_BARRIOS_SQL, barrio_id, float(radio))
        ids = [barrio_id] + [r["id"] for r in nearby]
        names = [names[0]] + [r["nombre"] for r in nearby]

    result = (ids, names, radios[-1])
    _NEIGHBORS_CACHE[cache_key] = (result, time.time())
    return result


async def _count_and_fetch(pool: Any, args: tuple, fetch_limit: int, fetch_offset: int) -> tuple:
    """Run COUNT + LISTINGS concurrently. Returns (count, rows)."""
    count, rows = await asyncio.gather(
        pool.fetchval(_COUNT_SQL, *args),
        pool.fetch(_LISTINGS_SQL + f" LIMIT {fetch_limit} OFFSET {fetch_offset}", *args),
    )
    return count or 0, rows


@router.get("", response_model=ListingsAllResponse)
async def get_all_listings(
    municipio: Optional[str] = Query(default=None),
    barrio_id: Optional[int] = Query(default=None),
    only_premium: bool = Query(default=False),
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

    # Neighbor expansion when barrio_id is given
    barrio_ids: Optional[list[int]] = None
    barrios_incluidos: Optional[list[str]] = None
    radio_usado: Optional[int] = None

    if barrio_id is not None:
        barrio_ids, barrios_incluidos, radio_usado = await _expand_neighbors(
            pool, barrio_id, only_premium=only_premium
        )

    # Fetch investor profile if authenticated
    perfil_dict: Optional[dict] = None
    if current_user:
        try:
            prow = await pool.fetchrow(
                """SELECT objetivo, perfil_riesgo, presupuesto, n_unidades, tipo_gestion,
                          target_inquilino, amoblado, tipo_pago, horizonte_inversion
                   FROM perfil_inversor
                   WHERE usuario_id = $1 ORDER BY id DESC LIMIT 1""",
                current_user["id"],
            )
            if prow and prow["objetivo"]:
                perfil_dict = dict(prow)
        except Exception:
            pass

    def _args(tipo_op: Optional[str]) -> tuple:
        return (municipio, barrio_ids, tipo_op, tipo_inmueble,
                precio_min, precio_max, area_min, habitaciones, only_premium)

    # Unified venta+arriendo path: 2 parallel fetches → balanced results, 1 HTTP round-trip.
    # Only applies when: no tipo_operacion filter, barrio selected, no premium, no personalization, page 0.
    if (tipo_operacion is None and barrio_id is not None
            and not only_premium and not perfil_dict and offset == 0):
        half = max(1, limit // 2)
        (total_v, rows_v), (total_a, rows_a) = await asyncio.gather(
            _count_and_fetch(pool, _args("venta"),   half, 0),
            _count_and_fetch(pool, _args("arriendo"), half, 0),
        )
        rows = list(rows_v) + list(rows_a)
        total = (total_v or 0) + (total_a or 0)
    else:
        # Single tipo_operacion (or premium / personalized / paginated):
        # run COUNT + LISTINGS in parallel — halves sequential overhead.
        args = _args(tipo_operacion)
        if perfil_dict:
            fetch_limit = min(500, max(limit * 3, 200))
            fetch_offset = 0
        else:
            fetch_limit = limit
            fetch_offset = offset
        total, rows = await asyncio.gather(
            pool.fetchval(_COUNT_SQL, *args),
            pool.fetch(_LISTINGS_SQL + f" LIMIT {fetch_limit} OFFSET {fetch_offset}", *args),
        )
        total = total or 0

    items: list[ListingFull] = []
    for r in rows:
        row_d = dict(r)
        if perfil_dict:
            barrio_ctx = {k: row_d.get(k) for k in _BARRIO_CTX_KEYS}
            score, razones = calcular_relevancia(row_d, barrio_ctx, perfil_dict)

            # Apply prefiltro penalties (soft — bias sort, don't hard-remove)
            prefiltros = _get_prefiltros(perfil_dict)
            if "tipo_operacion" in prefiltros:
                if row_d.get("tipo_operacion") != prefiltros["tipo_operacion"]:
                    score = round(score * 0.3, 1)
            if "min_yield" in prefiltros:
                if float(barrio_ctx.get("yield_bruto_pct") or 0) < prefiltros["min_yield"]:
                    score = round(score * 0.7, 1)
            if "min_seguridad" in prefiltros:
                if float(barrio_ctx.get("seguridad_score") or 0) < prefiltros["min_seguridad"]:
                    score = round(score * 0.8, 1)

            row_d["relevancia_score"] = score
            row_d["match_label"] = get_match_label(score)
            row_d["match_razones"] = razones
        items.append(ListingFull(**row_d))

    if perfil_dict:
        items.sort(key=lambda x: x.relevancia_score or 0.0, reverse=True)
        items = items[offset: offset + limit]

    return ListingsAllResponse(
        total=total,
        listings=items,
        barrios_incluidos=barrios_incluidos,
        radio_usado_metros=radio_usado,
    )


_LISTING_BY_ID_SQL = """
WITH listing AS (
    SELECT ('x'||substr(md5(url),1,8))::bit(32)::int AS id,
           listing_uid,
           fuente, tier, tipo_operacion, tipo_inmueble,
           precio_cop, area_m2, habitaciones, banos,
           direccion_raw, barrio_id, url,
           NULL::int  AS dias_en_mercado,
           NULL::date AS fecha_publicacion,
           CASE
               WHEN precio_m2 > 0 AND precio_m2 < 2147483647 THEN precio_m2::int
               WHEN area_m2 > 0 THEN ROUND(precio_cop::float8 / area_m2)::int
               ELSE NULL
           END AS pm2
    FROM staging.stg_listings_unificado
    WHERE ('x'||substr(md5(url),1,8))::bit(32)::int = $1
)
SELECT
    l.id,
    l.listing_uid,
    l.fuente,
    l.tier,
    l.tipo_operacion,
    l.tipo_inmueble,
    l.precio_cop::bigint,
    (l.precio_cop / {usd})::bigint AS precio_usd,
    l.area_m2::float8,
    l.pm2 AS precio_m2,
    l.habitaciones,
    l.banos::float8,
    l.direccion_raw,
    l.url,
    g.lat,
    g.lon,
    g.url_activa AS disponible_actualmente,
    g.estrato_real,
    l.barrio_id,
    b.nombre AS barrio_nombre,
    b.municipio,
    bc.cd_comuna,
    m.m2_mediana::int AS precio_m2_mediana_barrio,
    m.arr_mediana::int AS arriendo_p50_barrio,
    CASE
        WHEN l.tipo_operacion = 'venta'
             AND l.pm2 IS NOT NULL AND l.pm2 > 0 AND m.m2_mediana > 0
        THEN round(((m.m2_mediana - l.pm2)::float8 / m.m2_mediana * 100)::numeric, 1)::float8
        WHEN l.tipo_operacion = 'arriendo'
             AND l.precio_cop > 0 AND m.arr_mediana > 0
        THEN round(((m.arr_mediana - l.precio_cop)::float8 / m.arr_mediana * 100)::numeric, 1)::float8
        ELSE NULL
    END AS pct_bajo_mediana,
    CASE
        WHEN l.tipo_operacion = 'venta'
             AND l.pm2 IS NOT NULL AND l.pm2 > 0 AND m.m2_mediana > 0
             AND (m.m2_mediana - l.pm2)::float8 / m.m2_mediana > 0.10 THEN TRUE
        WHEN l.tipo_operacion = 'arriendo'
             AND l.precio_cop > 0 AND m.arr_mediana > 0
             AND (m.arr_mediana - l.precio_cop)::float8 / m.arr_mediana > 0.10 THEN TRUE
        ELSE FALSE
    END AS buena_oferta,
    CASE
        WHEN l.tipo_operacion = 'venta' AND l.precio_cop > 0 AND m.arr_mediana > 0
        THEN round(((m.arr_mediana * 12)::float8 / l.precio_cop * 100)::numeric, 2)::float8
        ELSE NULL
    END AS yield_estimado,
    lp.descripcion AS descripcion,
    l.dias_en_mercado,
    l.fecha_publicacion::text,
    NULL::timestamp AS fecha_ultima_verificacion,
    ctx.yield_bruto_pct,
    ctx.score_corto,
    ctx.score_mediano,
    ctx.score_largo,
    ctx.liquidez_score,
    ctx.indice_nomada,
    ctx.seguridad_score,
    ctx.var_anual_pct
FROM listing l
JOIN raw.barrios b ON b.id = l.barrio_id
JOIN analytics.listings_georef g ON g.url = l.url
LEFT JOIN analytics.barrios_medianas m
    ON m.barrio_id = l.barrio_id
    AND m.tipo_inmueble IS NOT DISTINCT FROM l.tipo_inmueble
LEFT JOIN analytics.barrios_cd bc ON bc.barrio_id = l.barrio_id
LEFT JOIN analytics.barrios_contexto ctx ON ctx.barrio_id = l.barrio_id
LEFT JOIN raw.listings_fincaraiz lf ON lf.url = l.url AND l.fuente = 'fincaraiz'
LEFT JOIN raw.listings_metrocuadrado lm ON lm.url = l.url AND l.fuente = 'metrocuadrado'
LEFT JOIN raw.listings_premium lp ON lp.url = l.url
LIMIT 1
""".format(usd=int(_USD))


@router.get("/{listing_id}", response_model=ListingDetail)
async def get_listing_by_id(listing_id: int):
    pool = get_pool()
    row = await pool.fetchrow(_LISTING_BY_ID_SQL, listing_id)
    if not row:
        raise HTTPException(status_code=404, detail="Listing not found")
    return ListingDetail(**dict(row))
