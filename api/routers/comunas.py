from __future__ import annotations

import logging
import time
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from api.db import get_pool
from api.routers.barrios import get_score_col

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Cache 24 h ────────────────────────────────────────────────────────────────
# { cache_key: (timestamp, metrics_dict) }
_cache: dict[str, tuple[float, Any]] = {}
_CACHE_TTL = 86_400  # segundos

# ── SQL ───────────────────────────────────────────────────────────────────────

_COMUNAS_SQL = """
SELECT
    bc.cd_comuna,
    b.comuna,
    ROUND(AVG({score_col}) FILTER (WHERE {score_col} > 0))::int  AS score_promedio,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bm.precio_venta_m2_p50)
        FILTER (WHERE bm.precio_venta_m2_p50 > 0))::int          AS precio_m2_cop,
    ROUND(AVG(bm.yield_bruto) FILTER (WHERE bm.yield_bruto > 0)::numeric, 2) AS yield_promedio,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bm.precio_arriendo_p50)
        FILTER (WHERE bm.precio_arriendo_p50 > 0))::int          AS arriendo_cop,
    ROUND(AVG(lq.liquidez_score) FILTER (WHERE lq.liquidez_score > 0))::int AS liquidez_score,
    COUNT(DISTINCT b.id)::int                AS total_barrios,
    COALESCE(SUM(lc.n_venta),    0)::int     AS n_venta,
    COALESCE(SUM(lc.n_arriendo), 0)::int     AS n_arriendo
FROM raw.barrios b
JOIN analytics.barrios_cd bc                     ON bc.barrio_id = b.id
LEFT JOIN analytics.barrios_score_consolidado sc  ON b.id = sc.barrio_id
LEFT JOIN analytics.barrios_mercado           bm  ON b.id = bm.barrio_id
LEFT JOIN analytics.barrios_liquidez          lq  ON b.id = lq.barrio_id
LEFT JOIN (
    SELECT barrio_id,
           COUNT(*) FILTER (WHERE tipo_operacion = 'venta')    AS n_venta,
           COUNT(*) FILTER (WHERE tipo_operacion = 'arriendo') AS n_arriendo
    FROM staging.stg_listings_unificado
    WHERE barrio_id IS NOT NULL
    GROUP BY barrio_id
) lc ON b.id = lc.barrio_id
WHERE b.municipio = 'MEDELLIN'
GROUP BY bc.cd_comuna, b.comuna
ORDER BY bc.cd_comuna
"""

_MUNICIPIOS_SQL = """
SELECT
    CASE b.municipio
        WHEN 'BELLO'       THEN 101
        WHEN 'ENVIGADO'    THEN 102
        WHEN 'ITAGUI'      THEN 103
        WHEN 'SABANETA'    THEN 104
        WHEN 'LA ESTRELLA' THEN 105
    END                                          AS cd_comuna,
    b.municipio                                  AS comuna,
    ROUND(AVG({score_col}) FILTER (WHERE {score_col} > 0))::int  AS score_promedio,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bm.precio_venta_m2_p50)
        FILTER (WHERE bm.precio_venta_m2_p50 > 0))::int          AS precio_m2_cop,
    ROUND(AVG(bm.yield_bruto) FILTER (WHERE bm.yield_bruto > 0)::numeric, 2) AS yield_promedio,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bm.precio_arriendo_p50)
        FILTER (WHERE bm.precio_arriendo_p50 > 0))::int          AS arriendo_cop,
    ROUND(AVG(lq.liquidez_score) FILTER (WHERE lq.liquidez_score > 0))::int AS liquidez_score,
    COUNT(DISTINCT b.id)::int                    AS total_barrios,
    COALESCE(SUM(lc.n_venta),    0)::int         AS n_venta,
    COALESCE(SUM(lc.n_arriendo), 0)::int         AS n_arriendo
FROM raw.barrios b
LEFT JOIN analytics.barrios_score_consolidado sc  ON b.id = sc.barrio_id
LEFT JOIN analytics.barrios_mercado           bm  ON b.id = bm.barrio_id
LEFT JOIN analytics.barrios_liquidez          lq  ON b.id = lq.barrio_id
LEFT JOIN (
    SELECT barrio_id,
           COUNT(*) FILTER (WHERE tipo_operacion = 'venta')    AS n_venta,
           COUNT(*) FILTER (WHERE tipo_operacion = 'arriendo') AS n_arriendo
    FROM staging.stg_listings_unificado
    WHERE barrio_id IS NOT NULL
    GROUP BY barrio_id
) lc ON b.id = lc.barrio_id
WHERE b.municipio IN ('BELLO', 'ENVIGADO', 'ITAGUI', 'SABANETA', 'LA ESTRELLA')
GROUP BY b.municipio
ORDER BY b.municipio
"""

