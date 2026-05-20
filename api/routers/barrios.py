from __future__ import annotations

import json
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from api.config import USD_TO_COP
from api.db import get_pool
from api.dependencies import get_optional_user

router = APIRouter()

# Explicit whitelist: score_col is interpolated into SQL, so it MUST only
# ever be one of these three known column names. Never accept user input directly.
_PERFIL_SCORE = {
    "airbnb": "score_corto",
    "nomadas": "score_mediano",       # legacy alias — keep for existing sessions
    "mediano_plazo": "score_mediano", # canonical new name
    "largo_plazo": "score_largo",
}


def get_score_col(perfil: Optional[str]) -> str:
    """Return a safe, whitelisted column name for the given perfil.

    Callers must use this instead of interpolating perfil directly — the column
    name goes into raw SQL and the whitelist is the only injection guard.
    """
    return _PERFIL_SCORE.get(perfil or "", "score_corto")


_USD = USD_TO_COP

def _score_to_hex(score: Optional[int], perfil: Optional[str] = None) -> str:
    if score is None or score == 0:
        return "#00d4ff"
    if perfil in ("nomadas", "mediano_plazo"):
        if score >= 55: return "#10b981"
        if score >= 40: return "#2BBAA5"
        if score >= 25: return "#f59e0b"
        return "#ef4444"
    if score >= 70:
        return "#10b981"
    if score >= 50:
        return "#2BBAA5"
    if score >= 30:
        return "#f59e0b"
    return "#ef4444"


# ── Models ────────────────────────────────────────────────────────────────────

class Scores(BaseModel):
    corto: Optional[int] = None
    cat_corto: Optional[str] = None
    mediano: Optional[int] = None
    cat_mediano: Optional[str] = None
    largo: Optional[int] = None
    cat_largo: Optional[str] = None
    perfil_recomendado: Optional[str] = None
    score_activo: Optional[int] = None


class Mercado(BaseModel):
    precio_m2_cop: Optional[int] = None
    precio_m2_usd: Optional[int] = None
    arriendo_p50_cop: Optional[int] = None
    yield_bruto_pct: Optional[float] = None
    anos_recupero: Optional[float] = None
    estado_precio: Optional[str] = None
    pbn_precio_justo: Optional[int] = None
    poi_precio_oferta: Optional[int] = None
    yield_renta_media_pct: Optional[float] = None
    precio_renta_media_p50: Optional[int] = None


class NomadaBreakdown(BaseModel):
    pts_yield: Optional[int] = None       # /25
    pts_nomada: Optional[int] = None      # /30
    pts_pbn: Optional[int] = None         # /18
    pts_seguridad: Optional[int] = None   # /12
    pts_verde: Optional[int] = None       # /10
    pts_equip: Optional[int] = None       # /5


class Airbnb(BaseModel):
    ocupacion_pct: Optional[float] = None
    adr_usd: Optional[float] = None
    adr_cop: Optional[int] = None
    yield_airbnb_pct: Optional[float] = None
    n_listings: Optional[int] = None


class Seguridad(BaseModel):
    score: Optional[int] = None
    categoria: Optional[str] = None
    zona_turistica: Optional[bool] = None
    tendencia: Optional[str] = None
    nota: Optional[str] = None


class Conectividad(BaseModel):
    dist_metro_km: Optional[float] = None
    dist_parque_km: Optional[float] = None
    dist_mall_km: Optional[float] = None
    n_cafes_500m: Optional[int] = None
    n_coworking_1km: Optional[int] = None
    n_gimnasios_1km: Optional[int] = None
    n_yoga_1km: Optional[int] = None
    indice_nomada: Optional[float] = None


class Verde(BaseModel):
    indice_verde_pct: Optional[float] = None
    categoria: Optional[str] = None
    score_verde: Optional[int] = None


