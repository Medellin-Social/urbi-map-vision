from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel

from api.db import get_pool

router = APIRouter()

_PERFIL_SCORE = {
    "airbnb": "score_corto",
    "nomadas": "score_mediano",       # legacy alias
    "mediano_plazo": "score_mediano", # canonical new name
    "largo_plazo": "score_largo",
}


class TopBarrio(BaseModel):
    barrio_id: int
    nombre: Optional[str] = None
    municipio: Optional[str] = None
    score: Optional[int] = None
    yield_bruto_pct: Optional[float] = None
    precio_m2_cop: Optional[int] = None


class CiudadStats(BaseModel):
    barrios_analizados: int
    yield_promedio: Optional[float] = None
    precio_m2_mediana: Optional[int] = None
    oportunidades_activas: int
    top5: list[TopBarrio]


@router.get("/ciudad", response_model=CiudadStats)
async def get_ciudad_stats(
    perfil: Optional[str] = Query(default=None, description="airbnb | mediano_plazo | largo_plazo"),
):
    score_col = _PERFIL_SCORE.get(perfil or "", "score_corto")
    pool = get_pool()

    summary = await pool.fetchrow(
        """
        SELECT
            COUNT(bm.barrio_id)::int                                   AS barrios_analizados,
            ROUND(AVG(bm.yield_bruto)::numeric, 1)::float8             AS yield_promedio,
            PERCENTILE_CONT(0.5) WITHIN GROUP (
                ORDER BY bm.precio_venta_m2_p50
            )::int                                                     AS precio_m2_mediana,
            COUNT(CASE WHEN op.oportunidad_detectada THEN 1 END)::int  AS oportunidades_activas
        FROM analytics.barrios_mercado bm
        LEFT JOIN analytics.barrios_oportunidades op ON bm.barrio_id = op.barrio_id
        WHERE bm.yield_bruto IS NOT NULL
        """
    )

    top5_sql = f"""
        SELECT
            sc.barrio_id,
            b.nombre,
            b.municipio,
            sc.{score_col}::int             AS score,
            bm.yield_bruto::float8          AS yield_bruto_pct,
            bm.precio_venta_m2_p50::int     AS precio_m2_cop
        FROM analytics.barrios_score_consolidado sc
        JOIN  raw.barrios b               ON b.id  = sc.barrio_id
        LEFT JOIN analytics.barrios_mercado bm ON bm.barrio_id = sc.barrio_id
        WHERE sc.{score_col} IS NOT NULL
          AND (b.excluir_inversion IS NULL OR b.excluir_inversion = FALSE)
        ORDER BY sc.{score_col} DESC NULLS LAST
        LIMIT 5
    """
    top5_rows = await pool.fetch(top5_sql)

    return CiudadStats(
        barrios_analizados=summary["barrios_analizados"] or 0,
        yield_promedio=float(summary["yield_promedio"]) if summary["yield_promedio"] else None,
        precio_m2_mediana=summary["precio_m2_mediana"],
        oportunidades_activas=summary["oportunidades_activas"] or 0,
        top5=[TopBarrio(**dict(r)) for r in top5_rows],
    )