_BARRIOS_IN_COMUNA_SQL = """
SELECT
    b.id                                        AS barrio_id,
    b.nombre,
    b.comuna,
    bc.cd_comuna,
    bm.precio_venta_m2_p50                      AS precio_m2_cop,
    bm.precio_arriendo_p50                      AS arriendo_cop,
    bm.yield_bruto                              AS yield_pct,
    sc.{score_col}                              AS score,
    lq.liquidez_score,
    b.excluir_inversion,
    ST_X(ST_Centroid(b.geometry))               AS lon,
    ST_Y(ST_Centroid(b.geometry))               AS lat
FROM raw.barrios b
JOIN analytics.barrios_cd bc                     ON bc.barrio_id = b.id
LEFT JOIN analytics.barrios_score_consolidado sc  ON b.id = sc.barrio_id
LEFT JOIN analytics.barrios_mercado           bm  ON b.id = bm.barrio_id
LEFT JOIN analytics.barrios_liquidez          lq  ON b.id = lq.barrio_id
WHERE b.municipio = 'MEDELLIN'
  AND UPPER(TRIM(b.comuna)) = UPPER(TRIM($1))
ORDER BY b.nombre
"""


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/geojson")
async def get_comunas_geojson(
    perfil: Optional[str] = Query(None),
    target: str           = Query("investor"),
    pool=Depends(get_pool),
) -> dict:
    """
    Métricas por cd_comuna — geometría se sirve desde archivos GeoJSON estáticos en el frontend.
    Resultado cacheado 24 h.
    """
    cache_key = f"{perfil}|{target}"
    now = time.time()
    if cache_key in _cache:
        ts, data = _cache[cache_key]
        if now - ts < _CACHE_TTL:
            return data

    score_col = get_score_col(perfil)
    score_expr = f"sc.{score_col}"
    sql_medellin   = _COMUNAS_SQL.format(score_col=score_expr)
    sql_municipios = _MUNICIPIOS_SQL.format(score_col=score_expr)

    try:
        rows_medellin   = await pool.fetch(sql_medellin)
        rows_municipios = await pool.fetch(sql_municipios)
    except Exception:
        logger.exception("Error inesperado")
        raise HTTPException(status_code=500, detail="Error interno del servidor")

    metrics: dict[str, dict] = {}

    for i, row in enumerate(rows_medellin):
        score     = row["score_promedio"]
        precio_m2 = row["precio_m2_cop"]
        yield_pct = float(row["yield_promedio"]) if row["yield_promedio"] else None
        arriendo  = row["arriendo_cop"]
        liquidez  = row["liquidez_score"]
        cd_comuna = row["cd_comuna"] or (i + 1)
        metrics[str(cd_comuna)] = {
            "cd_comuna":      cd_comuna,
            "nombre":         row["comuna"] or "",
            "municipio":      "MEDELLÍN",
            "score_promedio": score,
            "precio_m2_cop":  precio_m2,
            "yield_promedio": yield_pct,
            "arriendo_cop":   arriendo,
            "liquidez_score": liquidez,
            "total_barrios":  row["total_barrios"],
            "n_venta":        row["n_venta"],
            "n_arriendo":     row["n_arriendo"],
            "has_data":       score is not None or precio_m2 is not None,
            "slug_municipio": "medellin",
            "is_municipio":   False,
        }

    for row in rows_municipios:
        cd_comuna = row["cd_comuna"]
        if cd_comuna is None:
            continue
        score     = row["score_promedio"]
        precio_m2 = row["precio_m2_cop"]
        yield_pct = float(row["yield_promedio"]) if row["yield_promedio"] else None
        arriendo  = row["arriendo_cop"]
        liquidez  = row["liquidez_score"]
        municipio = row["comuna"] or ""
        slug      = municipio.lower().replace(" ", "_")
        metrics[str(cd_comuna)] = {
            "cd_comuna":      cd_comuna,
            "nombre":         municipio,
            "municipio":      municipio,
            "score_promedio": score,
            "precio_m2_cop":  precio_m2,
            "yield_promedio": yield_pct,
            "arriendo_cop":   arriendo,
            "liquidez_score": liquidez,
            "total_barrios":  row["total_barrios"],
            "n_venta":        row["n_venta"],
            "n_arriendo":     row["n_arriendo"],
            "has_data":       score is not None or precio_m2 is not None,
            "slug_municipio": slug,
            "is_municipio":   True,
        }

    result: dict = {"metrics": metrics}
    _cache[cache_key] = (now, result)
    return result


