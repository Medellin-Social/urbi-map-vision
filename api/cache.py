"""Materialized cache refresh for listings query.

Replaces 3 per-request CTEs (med, bctx, barrio_cd) and 3-way lat/lon JOINs
with pre-computed analytics tables. Called on API startup and every hour.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

logger = logging.getLogger(__name__)

_CACHE_REFRESH_INTERVAL = 3600  # seconds

_INSERT_BARRIOS_MEDIANAS = """
INSERT INTO analytics.barrios_medianas (barrio_id, tipo_inmueble, m2_mediana, arr_mediana, refreshed_at)
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
    )::bigint AS m2_mediana,
    PERCENTILE_CONT(0.5) WITHIN GROUP (
        ORDER BY precio::float
    ) FILTER (WHERE tipo_operacion = 'arriendo')::bigint AS arr_mediana,
    now()
FROM staging.stg_listings
WHERE activo = TRUE AND precio > 0
GROUP BY barrio_id, tipo_inmueble
"""

_INSERT_BARRIOS_CONTEXTO = """
INSERT INTO analytics.barrios_contexto (
    barrio_id, yield_bruto_pct, n_listings_airbnb,
    score_corto, score_mediano, score_largo,
    liquidez_score, indice_nomada, seguridad_score,
    var_anual_pct, pct_wifi, refreshed_at
)
SELECT
    bm.barrio_id,
    bm.yield_bruto                AS yield_bruto_pct,
    bm.airbnb_n_listings          AS n_listings_airbnb,
    sc.score_corto,
    sc.score_mediano,
    sc.score_largo,
    lq.liquidez_score,
    poi.indice_nomada,
    seg.score_seguridad_residente AS seguridad_score,
    sl.var_anual_5anos_pct        AS var_anual_pct,
    am.pct_wifi,
    now()
FROM analytics.barrios_mercado bm
LEFT JOIN analytics.barrios_score_consolidado sc  ON sc.barrio_id = bm.barrio_id
LEFT JOIN analytics.barrios_liquidez          lq  ON lq.barrio_id = bm.barrio_id
LEFT JOIN analytics.barrios_pois_distancia    poi ON poi.barrio_id = bm.barrio_id
LEFT JOIN analytics.barrios_seguridad         seg ON seg.barrio_id = bm.barrio_id
LEFT JOIN analytics.score_largo_plazo         sl  ON sl.barrio_id = bm.barrio_id
LEFT JOIN analytics.barrios_amenities         am  ON am.barrio_id = bm.barrio_id
ON CONFLICT (barrio_id) DO UPDATE SET
    yield_bruto_pct   = EXCLUDED.yield_bruto_pct,
    n_listings_airbnb = EXCLUDED.n_listings_airbnb,
    score_corto       = EXCLUDED.score_corto,
    score_mediano     = EXCLUDED.score_mediano,
    score_largo       = EXCLUDED.score_largo,
    liquidez_score    = EXCLUDED.liquidez_score,
    indice_nomada     = EXCLUDED.indice_nomada,
    seguridad_score   = EXCLUDED.seguridad_score,
    var_anual_pct     = EXCLUDED.var_anual_pct,
    pct_wifi          = EXCLUDED.pct_wifi,
    refreshed_at      = EXCLUDED.refreshed_at
"""

_INSERT_LISTINGS_GEOREF = """
INSERT INTO analytics.listings_georef (url, lat, lon, url_activa, estrato_real, refreshed_at)
SELECT
    l.url,
    COALESCE(lm.lat, lf.lat, lp.lat)          AS lat,
    COALESCE(lm.lon, lf.lon, lp.lon)          AS lon,
    COALESCE(lm.url_activa, lf.url_activa)    AS url_activa,
    COALESCE(lm.estrato_real, lf.estrato_real) AS estrato_real,
    now()
FROM (
    SELECT DISTINCT url, fuente FROM staging.stg_listings
    WHERE activo = TRUE AND precio >= 500000
      AND NOT (tipo_operacion = 'arriendo' AND precio > 50000000)
      AND NOT (tipo_operacion = 'venta'    AND precio > 50000000000)
    UNION ALL
    SELECT DISTINCT url, 'medellinliving'::text FROM raw.listings_premium
    WHERE precio_cop >= 500000 AND tipo_operacion IS NOT NULL
) l
LEFT JOIN raw.listings_metrocuadrado lm ON lm.url = l.url AND l.fuente = 'metrocuadrado'
LEFT JOIN raw.listings_fincaraiz lf     ON lf.url = l.url AND l.fuente = 'fincaraiz'
LEFT JOIN raw.listings_premium lp       ON lp.url = l.url AND l.fuente = 'medellinliving'
WHERE COALESCE(lm.lat, lf.lat, lp.lat) IS NOT NULL
  AND COALESCE(lm.lat, lf.lat, lp.lat) != 0
ON CONFLICT (url) DO UPDATE SET
    lat          = EXCLUDED.lat,
    lon          = EXCLUDED.lon,
    url_activa   = EXCLUDED.url_activa,
    estrato_real = EXCLUDED.estrato_real,
    refreshed_at = EXCLUDED.refreshed_at
"""


async def refresh_listings_cache(pool: Any) -> None:
    """Refresh all 3 dynamic cache tables. barrios_cd is static — not refreshed here."""
    try:
        async with pool.acquire() as conn:
            # barrios_medianas: TRUNCATE+INSERT in transaction (PERCENTILE_CONT result set
            # is fully computed before lock, so the lock window is just the INSERT, not the scan)
            async with conn.transaction():
                await conn.execute("TRUNCATE analytics.barrios_medianas")
                await conn.execute(_INSERT_BARRIOS_MEDIANAS)
            logger.info("[cache] barrios_medianas refreshed")

            # barrios_contexto: upsert — analytics tables read-only, no truncate needed
            await conn.execute(_INSERT_BARRIOS_CONTEXTO)
            logger.info("[cache] barrios_contexto refreshed")

            # listings_georef: upsert — adds new listings, updates changed lat/lon
            await conn.execute(_INSERT_LISTINGS_GEOREF)
            logger.info("[cache] listings_georef refreshed")

    except Exception as exc:
        logger.warning("[cache] refresh failed: %s", exc)


async def run_periodic_cache_refresh(pool: Any) -> None:
    """Background task: refresh listings cache every hour."""
    while True:
        await asyncio.sleep(_CACHE_REFRESH_INTERVAL)
        logger.info("[cache] periodic refresh starting")
        await refresh_listings_cache(pool)