class Liquidez(BaseModel):
    score: Optional[int] = None
    categoria: Optional[str] = None
    tiempo_estimado_venta: Optional[str] = None
    nota_metodologia: Optional[str] = None


class Oportunidad(BaseModel):
    detectada: Optional[bool] = None
    tipo: Optional[str] = None
    descripcion: Optional[str] = None


class Valorizacion(BaseModel):
    var_anual_pct: Optional[float] = None
    proyeccion_3anos_pct: Optional[float] = None
    proyeccion_5anos_pct: Optional[float] = None
    tendencia: Optional[str] = None


class BarrioResponse(BaseModel):
    barrio_id: int
    nombre: Optional[str] = None
    comuna: Optional[str] = None
    municipio: Optional[str] = None
    estrato: Optional[int] = None
    geometry: Optional[dict[str, Any]] = None
    color_hex: Optional[str] = None
    excluir_inversion: Optional[bool] = None
    scores: Scores
    mercado: Mercado
    airbnb: Airbnb
    seguridad: Seguridad
    conectividad: Conectividad
    verde: Verde
    liquidez: Liquidez
    oportunidad: Oportunidad
    valorizacion: Valorizacion
    nomada_breakdown: Optional[NomadaBreakdown] = None
    n_remates_municipio: Optional[int] = None


class ListingItem(BaseModel):
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
    fecha_scraping: Optional[str] = None
    buena_oferta: Optional[bool] = None
    pct_bajo_mediana: Optional[float] = None


class ListingsResponse(BaseModel):
    total: int
    listings: list[ListingItem]


# ── SQL ───────────────────────────────────────────────────────────────────────

_BARRIO_MAP_SQL = """
    SELECT
        b.id                                AS barrio_id,
        b.nombre,
        b.comuna,
        b.municipio,
        sl.estrato_barrio                   AS estrato,
        ST_AsGeoJSON(ST_SimplifyPreserveTopology(b.geometry, 0.0003)) AS geometry_raw,
        sc.score_corto,
        sc.categoria_corto                  AS cat_corto,
        sc.score_mediano,
        sc.categoria_mediano                AS cat_mediano,
        sc.score_largo,
        sc.categoria_largo                  AS cat_largo,
        sc.perfil_recomendado,
        bm.precio_venta_m2_p50              AS precio_m2_cop,
        bm.precio_arriendo_p50              AS arriendo_p50_cop,
        bm.yield_bruto                      AS yield_bruto_pct,
        bm.ratio_precio_arriendo            AS anos_recupero,
        bm.estado_precio,
        bm.pbn_precio_justo,
        bm.poi_precio_oferta,
        b.excluir_inversion,
        op.oportunidad_detectada,
        op.tipo_oportunidad,
        op.descripcion_oportunidad,
        lq.liquidez_score,
        lq.categoria_liquidez,
        lq.tiempo_estimado_venta,
        poi.dist_metro_km,
        poi.dist_parque_km,
        poi.dist_mall_km,
        poi.n_cafes_500m,
        poi.n_coworking_1km,
        poi.n_gimnasios_1km,
        poi.n_yoga_1km,
        poi.indice_nomada
    FROM raw.barrios b
    LEFT JOIN analytics.barrios_score_consolidado sc  ON b.id = sc.barrio_id
    LEFT JOIN analytics.barrios_mercado           bm  ON b.id = bm.barrio_id
    LEFT JOIN analytics.barrios_pois_distancia    poi ON b.id = poi.barrio_id
    LEFT JOIN analytics.barrios_liquidez          lq  ON b.id = lq.barrio_id
    LEFT JOIN analytics.barrios_oportunidades     op  ON b.id = op.barrio_id
    LEFT JOIN analytics.score_largo_plazo         sl  ON b.id = sl.barrio_id
"""

