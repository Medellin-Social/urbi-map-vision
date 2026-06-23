from __future__ import annotations

import asyncio
import hashlib
import time
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from api.config import USD_TO_COP
from api.db import get_pool
from api.dependencies import get_optional_user
from api.services.personalizacion import calcular_relevancia, get_match_label, PRESUPUESTO_MAX

router = APIRouter()

_USD = USD_TO_COP

_AMENIDADES_VARIANTS: dict[str, list[str]] = {
    "piscina":                ["Piscina"],
    "gimnasio":               ["Gimnasio"],
    "ascensor":               ["Ascensor", "Número de Ascensores 1", "Número de Ascensores 2",
                               "Número de Ascensores 3", "Número de Ascensores 4"],
    "balcon":                 ["Terraza/Balcón balcón"],
    "lavanderia":             ["Zona de lavanderia"],
    "conjunto_cerrado":       ["Conjunto cerrado"],
    "cocina_integral":        ["Cocina integral"],
    "salon_comunal":          ["Salón  comunal"],
    "zona_ninos":             ["Zona para niños"],
    "parqueadero_visitantes": ["Parqueadero visitantes"],
    "vigilancia":             ["Vigilancia 24hrs", "Vigilancia"],
    "camaras":                ["Circuito cerrado de TV"],
    "transporte":             ["Cerca Transporte Público"],
    "zonas_verdes":           ["Zonas verdes"],
    "porteria":               ["Recepción Lobby"],
}


def _build_amenidades_sql(keys: list[str], base: int = 14) -> tuple[str, list]:
    """Returns (WHERE clauses string, extra positional args). Each key adds one AND EXISTS pair."""
    clauses: list[str] = []
    extra: list = []
    for key in keys:
        variants = _AMENIDADES_VARIANTS.get(key)
        if not variants:
            continue
        n = base + len(extra) + 1
        extra.append(variants)
        clauses.append(
            f"AND EXISTS (\n"
            f"    SELECT 1 FROM raw.listings_metrocuadrado _am\n"
            f"    WHERE _am.url = l.url AND _am.amenidades && ${n}::text[]\n"
            f")"
        )
    return "\n  ".join(clauses), extra


# In-process TTL cache for _expand_neighbors — barrios/geometry never change at runtime.
_NEIGHBORS_TTL = 60  # seconds
_NEIGHBORS_CACHE: dict[tuple, tuple] = {}


class ListingFull(BaseModel):
    id: int
    listing_uid: Optional[str] = None
    fuente: Optional[str] = None
    fuente_display: Optional[str] = None
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
    barrio_display: Optional[str] = None
    municipio: Optional[str] = None
    municipio_display: Optional[str] = None
    comuna_nombre: Optional[str] = None
    cd_comuna: Optional[int] = None
    buena_oferta: Optional[bool] = None
    pct_bajo_mediana: Optional[float] = None
    precio_m2_mediana_barrio: Optional[int] = None
    dias_en_mercado: Optional[int] = None
    fecha_publicacion: Optional[str] = None
    disponible_actualmente: Optional[bool] = None
    fecha_ultima_verificacion: Optional[datetime] = None
    estrato_real: Optional[int] = None
    tier: Optional[str] = None
    favoritos_count: Optional[int] = None
    foto_principal: Optional[str] = None
    # Barrio context — always included (from analytics.barrios_contexto JOIN)
    barrio_score: Optional[float] = None   # ctx.score_corto
    barrio_yield: Optional[float] = None   # ctx.yield_bruto_pct
    # Personalization fields — populated when user is authenticated with a perfil
    relevancia_score: Optional[float] = None
    match_label: Optional[str] = None
    match_razones: Optional[list[str]] = None


class PrecioHistorialItem(BaseModel):
    precio: int
    fecha: str
    delta_pct: Optional[float] = None