@router.get("/cd/{cd_comuna}/barrios")
async def get_barrios_in_comuna_by_cd(
    cd_comuna: int,
    perfil: Optional[str] = Query(None),
    pool=Depends(get_pool),
) -> list[dict]:
    """Lista de barrios de una comuna por cd_comuna (más confiable que nombre)."""
    score_col = get_score_col(perfil)
    sql = """
SELECT
    b.id                                        AS barrio_id,
    b.nombre,
    b.comuna,
    bc.cd_comuna,
    bm.precio_venta_m2_p50                      AS precio_m2_cop,
    bm.precio_arriendo_p50                      AS arriendo_cop,
    bm.yield_bruto                              AS yield_pct,
    sc.{score_col}                              AS score,
    lq.liquidez_score,
    b.excluir_inversion,
    ST_X(ST_Centroid(b.geometry))               AS lon,
    ST_Y(ST_Centroid(b.geometry))               AS lat
FROM raw.barrios b
JOIN analytics.barrios_cd bc                     ON bc.barrio_id = b.id
LEFT JOIN analytics.barrios_score_consolidado sc  ON b.id = sc.barrio_id
LEFT JOIN analytics.barrios_mercado           bm  ON b.id = bm.barrio_id
LEFT JOIN analytics.barrios_liquidez          lq  ON b.id = lq.barrio_id
WHERE bc.cd_comuna = $1
ORDER BY b.nombre
""".format(score_col=score_col)

    try:
        rows = await pool.fetch(sql, cd_comuna)
    except Exception:
        logger.exception("Error inesperado")
        raise HTTPException(status_code=500, detail="Error interno del servidor")

    return [
        {
            "barrio_id":      row["barrio_id"],
            "nombre":         row["nombre"],
            "comuna":         row["comuna"],
            "cd_comuna":      row["cd_comuna"],
            "precio_m2_cop":  row["precio_m2_cop"],
            "arriendo_cop":   row["arriendo_cop"],
            "yield_pct":      float(row["yield_pct"]) if row["yield_pct"] else None,
            "score":          row["score"],
            "liquidez_score": row["liquidez_score"],
            "excluir":        bool(row["excluir_inversion"]),
            "lat":            float(row["lat"]) if row["lat"] else None,
            "lon":            float(row["lon"]) if row["lon"] else None,
        }
        for row in rows
    ]


@router.get("/{nombre}/barrios")
async def get_barrios_in_comuna(
    nombre: str,
    perfil: Optional[str] = Query(None),
    pool=Depends(get_pool),
) -> list[dict]:
    """Lista de barrios de una comuna con métricas para drill-down."""
    score_col = get_score_col(perfil)
    sql = _BARRIOS_IN_COMUNA_SQL.format(score_col=score_col)

    try:
        rows = await pool.fetch(sql, nombre)
    except Exception:
        logger.exception("Error inesperado")
        raise HTTPException(status_code=500, detail="Error interno del servidor")

    return [
        {
            "barrio_id":      row["barrio_id"],
            "nombre":         row["nombre"],
            "comuna":         row["comuna"],
            "cd_comuna":      row["cd_comuna"],
            "precio_m2_cop":  row["precio_m2_cop"],
            "arriendo_cop":   row["arriendo_cop"],
            "yield_pct":      float(row["yield_pct"]) if row["yield_pct"] else None,
            "score":          row["score"],
            "liquidez_score": row["liquidez_score"],
            "excluir":        bool(row["excluir_inversion"]),
            "lat":            float(row["lat"]) if row["lat"] else None,
            "lon":            float(row["lon"]) if row["lon"] else None,
        }
        for row in rows
    ]