_BARRIO_SQL = """
    SELECT
        b.id                                AS barrio_id,
        b.nombre,
        b.comuna,
        b.municipio,
        sl.estrato_barrio                   AS estrato,
        ST_AsGeoJSON(b.geometry)            AS geometry_raw,
        -- scores
        sc.score_corto,
        sc.categoria_corto                  AS cat_corto,
        sc.score_mediano,
        sc.categoria_mediano                AS cat_mediano,
        sc.score_largo,
        sc.categoria_largo                  AS cat_largo,
        sc.perfil_recomendado,
        -- mercado
        bm.precio_venta_m2_p50              AS precio_m2_cop,
        bm.precio_arriendo_p50              AS arriendo_p50_cop,
        bm.yield_bruto                      AS yield_bruto_pct,
        bm.ratio_precio_arriendo            AS anos_recupero,
        bm.estado_precio,
        bm.pbn_precio_justo,
        bm.poi_precio_oferta,
        -- airbnb
        bm.ocupacion_airbnb_pct,
        bm.adr_noche_cop,
        bm.airbnb_n_listings                AS n_listings_airbnb,
        -- seguridad
        seg.score_seguridad_residente       AS score_seguridad,
        seg.categoria_seguridad,
        bm.zona_turistica,
        seg.tendencia                       AS tendencia_seguridad,
        seg.nota_seguridad,
        -- conectividad / pois
        poi.dist_metro_km,
        poi.dist_parque_km,
        poi.dist_mall_km,
        poi.n_cafes_500m,
        poi.n_coworking_1km,
        poi.n_gimnasios_1km,
        poi.n_yoga_1km,
        poi.indice_nomada,
        -- verde
        vd.indice_verde_pct,
        vd.categoria_verde,
        vd.score_verde,
        -- liquidez
        lq.liquidez_score,
        lq.categoria_liquidez,
        lq.tiempo_estimado_venta,
        lq.nota_metodologia,
        -- zona
        b.excluir_inversion,
        -- oportunidad
        op.oportunidad_detectada,
        op.tipo_oportunidad,
        op.descripcion_oportunidad,
        -- valorizacion
        sl.var_anual_5anos_pct              AS var_anual_pct,
        pv.proyeccion_3anos_pct,
        pv.proyeccion_5anos_pct,
        sl.tendencia_valorizacion,
        -- renta media (nómadas)
        bm.yield_renta_media_pct,
        bm.precio_renta_media_p50,
        -- nomada score breakdown
        sm.yield_medio_score                AS pts_yield_nomada,
        sm.nomada_score                     AS pts_nomada,
        sm.pbn_score                        AS pts_pbn_nomada,
        sm.seg_medio_score                  AS pts_seg_nomada,
        sm.pts_verde                        AS pts_verde_nomada,
        sm.pts_equip                        AS pts_equip_nomada
    FROM raw.barrios b
    LEFT JOIN analytics.barrios_score_consolidado sc  ON b.id = sc.barrio_id
    LEFT JOIN analytics.barrios_mercado           bm  ON b.id = bm.barrio_id
    LEFT JOIN analytics.barrios_seguridad         seg ON b.id = seg.barrio_id
    LEFT JOIN analytics.barrios_pois_distancia    poi ON b.id = poi.barrio_id
    LEFT JOIN analytics.barrios_verde             vd  ON b.id = vd.barrio_id
    LEFT JOIN analytics.barrios_liquidez          lq  ON b.id = lq.barrio_id
    LEFT JOIN analytics.barrios_oportunidades     op  ON b.id = op.barrio_id
    LEFT JOIN analytics.score_largo_plazo         sl  ON b.id = sl.barrio_id
    LEFT JOIN analytics.proyecciones_valorizacion pv  ON sl.estrato_barrio = pv.estrato_sistema
    LEFT JOIN analytics.score_mediano_plazo       sm  ON b.id = sm.barrio_id
"""


def _f(row: dict, key: str) -> Optional[float]:
    v = row.get(key)
    return float(v) if v is not None else None


def _i(row: dict, key: str) -> Optional[int]:
    v = row.get(key)
    return int(v) if v is not None else None