class ListingDetail(ListingFull):
    descripcion: Optional[str] = None
    arriendo_p50_barrio: Optional[int] = None
    yield_estimado: Optional[float] = None
    vistas: Optional[int] = None
    precio_historia: Optional[list[PrecioHistorialItem]] = None
    # Free-tier descriptive fields
    fotos: Optional[list[str]] = None
    administracion: Optional[int] = None
    antiguedad: Optional[str] = None
    # Barrio context fields
    yield_bruto_pct: Optional[float] = None
    score_corto: Optional[float] = None
    score_mediano: Optional[float] = None
    score_largo: Optional[float] = None
    liquidez_score: Optional[float] = None
    indice_nomada: Optional[float] = None
    seguridad_score: Optional[float] = None
    var_anual_pct: Optional[float] = None
    # Barrio price range (p25/p75) — pro only
    precio_m2_p25: Optional[int] = None
    precio_m2_p75: Optional[int] = None
    arr_p25: Optional[int] = None
    arr_p75: Optional[int] = None


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
_LISTINGS_SQL_TMPL = """
WITH lraw AS (
    SELECT ('x'||substr(md5(url),1,8))::bit(32)::int AS id,
           listing_uid,
           fuente, tier, tipo_operacion, tipo_inmueble,
           precio_cop                                  AS precio,
           area_m2, NULLIF(habitaciones, -1) AS habitaciones, banos,
           direccion_raw, barrio_raw, barrio_id, url, fecha_scraping,
           CASE
               WHEN precio_m2 > 0 AND precio_m2 < 2147483647 THEN precio_m2::int
               WHEN area_m2 > 0 AND precio_cop::float8 / area_m2 < 2147483647
                    THEN ROUND(precio_cop::float8 / area_m2)::int
               ELSE NULL
           END AS pm2,
           fotos[1] AS foto_principal
    FROM staging.stg_listings_unificado
    WHERE precio_cop >= 500000
      AND NOT (tipo_operacion = 'arriendo' AND precio_cop > 50000000)
      AND NOT (tipo_operacion = 'venta'    AND precio_cop > 50000000000)
)
SELECT
    l.id,
    l.listing_uid,
    l.fuente,
    CASE
        WHEN l.tier = 'agente_premium' THEN 'agente_verificado'
        WHEN l.fuente = 'propio' AND _lp_owner.owner_plan IN ('pro', 'agente') THEN 'propio_pro'
        WHEN l.fuente = 'propio' THEN 'propio'
        ELSE l.fuente
    END AS fuente_display,
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
    b.nombre                           AS barrio_nombre,
    INITCAP(LOWER(b.nombre))           AS barrio_display,
    b.municipio                        AS municipio,
    INITCAP(LOWER(b.municipio))        AS municipio_display,
    INITCAP(LOWER(b.comuna)) AS comuna_nombre,
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
    (CURRENT_DATE - _lm.fecha_primera_vez::date)::int
                                  AS dias_en_mercado,
    NULL::timestamp               AS fecha_ultima_verificacion,
    ctx.yield_bruto_pct,
    ctx.yield_bruto_pct              AS barrio_yield,
    ctx.n_listings_airbnb,
    ctx.score_corto,
    ctx.score_corto                  AS barrio_score,
    ctx.score_mediano,
    ctx.score_largo,
    ctx.liquidez_score,
    ctx.indice_nomada,
    ctx.seguridad_score,
    ctx.var_anual_pct,
    ctx.pct_wifi,
    g.estrato_real,
    COALESCE(_fav.favoritos_count, 0) AS favoritos_count,
    l.foto_principal
FROM lraw l
JOIN raw.barrios b                    ON b.id = l.barrio_id
JOIN analytics.listings_georef g      ON g.url = l.url
LEFT JOIN analytics.barrios_medianas m ON m.barrio_id = l.barrio_id
               AND m.tipo_inmueble IS NOT DISTINCT FROM l.tipo_inmueble
LEFT JOIN analytics.barrios_cd bc     ON bc.barrio_id = b.id
LEFT JOIN analytics.barrios_contexto ctx ON ctx.barrio_id = l.barrio_id
LEFT JOIN raw.listings_metrocuadrado _lm ON _lm.url = l.url AND l.fuente = 'metrocuadrado'
LEFT JOIN (
    SELECT url, COUNT(*)::int AS favoritos_count
    FROM raw.favoritos_listings GROUP BY url
) _fav ON _fav.url = l.url
LEFT JOIN (
    SELECT lp.id::text AS lp_url, u.plan AS owner_plan
    FROM public.listings_propios lp
    JOIN public.usuarios u ON u.id = lp.user_id
) _lp_owner ON _lp_owner.lp_url = l.url AND l.fuente = 'propio'
WHERE ($1::text    IS NULL OR UPPER(b.municipio) = UPPER($1))
  AND ($2::int[]   IS NULL OR l.barrio_id = ANY($2))
  AND ($3::text    IS NULL OR l.tipo_operacion = $3)
  AND ($4::text    IS NULL OR LOWER(l.tipo_inmueble) LIKE '%' || LOWER($4) || '%')
  AND ($5::bigint  IS NULL OR l.precio >= $5)
  AND ($6::bigint  IS NULL OR l.precio <= $6)
  AND ($7::float8  IS NULL OR l.area_m2 >= $7)
  AND ($8::int     IS NULL OR (CASE WHEN $8 >= 4 THEN l.habitaciones >= $8 ELSE l.habitaciones = $8 END))
  AND ($9::boolean IS NOT TRUE OR l.fuente = 'medellinliving')
  AND ($10::float8 IS NULL OR l.area_m2 <= $10)
  AND ($11::float8 IS NULL OR (CASE WHEN $11 >= 4 THEN l.banos >= $11 ELSE l.banos = $11 END))
  AND ($12::int    IS NULL OR bc.cd_comuna = $12)
  AND ($13::int    IS NULL OR (g.estrato_real = $13 AND g.estrato_real BETWEEN 1 AND 6))
  AND ($14::text   IS NULL OR EXISTS (
      SELECT 1 FROM raw.listings_metrocuadrado _lmc
      WHERE _lmc.url = l.url
        AND _lmc.raw_data::text LIKE '%tiempoConstruido:' || $14 || '%'
  ))
  {{amenidades_filter}}
ORDER BY
    CASE WHEN $9::boolean IS TRUE THEN 0
         WHEN l.barrio_id = ANY(COALESCE($2, ARRAY[]::int[])) THEN 1
         ELSE 2 END,
    CASE WHEN l.fuente = 'medellinliving' THEN 0 ELSE 1 END,
    l.pm2 ASC NULLS LAST
""".format(usd=int(_USD))
_LISTINGS_SQL = _LISTINGS_SQL_TMPL.format(amenidades_filter="")

