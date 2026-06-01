from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from api.config import USD_TO_COP
from api.db import get_pool
from api.dependencies import get_optional_user
from api.services.personalizacion import calcular_relevancia, get_match_label, PRESUPUESTO_MAX

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
    estrato_real: Optional[int] = None
    tier: Optional[str] = None
    # Personalization fields — populated when user is authenticated with a perfil
    relevancia_score: Optional[float] = None
    match_label: Optional[str] = None
    match_razones: Optional[list[str]] = None


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
    SELECT id, fuente, tipo_operacion, tipo_inmueble,
           precio, area_m2, habitaciones, banos,
           direccion_raw, barrio_raw, barrio_id, url, fecha_scraping,
           CASE
               WHEN precio_m2 > 0 AND precio_m2 < 2147483647 THEN precio_m2::int
               WHEN area_m2 > 0 THEN ROUND(precio::float8 / area_m2)::int
               ELSE NULL
           END AS pm2
    FROM staging.stg_listings
    WHERE activo = TRUE
      AND precio >= 500000
      AND NOT (tipo_operacion = 'arriendo' AND precio > 50000000)
      AND NOT (tipo_operacion = 'venta'    AND precio > 50000000000)

    UNION ALL

    SELECT id, fuente, tipo_operacion, tipo_inmueble,
           precio_cop AS precio, area_m2, habitaciones, banos,
           NULL AS direccion_raw, barrio_raw, barrio_id, url, fecha_scraping,
           CASE WHEN area_m2 > 0 THEN ROUND(precio_cop::float8 / area_m2)::int
                ELSE NULL END AS pm2
    FROM raw.listings_premium
    WHERE precio_cop >= 500000
      AND tipo_operacion IS NOT NULL
)
SELECT
    l.id,
    l.fuente,
    CASE l.fuente
        WHEN 'medellinliving' THEN 'agencia_premium'
        WHEN 'booking_mensual' THEN 'renta_media'
        WHEN 'flatio' THEN 'renta_media'
        ELSE 'standard'
    END AS tier,
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
    SELECT id, fuente, tipo_operacion, tipo_inmueble,
           precio, area_m2, habitaciones, banos, barrio_id, url
    FROM staging.stg_listings
    WHERE activo = TRUE
      AND precio >= 500000
      AND NOT (tipo_operacion = 'arriendo' AND precio > 50000000)
      AND NOT (tipo_operacion = 'venta'    AND precio > 50000000000)

    UNION ALL

    SELECT id, fuente, tipo_operacion, tipo_inmueble,
           precio_cop AS precio, area_m2, habitaciones, banos, barrio_id, url
    FROM raw.listings_premium
    WHERE precio_cop >= 500000 AND tipo_operacion IS NOT NULL
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
    SELECT SUM(cnt)::bigint FROM (
        SELECT COUNT(*) AS cnt
        FROM staging.stg_listings l
        JOIN analytics.listings_georef g ON g.url = l.url
        WHERE l.activo = TRUE
          AND l.precio >= 500000
          AND NOT (l.tipo_operacion = 'arriendo' AND l.precio > 50000000)
          AND NOT (l.tipo_operacion = 'venta'    AND l.precio > 50000000000)
          AND l.barrio_id = ANY($1::int[])

        UNION ALL

        SELECT COUNT(*) AS cnt
        FROM raw.listings_premium lp
        JOIN analytics.listings_georef g ON g.url = lp.url
        WHERE lp.precio_cop >= 500000
          AND lp.tipo_operacion IS NOT NULL
          AND lp.barrio_id = ANY($1::int[])
    ) sub
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
    # Premium listings are few by nature; expand only if barrio has none at all
    if only_premium:
        min_listings = 1
    """Cascade-expand barrio → neighbors until min_listings reached.
    Returns (barrio_ids, barrio_names, radio_usado_metros).
    When only_premium=True, expansion is driven by premium listing count.
    """
    ids = [barrio_id]
    names: list[str] = []

    base = await pool.fetchrow("SELECT nombre FROM raw.barrios WHERE id = $1", barrio_id)
    if base:
        names = [base["nombre"]]

    count_sql = _PREMIUM_COUNT_BY_IDS if only_premium else _LISTINGS_COUNT_BY_IDS

    for radio in radios:
        count = await pool.fetchval(count_sql, ids)
        if (count or 0) >= min_listings:
            return ids, names, radio if radio == 0 else radios[radios.index(radio) - 1]
        if radio == 0:
            continue
        nearby = await pool.fetch(_NEARBY_BARRIOS_SQL, barrio_id, float(radio))
        ids = [barrio_id] + [r["id"] for r in nearby]
        names = [names[0]] + [r["nombre"] for r in nearby]

    return ids, names, radios[-1]


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

    args = (municipio, barrio_ids, tipo_operacion, tipo_inmueble,
            precio_min, precio_max, area_min, habitaciones, only_premium)

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

    total = await pool.fetchval(_COUNT_SQL, *args)

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
        total=total or 0,
        listings=items,
        barrios_incluidos=barrios_incluidos,
        radio_usado_metros=radio_usado,
    )
