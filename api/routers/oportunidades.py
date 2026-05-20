from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from api.db import get_pool
from api.dependencies import get_optional_user

router = APIRouter()

# Explicit whitelist: score_col is interpolated into SQL, so it MUST only
# ever be one of these three known column names. Never accept user input directly.
_PERFIL_SCORE = {
    "airbnb": "score_corto",
    "nomadas": "score_mediano",       # legacy alias
    "mediano_plazo": "score_mediano", # canonical new name
    "largo_plazo": "score_largo",
}


def get_score_col(perfil: Optional[str]) -> str:
    """Return a safe, whitelisted column name. See barrios.py for rationale."""
    return _PERFIL_SCORE.get(perfil or "", "score_corto")


class Oportunidad(BaseModel):
    barrio_id: int
    nombre_barrio: Optional[str]
    comuna: Optional[str]
    municipio: Optional[str]
    tipo_oportunidad: Optional[str]
    descripcion_oportunidad: Optional[str]
    score_relevante: Optional[int]
    liquidez_score: Optional[int]
    categoria_liquidez: Optional[str]
    tiempo_estimado_venta: Optional[str]
    estado_precio: Optional[str]
    yield_bruto_pct: Optional[float]


@router.get("", response_model=list[Oportunidad])
async def list_oportunidades(
    perfil: Optional[str] = Query(default=None, description="airbnb | mediano_plazo | largo_plazo"),
    limit: int = Query(default=10, ge=1, le=50),
    current_user: Optional[dict] = Depends(get_optional_user),
):
    pool = get_pool()

    # Resolve perfil: query param > user profile > default
    effective_perfil = perfil
    if not effective_perfil and current_user:
        row = await pool.fetchrow(
            "SELECT objetivo FROM perfil_inversor WHERE usuario_id = $1 ORDER BY id DESC LIMIT 1",
            current_user["id"],
        )
        if row and row["objetivo"]:
            effective_perfil = row["objetivo"]

    score_col = get_score_col(effective_perfil)

    sql = f"""
        SELECT
            op.barrio_id,
            op.nombre_barrio,
            op.comuna,
            op.municipio,
            op.tipo_oportunidad,
            op.descripcion_oportunidad,
            sc.{score_col}              AS score_relevante,
            lq.liquidez_score,
            lq.categoria_liquidez,
            lq.tiempo_estimado_venta,
            op.estado_precio,
            bm.yield_bruto::float8      AS yield_bruto_pct
        FROM analytics.barrios_oportunidades op
        JOIN analytics.barrios_score_consolidado sc ON op.barrio_id = sc.barrio_id
        LEFT JOIN analytics.barrios_liquidez lq     ON op.barrio_id = lq.barrio_id
        LEFT JOIN analytics.barrios_mercado bm      ON op.barrio_id = bm.barrio_id
        WHERE op.oportunidad_detectada = TRUE
        ORDER BY sc.{score_col} DESC NULLS LAST
        LIMIT $1
    """
    rows = await pool.fetch(sql, limit)
    return [Oportunidad(**dict(r)) for r in rows]