_COUNT_SQL_TMPL = """
WITH lraw AS (
    SELECT fuente, tipo_operacion, tipo_inmueble,
           precio_cop AS precio, area_m2,
           NULLIF(habitaciones, -1) AS habitaciones,
           banos, barrio_id, url
    FROM staging.stg_listings_unificado
    WHERE precio_cop >= 500000
      AND NOT (tipo_operacion = 'arriendo' AND precio_cop > 50000000)
      AND NOT (tipo_operacion = 'venta'    AND precio_cop > 50000000000)
)
SELECT COUNT(*)
FROM lraw l
JOIN raw.barrios b               ON b.id = l.barrio_id
JOIN analytics.listings_georef g ON g.url = l.url
LEFT JOIN analytics.barrios_cd bc ON bc.barrio_id = l.barrio_id
WHERE ($1::text   IS NULL OR UPPER(b.municipio) = UPPER($1))
  AND ($2::int[]  IS NULL OR l.barrio_id = ANY($2))
  AND ($3::text   IS NULL OR l.tipo_operacion = $3)
  AND ($4::text   IS NULL OR LOWER(l.tipo_inmueble) LIKE '%' || LOWER($4) || '%')
  AND ($5::bigint IS NULL OR l.precio >= $5)
  AND ($6::bigint IS NULL OR l.precio <= $6)
  AND ($7::float8 IS NULL OR l.area_m2 >= $7)
  AND ($8::int    IS NULL OR l.habitaciones = $8)
  AND ($9::boolean IS NOT TRUE OR l.fuente = 'medellinliving')
  AND ($10::float8 IS NULL OR l.area_m2 <= $10)
  AND ($11::float8 IS NULL OR (CASE WHEN $11 >= 4 THEN l.banos >= $11 ELSE l.banos = $11 END))
  AND ($12::int    IS NULL OR bc.cd_comuna = $12)
  AND ($13::int    IS NULL OR (g.estrato_real = $13 AND g.estrato_real BETWEEN 1 AND 6))
  AND ($14::text   IS NULL OR EXISTS (
      SELECT 1 FROM raw.listings_metrocuadrado _lmc
      WHERE _lmc.url = l.url
        AND _lmc.raw_data::text LIKE '%tiempoConstruido:' || $14 || '%'
  ))
  {amenidades_filter}
"""
_COUNT_SQL = _COUNT_SQL_TMPL.format(amenidades_filter="")

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
    min_listings: int = 1,
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