def _build_response(row: dict, score_col: str = "score_corto", perfil: Optional[str] = None) -> BarrioResponse:
    raw_geo = row.get("geometry_raw")
    geometry = json.loads(raw_geo) if raw_geo else None

    precio_m2_cop = _f(row, "precio_m2_cop")
    adr_cop = _f(row, "adr_noche_cop")

    score_map = {
        "score_corto": _i(row, "score_corto"),
        "score_mediano": _i(row, "score_mediano"),
        "score_largo": _i(row, "score_largo"),
    }
    score_activo = score_map.get(score_col)
    excluir = bool(row.get("excluir_inversion"))
    color_hex = "#6b7280" if excluir else _score_to_hex(score_activo, perfil)

    return BarrioResponse(
        barrio_id=row["barrio_id"],
        nombre=row.get("nombre"),
        comuna=row.get("comuna"),
        municipio=row.get("municipio"),
        estrato=row.get("estrato"),
        geometry=geometry,
        color_hex=color_hex,
        excluir_inversion=excluir,
        scores=Scores(
            corto=_i(row, "score_corto"),
            cat_corto=row.get("cat_corto"),
            mediano=_i(row, "score_mediano"),
            cat_mediano=row.get("cat_mediano"),
            largo=_i(row, "score_largo"),
            cat_largo=row.get("cat_largo"),
            perfil_recomendado=row.get("perfil_recomendado"),
            score_activo=score_activo,
        ),
        mercado=Mercado(
            precio_m2_cop=int(precio_m2_cop) if precio_m2_cop else None,
            precio_m2_usd=int(precio_m2_cop / _USD) if precio_m2_cop else None,
            arriendo_p50_cop=_i(row, "arriendo_p50_cop"),
            yield_bruto_pct=_f(row, "yield_bruto_pct"),
            anos_recupero=_f(row, "anos_recupero"),
            estado_precio=row.get("estado_precio"),
            pbn_precio_justo=_i(row, "pbn_precio_justo"),
            poi_precio_oferta=_i(row, "poi_precio_oferta"),
            yield_renta_media_pct=_f(row, "yield_renta_media_pct"),
            precio_renta_media_p50=_i(row, "precio_renta_media_p50"),
        ),
        airbnb=Airbnb(
            ocupacion_pct=_f(row, "ocupacion_airbnb_pct"),
            adr_usd=round(adr_cop / _USD, 2) if adr_cop else None,
            adr_cop=int(adr_cop) if adr_cop else None,
            yield_airbnb_pct=None,
            n_listings=_i(row, "n_listings_airbnb"),
        ),
        seguridad=Seguridad(
            score=_i(row, "score_seguridad"),
            categoria=row.get("categoria_seguridad"),
            zona_turistica=row.get("zona_turistica"),
            tendencia=row.get("tendencia_seguridad"),
            nota=row.get("nota_seguridad"),
        ),
        conectividad=Conectividad(
            dist_metro_km=_f(row, "dist_metro_km"),
            dist_parque_km=_f(row, "dist_parque_km"),
            dist_mall_km=_f(row, "dist_mall_km"),
            n_cafes_500m=_i(row, "n_cafes_500m"),
            n_coworking_1km=_i(row, "n_coworking_1km"),
            n_gimnasios_1km=_i(row, "n_gimnasios_1km"),
            n_yoga_1km=_i(row, "n_yoga_1km"),
            indice_nomada=_f(row, "indice_nomada"),
        ),
        verde=Verde(
            indice_verde_pct=_f(row, "indice_verde_pct"),
            categoria=row.get("categoria_verde"),
            score_verde=_i(row, "score_verde"),
        ),
        liquidez=Liquidez(
            score=_i(row, "liquidez_score"),
            categoria=row.get("categoria_liquidez"),
            tiempo_estimado_venta=row.get("tiempo_estimado_venta"),
            nota_metodologia=row.get("nota_metodologia"),
        ),
        oportunidad=Oportunidad(
            detectada=row.get("oportunidad_detectada"),
            tipo=row.get("tipo_oportunidad"),
            descripcion=row.get("descripcion_oportunidad"),
        ),
        valorizacion=Valorizacion(
            var_anual_pct=_f(row, "var_anual_pct"),
            proyeccion_3anos_pct=_f(row, "proyeccion_3anos_pct"),
            proyeccion_5anos_pct=_f(row, "proyeccion_5anos_pct"),
            tendencia=row.get("tendencia_valorizacion"),
        ),
        nomada_breakdown=NomadaBreakdown(
            pts_yield=_i(row, "pts_yield_nomada"),
            pts_nomada=_i(row, "pts_nomada"),
            pts_pbn=_i(row, "pts_pbn_nomada"),
            pts_seguridad=_i(row, "pts_seg_nomada"),
            pts_verde=_i(row, "pts_verde_nomada"),
            pts_equip=_i(row, "pts_equip_nomada"),
        ) if row.get("pts_yield_nomada") is not None else None,
        n_remates_municipio=_i(row, "n_remates_municipio"),
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=list[BarrioResponse])
async def list_barrios(
    perfil: Optional[str] = Query(default=None, description="airbnb | mediano_plazo | largo_plazo"),
    score_min: int = Query(default=0, ge=0, le=100),
    municipio: Optional[str] = Query(default=None),
    estrato: Optional[int] = Query(default=None),
    fields: str = Query(default="full", description="map | full"),
    current_user: Optional[dict] = Depends(get_optional_user),
):
    pool = get_pool()

    effective_perfil = perfil
    if not effective_perfil and current_user:
        prow = await pool.fetchrow(
            "SELECT objetivo FROM perfil_inversor WHERE usuario_id = $1 ORDER BY id DESC LIMIT 1",
            current_user["id"],
        )
        if prow and prow["objetivo"]:
            effective_perfil = prow["objetivo"]

    score_col = get_score_col(effective_perfil)
    base_sql = _BARRIO_MAP_SQL if fields == "map" else _BARRIO_SQL

    sql = base_sql + f"""
        WHERE ($1::text IS NULL OR upper(b.municipio) = upper($1))
          AND ($2::int  IS NULL OR sl.estrato_barrio = $2)
          AND (sc.{score_col} IS NULL OR sc.{score_col} >= $3)
        ORDER BY sc.{score_col} DESC NULLS LAST
    """
    rows = await pool.fetch(sql, municipio, estrato, score_min)
    return [_build_response(dict(r), score_col, effective_perfil) for r in rows]


