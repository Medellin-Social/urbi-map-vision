from __future__ import annotations

import json
import time
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from api.db import get_pool
from api.routers.barrios import get_score_col, _score_to_hex

router = APIRouter()

# ── Cache 24 h (ST_Union de 606 polígonos es costoso) ────────────────────────
# { cache_key: (timestamp, geojson_dict) }
_cache: dict[str, tuple[float, Any]] = {}
_CACHE_TTL = 86_400  # segundos

# Target color thresholds — mirror de adapters.ts getTargetBarrioColor
def _comuna_color(
    perfil: Optional[str],
    score: Optional[int],
    precio_m2: Optional[int],
    yield_pct: Optional[float],
    arriendo: Optional[int],
    liquidez: Optional[int],
    target: str,
) -> str:
    TC = {
        "verde": "#3d6b0e",
        "teal":  "#0d7a58",
        "amber": "#7a4c0a",
        "rojo":  "#9e2424",
        "gris":  "#4a4945",
    }
    if target == "buyer":
        if precio_m2 is None: return TC["gris"]
        if precio_m2 < 3_000_000: return TC["verde"]
        if precio_m2 < 5_000_000: return TC["teal"]
        if precio_m2 < 8_000_000: return TC["amber"]
        return TC["rojo"]
    if target == "seller":
        if liquidez is None: return TC["gris"]
        if liquidez > 70: return TC["verde"]
        if liquidez >= 50: return TC["teal"]
        if liquidez >= 30: return TC["amber"]
        return TC["rojo"]
    if target == "landlord":
        if yield_pct is None: return TC["gris"]
        if yield_pct > 8: return TC["verde"]
        if yield_pct >= 6: return TC["teal"]
        if yield_pct >= 4: return TC["amber"]
        return TC["rojo"]
    if target == "renter":
        if arriendo is None: return TC["gris"]
        if arriendo < 1_500_000: return TC["verde"]
        if arriendo < 2_500_000: return TC["teal"]
        if arriendo < 4_000_000: return TC["amber"]
        return TC["rojo"]
    # investor / default → score-based
    return _score_to_hex(score, perfil)


# ── SQL ───────────────────────────────────────────────────────────────────────

_COMUNAS_SQL = """
SELECT
    b.cd_comuna,
    b.comuna,
    ST_AsGeoJSON(
        ST_SimplifyPreserveTopology(ST_Union(b.geometry), 0.0004)
    ) AS geometry_raw,
    ROUND(AVG({score_col}) FILTER (WHERE {score_col} > 0))::int
                                             AS score_promedio,
    ROUND(
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bm.precio_venta_m2_p50)
        FILTER (WHERE bm.precio_venta_m2_p50 > 0)
    )::int                                   AS precio_m2_cop,
    ROUND(
        AVG(bm.yield_bruto) FILTER (WHERE bm.yield_bruto > 0),
        2
    )                                        AS yield_promedio,
    ROUND(
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bm.precio_arriendo_p50)
        FILTER (WHERE bm.precio_arriendo_p50 > 0)
    )::int                                   AS arriendo_cop,
    ROUND(
        AVG(lq.liquidez_score) FILTER (WHERE lq.liquidez_score > 0)
    )::int                                   AS liquidez_score,
    COUNT(DISTINCT b.id)::int                AS total_barrios,
    COALESCE(SUM(lc.n_venta),    0)::int     AS n_venta,
    COALESCE(SUM(lc.n_arriendo), 0)::int     AS n_arriendo
FROM raw.barrios b
LEFT JOIN analytics.barrios_score_consolidado sc  ON b.id = sc.barrio_id
LEFT JOIN analytics.barrios_mercado           bm  ON b.id = bm.barrio_id
LEFT JOIN analytics.barrios_liquidez          lq  ON b.id = lq.barrio_id
LEFT JOIN (
    SELECT barrio_id,
           COUNT(*) FILTER (WHERE tipo_operacion = 'venta')    AS n_venta,
           COUNT(*) FILTER (WHERE tipo_operacion = 'arriendo') AS n_arriendo
    FROM raw.listings_georef
    WHERE activo = TRUE
    GROUP BY barrio_id
) lc ON b.id = lc.barrio_id
WHERE b.municipio = 'MEDELLÍN'
  AND b.cd_comuna IS NOT NULL
GROUP BY b.cd_comuna, b.comuna
ORDER BY b.cd_comuna
"""

_BARRIOS_IN_COMUNA_SQL = """
SELECT
    b.id                                        AS barrio_id,
    b.nombre,
    b.comuna,
    b.cd_comuna,
    bm.precio_venta_m2_p50                      AS precio_m2_cop,
    bm.precio_arriendo_p50                      AS arriendo_cop,
    bm.yield_bruto                              AS yield_pct,
    sc.{score_col}                              AS score,
    lq.liquidez_score,
    b.excluir_inversion,
    ST_X(ST_Centroid(b.geometry))               AS lon,
    ST_Y(ST_Centroid(b.geometry))               AS lat
FROM raw.barrios b
LEFT JOIN analytics.barrios_score_consolidado sc  ON b.id = sc.barrio_id
LEFT JOIN analytics.barrios_mercado           bm  ON b.id = bm.barrio_id
LEFT JOIN analytics.barrios_liquidez          lq  ON b.id = lq.barrio_id
WHERE b.municipio = 'MEDELLÍN'
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
    GeoJSON de 16 comunas de Medellín con métricas agregadas.
    Resultado cacheado 24 h porque ST_Union de 606 polígonos es costoso.
    """
    cache_key = f"{perfil}|{target}"
    now = time.time()
    if cache_key in _cache:
        ts, data = _cache[cache_key]
        if now - ts < _CACHE_TTL:
            return data

    score_col = get_score_col(perfil)
    sql = _COMUNAS_SQL.format(score_col=f"sc.{score_col}")

    try:
        rows = await pool.fetch(sql)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    features = []
    for i, row in enumerate(rows):
        raw_geo = row.get("geometry_raw")
        if not raw_geo:
            continue
        geometry = json.loads(raw_geo)

        score      = row["score_promedio"]
        precio_m2  = row["precio_m2_cop"]
        yield_pct  = float(row["yield_promedio"]) if row["yield_promedio"] else None
        arriendo   = row["arriendo_cop"]
        liquidez   = row["liquidez_score"]
        cd_comuna  = row["cd_comuna"] or (i + 1)

        color = _comuna_color(perfil, score, precio_m2, yield_pct, arriendo, liquidez, target)

        features.append({
            "type": "Feature",
            "id": cd_comuna,
            "properties": {
                "cd_comuna":     cd_comuna,
                "nombre":        row["comuna"] or "",
                "municipio":     "MEDELLÍN",
                "color_hex":     color,
                "score_promedio": score,
                "precio_m2_cop": precio_m2,
                "yield_promedio": yield_pct,
                "arriendo_cop":  arriendo,
                "liquidez_score": liquidez,
                "total_barrios": row["total_barrios"],
                "n_venta":       row["n_venta"],
                "n_arriendo":    row["n_arriendo"],
                "has_data":      score is not None or precio_m2 is not None,
                "slug_municipio": "medellin",
                "source":        "api",
            },
            "geometry": geometry,
        })

    result: dict = {"type": "FeatureCollection", "features": features}
    _cache[cache_key] = (now, result)
    return result


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
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

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