async def _count_and_fetch(
    pool: Any, args: tuple, fetch_limit: int, fetch_offset: int,
    count_sql: str | None = None,
    listings_sql: str | None = None,
) -> tuple:
    """Run COUNT + LISTINGS concurrently. Returns (count, rows)."""
    csql = count_sql if count_sql is not None else _COUNT_SQL
    lsql = (listings_sql if listings_sql is not None else _LISTINGS_SQL) + f" LIMIT {fetch_limit} OFFSET {fetch_offset}"
    count, rows = await asyncio.gather(
        pool.fetchval(csql, *args),
        pool.fetch(lsql, *args),
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
    area_max: Optional[float] = Query(default=None),
    banos: Optional[float] = Query(default=None),
    cd_comuna: Optional[int] = Query(default=None),
    estrato_real: Optional[int] = Query(default=None),
    antiguedad: Optional[str] = Query(default=None),
    amenidades: Optional[list[str]] = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    current_user: Optional[dict] = Depends(get_optional_user),
):
    if estrato_real is not None and estrato_real not in (1, 2, 3, 4, 5, 6):
        raise HTTPException(status_code=422, detail="estrato_real must be 1–6")

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

    am_clauses, am_extra = _build_amenidades_sql(amenidades or [])
    _eff_count_sql    = _COUNT_SQL_TMPL.format(amenidades_filter=am_clauses)
    _eff_listings_sql = _LISTINGS_SQL_TMPL.format(amenidades_filter=am_clauses)

    def _args(tipo_op: Optional[str]) -> tuple:
        return (municipio, barrio_ids, tipo_op, tipo_inmueble,
                precio_min, precio_max, area_min, habitaciones, only_premium,
                area_max, banos, cd_comuna, estrato_real, antiguedad) + tuple(am_extra)

    # Unified venta+arriendo path: 2 parallel fetches → balanced results, 1 HTTP round-trip.
    # Only applies when: no tipo_operacion filter, barrio selected, no premium, no personalization, page 0.
    if (tipo_operacion is None and barrio_id is not None
            and not only_premium and not perfil_dict and offset == 0):
        half = max(1, limit // 2)
        (total_v, rows_v), (total_a, rows_a) = await asyncio.gather(
            _count_and_fetch(pool, _args("venta"),    half, 0, _eff_count_sql, _eff_listings_sql),
            _count_and_fetch(pool, _args("arriendo"), half, 0, _eff_count_sql, _eff_listings_sql),
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
            pool.fetchval(_eff_count_sql, *args),
            pool.fetch(_eff_listings_sql + f" LIMIT {fetch_limit} OFFSET {fetch_offset}", *args),
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
           precio_cop, area_m2, NULLIF(habitaciones, -1) AS habitaciones, banos,
           direccion_raw, barrio_id, url, fotos,
           NULL::date AS fecha_publicacion,
           CASE
               WHEN precio_m2 > 0 AND precio_m2 < 2147483647 THEN precio_m2::int
               WHEN area_m2 > 0 THEN ROUND(precio_cop::float8 / area_m2)::int
               ELSE NULL
           END AS pm2
    FROM staging.stg_listings_unificado
    WHERE ('x'||substr(md5(url),1,8))::bit(32)::int = $1
),
p_range AS (
    SELECT
        PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY precio_cop::float/NULLIF(area_m2,0))
            FILTER (WHERE tipo_operacion='venta' AND area_m2>0
                    AND precio_cop::float/area_m2 BETWEEN 500000 AND 50000000) AS m2_p25,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY precio_cop::float/NULLIF(area_m2,0))
            FILTER (WHERE tipo_operacion='venta' AND area_m2>0
                    AND precio_cop::float/area_m2 BETWEEN 500000 AND 50000000) AS m2_p75,
        PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY precio_cop::float)
            FILTER (WHERE tipo_operacion='arriendo'
                    AND precio_cop BETWEEN 300000 AND 50000000) AS arr_p25,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY precio_cop::float)
            FILTER (WHERE tipo_operacion='arriendo'
                    AND precio_cop BETWEEN 300000 AND 50000000) AS arr_p75
    FROM staging.stg_listings_unificado
    WHERE barrio_id  = (SELECT barrio_id FROM listing)
      AND tipo_inmueble IS NOT DISTINCT FROM (SELECT tipo_inmueble FROM listing)
      AND precio_cop > 0
)
SELECT
    l.id,
    l.listing_uid,
    l.fuente,
    CASE
        WHEN l.tier = 'agente_premium' THEN 'agente_verificado'
        WHEN l.fuente = 'propio' AND _lp_owner.owner_plan IN ('pro', 'agente') THEN 'propio_pro'
        WHEN l.fuente = 'propio' THEN 'propio'
        ELSE l.fuente
    END AS fuente_display,
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
    b.nombre                           AS barrio_nombre,
    INITCAP(LOWER(b.nombre))           AS barrio_display,
    b.municipio,
    INITCAP(LOWER(b.municipio))        AS municipio_display,
    INITCAP(LOWER(b.comuna)) AS comuna_nombre,
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
    (CURRENT_DATE - lm.fecha_primera_vez::date)::int
                                       AS dias_en_mercado,
    l.fecha_publicacion::text,
    NULL::timestamp AS fecha_ultima_verificacion,
    ctx.yield_bruto_pct,
    ctx.score_corto,
    ctx.score_mediano,
    ctx.score_largo,
    ctx.liquidez_score,
    ctx.indice_nomada,
    ctx.seguridad_score,
    ctx.var_anual_pct,
    COALESCE(_fav.favoritos_count, 0)  AS favoritos_count,
    COALESCE(_vistas.vistas, 0)        AS vistas,
    lm.raw_data->>'tiempoConstruido'   AS antiguedad,
    NULLIF(REPLACE(COALESCE(lm.raw_data->>'valorAdministracion', ''), '.', ''), '')::bigint AS administracion,
    COALESCE(l.fotos, lp.fotos)        AS fotos,
    pr.m2_p25::int  AS precio_m2_p25,
    pr.m2_p75::int  AS precio_m2_p75,
    pr.arr_p25::int AS arr_p25,
    pr.arr_p75::int AS arr_p75