@router.get("/comparar", response_model=list[BarrioResponse])
async def comparar_barrios(
    ids: str = Query(description="IDs separados por coma: 1,2,3 (máx 3)"),
    perfil: Optional[str] = Query(default=None, description="airbnb | mediano_plazo | largo_plazo"),
):
    id_list = [int(x.strip()) for x in ids.split(",") if x.strip().isdigit()][:3]
    if not id_list:
        raise HTTPException(status_code=400, detail="Parámetro ids inválido")

    score_col = get_score_col(perfil)
    pool = get_pool()
    sql = _BARRIO_SQL + " WHERE b.id = ANY($1::int[])"
    rows = await pool.fetch(sql, id_list)
    return [_build_response(dict(r), score_col, perfil) for r in rows]


@router.get("/{barrio_id}", response_model=BarrioResponse)
async def get_barrio(
    barrio_id: int,
    perfil: Optional[str] = Query(default=None, description="airbnb | mediano_plazo | largo_plazo"),
):
    score_col = get_score_col(perfil)
    pool = get_pool()
    sql = _BARRIO_SQL + " WHERE b.id = $1"
    row = await pool.fetchrow(sql, barrio_id)
    if row is None:
        raise HTTPException(status_code=404, detail=f"Barrio {barrio_id} no encontrado")
    return _build_response(dict(row), score_col, perfil)