FROM listing l
JOIN raw.barrios b ON b.id = l.barrio_id
JOIN analytics.listings_georef g ON g.url = l.url
LEFT JOIN analytics.barrios_medianas m
    ON m.barrio_id = l.barrio_id
    AND m.tipo_inmueble IS NOT DISTINCT FROM l.tipo_inmueble
LEFT JOIN analytics.barrios_cd bc ON bc.barrio_id = l.barrio_id
LEFT JOIN analytics.barrios_contexto ctx ON ctx.barrio_id = l.barrio_id
LEFT JOIN raw.listings_metrocuadrado lm ON lm.url = l.url AND l.fuente = 'metrocuadrado'
LEFT JOIN raw.listings_premium lp ON lp.url = l.url
LEFT JOIN (
    SELECT url, COUNT(*)::int AS favoritos_count
    FROM raw.favoritos_listings GROUP BY url
) _fav ON _fav.url = l.url
LEFT JOIN (
    SELECT entity_id, COUNT(*)::int AS vistas
    FROM public.user_events
    WHERE event_type = 'listing_view' AND entity_type = 'listing'
    GROUP BY entity_id
) _vistas ON _vistas.entity_id = l.url
LEFT JOIN (
    SELECT lp2.id::text AS lp_url, u.plan AS owner_plan
    FROM public.listings_propios lp2
    JOIN public.usuarios u ON u.id = lp2.user_id
) _lp_owner ON _lp_owner.lp_url = l.url AND l.fuente = 'propio'
CROSS JOIN p_range pr
LIMIT 1
""".format(usd=int(_USD))


_PRECIO_HISTORIA_SQL = """
SELECT precio_nuevo AS precio, fecha_cambio::text AS fecha,
       round(((precio_nuevo - precio_anterior)::float8 / NULLIF(precio_anterior, 0) * 100)::numeric, 1)::float8 AS delta_pct
FROM raw.listings_precio_historial
WHERE listing_url = $1
ORDER BY fecha_cambio ASC
"""


@router.get("/{listing_id}", response_model=ListingDetail)
async def get_listing_by_id(
    listing_id: int,
    current_user: Optional[dict] = Depends(get_optional_user),
):
    pool = get_pool()
    row = await pool.fetchrow(_LISTING_BY_ID_SQL, listing_id)
    if not row:
        raise HTTPException(status_code=404, detail="Listing not found")
    row_d = dict(row)
    historia = await pool.fetch(_PRECIO_HISTORIA_SQL, row_d.get("url") or "")
    row_d["precio_historia"] = [dict(h) for h in historia] if historia else []
    return ListingDetail(**row_d)


class SimilarListing(BaseModel):
    id: int
    url: str
    precio_cop: Optional[int] = None
    area_m2: Optional[float] = None
    habitaciones: Optional[int] = None
    banos: Optional[float] = None
    barrio_nombre: Optional[str] = None
    dias_en_mercado: Optional[int] = None
    foto_principal: Optional[str] = None
    tipo_inmueble: Optional[str] = None


_SIMILARES_SQL = """
WITH ref AS (
    SELECT l.barrio_id, l.tipo_inmueble, l.precio_cop, l.tipo_operacion, l.url,
           bc.cd_comuna
    FROM staging.stg_listings_unificado l
    LEFT JOIN analytics.barrios_cd bc ON bc.barrio_id = l.barrio_id
    WHERE ('x'||substr(md5(l.url),1,8))::bit(32)::int = $1
    LIMIT 1
),
barrio_matches AS (
    SELECT ('x'||substr(md5(l.url),1,8))::bit(32)::int AS id,
           l.url, l.precio_cop, l.area_m2,
           NULLIF(l.habitaciones, -1) AS habitaciones, l.banos,
           b.nombre AS barrio_nombre,
           NULL::int AS dias_en_mercado,
           COALESCE(l.fotos[1], lp.fotos[1]) AS foto_principal,
           l.tipo_inmueble,
           1 AS scope_priority
    FROM staging.stg_listings_unificado l
    JOIN raw.barrios b ON b.id = l.barrio_id
    JOIN analytics.listings_georef g ON g.url = l.url
    LEFT JOIN raw.listings_premium lp ON lp.url = l.url
    JOIN ref r ON r.barrio_id = l.barrio_id
    WHERE l.url <> (SELECT url FROM ref)
      AND l.tipo_operacion = (SELECT tipo_operacion FROM ref)
      AND l.tipo_inmueble  IS NOT DISTINCT FROM (SELECT tipo_inmueble FROM ref)
      AND l.precio_cop BETWEEN (SELECT precio_cop FROM ref) * 0.80
                            AND (SELECT precio_cop FROM ref) * 1.20
),
comuna_matches AS (
    SELECT ('x'||substr(md5(l.url),1,8))::bit(32)::int AS id,
           l.url, l.precio_cop, l.area_m2,
           NULLIF(l.habitaciones, -1) AS habitaciones, l.banos,
           b.nombre AS barrio_nombre,
           NULL::int AS dias_en_mercado,
           COALESCE(l.fotos[1], lp.fotos[1]) AS foto_principal,
           l.tipo_inmueble,
           2 AS scope_priority
    FROM staging.stg_listings_unificado l
    JOIN raw.barrios b ON b.id = l.barrio_id
    JOIN analytics.listings_georef g ON g.url = l.url
    LEFT JOIN analytics.barrios_cd bc2 ON bc2.barrio_id = l.barrio_id
    LEFT JOIN raw.listings_premium lp ON lp.url = l.url
    JOIN ref r ON r.cd_comuna = bc2.cd_comuna AND r.cd_comuna IS NOT NULL
    WHERE l.url <> (SELECT url FROM ref)
      AND l.barrio_id <> (SELECT barrio_id FROM ref)
      AND l.tipo_operacion = (SELECT tipo_operacion FROM ref)
      AND l.tipo_inmueble  IS NOT DISTINCT FROM (SELECT tipo_inmueble FROM ref)
      AND l.precio_cop BETWEEN (SELECT precio_cop FROM ref) * 0.80
                            AND (SELECT precio_cop FROM ref) * 1.20
),
combined AS (
    SELECT * FROM barrio_matches
    UNION ALL
    SELECT cm.* FROM comuna_matches cm
    WHERE (SELECT COUNT(*) FROM barrio_matches) < 2
)
SELECT DISTINCT ON (id) id, url, precio_cop, area_m2, habitaciones,
       banos, barrio_nombre, dias_en_mercado, foto_principal, tipo_inmueble