@router.get("/{barrio_id}/listings", response_model=ListingsResponse)
async def get_barrio_listings(
    barrio_id: int,
    tipo_operacion: Optional[str] = Query(default=None),
    precio_min: Optional[int] = Query(default=None),
    precio_max: Optional[int] = Query(default=None),
    area_min: Optional[float] = Query(default=None),
    habitaciones: Optional[int] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    pool = get_pool()
    args = (barrio_id, tipo_operacion, precio_min, precio_max, area_min, habitaciones)

    total = await pool.fetchval(
        """
        SELECT COUNT(*) FROM staging.stg_listings
        WHERE barrio_id = $1
          AND ($2::text   IS NULL OR tipo_operacion = $2)
          AND ($3::bigint IS NULL OR precio >= $3)
          AND ($4::bigint IS NULL OR precio <= $4)
          AND ($5::float8 IS NULL OR area_m2 >= $5)
          AND ($6::int    IS NULL OR habitaciones = $6)
        """,
        *args,
    )

    rows = await pool.fetch(
        """
        WITH med AS (
            SELECT precio_venta_m2_p50 AS m2_mediana,
                   precio_arriendo_p50 AS arr_mediana
            FROM analytics.barrios_mercado
            WHERE barrio_id = $1
        )
        SELECT
            l.id,
            l.fuente,
            l.tipo_operacion,
            l.tipo_inmueble,
            l.precio::bigint          AS precio_cop,
            (l.precio / 4100)::bigint AS precio_usd,
            l.area_m2::float8,
            CASE WHEN l.precio_m2 > 0 AND l.precio_m2 < 2147483647
                 THEN l.precio_m2::int END AS precio_m2,
            l.habitaciones,
            l.banos::float8,
            l.direccion_raw,
            l.url,
            l.fecha_scraping::text,
            CASE
                WHEN l.tipo_operacion = 'venta'
                     AND l.precio_m2 > 0 AND l.precio_m2 < 2147483647
                     AND med.m2_mediana > 0
                     AND (med.m2_mediana - l.precio_m2)::float8 / med.m2_mediana > 0.10
                THEN TRUE
                WHEN l.tipo_operacion = 'arriendo'
                     AND l.precio > 0
                     AND med.arr_mediana > 0
                     AND (med.arr_mediana - l.precio)::float8 / med.arr_mediana > 0.10
                THEN TRUE
                ELSE FALSE
            END AS buena_oferta,
            CASE
                WHEN l.tipo_operacion = 'venta'
                     AND l.precio_m2 > 0 AND l.precio_m2 < 2147483647
                     AND med.m2_mediana > 0
                THEN round(((med.m2_mediana - l.precio_m2)::float8 / med.m2_mediana * 100)::numeric, 1)::float8
                WHEN l.tipo_operacion = 'arriendo'
                     AND l.precio > 0 AND med.arr_mediana > 0
                THEN round(((med.arr_mediana - l.precio)::float8 / med.arr_mediana * 100)::numeric, 1)::float8
                ELSE NULL
            END AS pct_bajo_mediana
        FROM staging.stg_listings l
        CROSS JOIN med
        WHERE l.barrio_id = $1
          AND ($2::text   IS NULL OR l.tipo_operacion = $2)
          AND ($3::bigint IS NULL OR l.precio >= $3)
          AND ($4::bigint IS NULL OR l.precio <= $4)
          AND ($5::float8 IS NULL OR l.area_m2 >= $5)
          AND ($6::int    IS NULL OR l.habitaciones = $6)
        ORDER BY l.precio_m2 ASC NULLS LAST
        LIMIT $7 OFFSET $8
        """,
        *args, limit, offset,
    )

    return ListingsResponse(
        total=total or 0,
        listings=[ListingItem(**dict(r)) for r in rows],
    )