FROM combined
ORDER BY id, scope_priority ASC, dias_en_mercado ASC NULLS LAST
LIMIT 4
"""


@router.get("/{listing_id}/similares", response_model=list[SimilarListing])
async def get_similares(listing_id: int):
    pool = get_pool()
    rows = await pool.fetch(_SIMILARES_SQL, listing_id)
    return [SimilarListing(**dict(r)) for r in rows]


class VistaPayload(BaseModel):
    ip_hash: Optional[str] = None


@router.post("/{listing_id}/vista")
async def registrar_vista(
    listing_id: int,
    request: Request,
    payload: Optional[VistaPayload] = None,
    current_user: Optional[dict] = Depends(get_optional_user),
):
    pool = get_pool()
    url_row = await pool.fetchrow(
        """SELECT url FROM staging.stg_listings_unificado
           WHERE ('x'||substr(md5(url),1,8))::bit(32)::int = $1
           LIMIT 1""",
        listing_id,
    )
    if not url_row:
        return {"ok": False, "vistas": 0}

    listing_url: str = url_row["url"]
    usuario_id: Optional[int] = current_user["id"] if current_user else None

    ip_raw = request.headers.get("X-Forwarded-For", request.client.host if request.client else "")
    ip_hash = hashlib.sha256(ip_raw.encode()).hexdigest()[:16] if ip_raw else None

    session_id = f"anon-{ip_hash or 'unknown'}"

    try:
        await pool.execute(
            """INSERT INTO public.user_events
                   (usuario_id, session_id, event_type, entity_type, entity_id)
               VALUES ($1, $2, 'listing_view', 'listing', $3)""",
            usuario_id,
            session_id,
            listing_url,
        )
    except Exception:
        pass

    vistas = await pool.fetchval(
        """SELECT COUNT(*)::int FROM public.user_events
           WHERE event_type = 'listing_view' AND entity_type = 'listing' AND entity_id = $1""",
        listing_url,
    )
    return {"ok": True, "vistas": vistas or 0}
