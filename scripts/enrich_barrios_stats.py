"""
Exporta datos enriquecidos del DB local → public/data/barrios_stats.json

Lee de analytics.barrios_verde, barrios_pois_distancia, barrios_liquidez,
barrios_score_consolidado, barrios_oportunidades para todos los municipios
del Valle de Aburrá (excluyendo Medellín — esos vienen del API en producción).

Uso:
    python scripts/enrich_barrios_stats.py
    python scripts/enrich_barrios_stats.py --include-medellin
"""

import argparse
import json
import os
import sys
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://urbidata:urbidata007@localhost:5433/urbidata",
)

OUTPUT = Path(__file__).parent.parent / "public" / "data" / "barrios_stats.json"

QUERY = """
SELECT
    b.id,
    b.nombre,
    b.municipio,
    lower(replace(b.municipio, ' ', '_')) AS slug_municipio,
    -- mercado
    bm.precio_venta_m2_p50          AS precio_m2,
    bm.precio_arriendo_p50          AS arriendo,
    bm.yield_bruto                  AS yield_anual,
    bm.ratio_precio_arriendo        AS anos_recupero,
    -- listings count proxy
    COALESCE(bm.n_venta,  0)        AS n_venta,
    COALESCE(bm.n_arriendo, 0)      AS n_arriendo,
    -- location centroid
    ST_Y(ST_Centroid(b.geometry))   AS lat,
    ST_X(ST_Centroid(b.geometry))   AS lng,
    -- estrato
    COALESCE(sl.estrato_barrio, 0)  AS estrato,
    -- scores
    sc.score_corto,
    sc.categoria_corto,
    sc.score_mediano,
    sc.categoria_mediano,
    sc.score_largo,
    sc.categoria_largo,
    sc.perfil_recomendado,
    -- verde
    vd.indice_verde_pct,
    vd.categoria_verde,
    vd.score_verde,
    -- pois / conectividad
    poi.dist_metro_km,
    poi.dist_parque_km,
    poi.dist_mall_km,
    poi.n_cafes_500m,
    poi.n_coworking_1km,
    poi.n_gimnasios_1km,
    poi.n_yoga_1km,
    poi.indice_nomada,
    -- liquidez
    lq.liquidez_score               AS score_salud,
    lq.categoria_liquidez           AS categoria_salud,
    lq.tiempo_estimado_venta,
    -- oportunidad
    op.oportunidad_detectada,
    op.tipo_oportunidad,
    op.descripcion_oportunidad,
    -- seguridad
    sg.score_seguridad_residente    AS score_seguridad,
    sg.categoria_seguridad,
    sg.nota_seguridad,
    -- remates
    0::int                          AS n_remates_municipio,
    NULL::float                     AS remates_por_100_listings
FROM raw.barrios b
LEFT JOIN analytics.barrios_mercado           bm  ON b.id = bm.barrio_id
LEFT JOIN analytics.barrios_score_consolidado sc  ON b.id = sc.barrio_id
LEFT JOIN analytics.barrios_verde             vd  ON b.id = vd.barrio_id
LEFT JOIN analytics.barrios_pois_distancia    poi ON b.id = poi.barrio_id
LEFT JOIN analytics.barrios_liquidez          lq  ON b.id = lq.barrio_id
LEFT JOIN analytics.barrios_oportunidades     op  ON b.id = op.barrio_id
LEFT JOIN analytics.score_largo_plazo         sl  ON b.id = sl.barrio_id
LEFT JOIN analytics.barrios_seguridad         sg  ON b.id = sg.barrio_id
WHERE {municipio_filter}
ORDER BY b.municipio, b.nombre
"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--include-medellin",
        action="store_true",
        help="Include Medellín barrios (normally served by API)",
    )
    args = parser.parse_args()

    mun_filter = "1=1" if args.include_medellin else "upper(b.municipio) != 'MEDELLIN'"

    print(f"Conectando a {DB_URL[:40]}...")
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    sql = QUERY.format(municipio_filter=mun_filter)
    cur.execute(sql)
    rows = cur.fetchall()
    conn.close()

    print(f"Barrios obtenidos: {len(rows)}")

    # municipio counts
    counts: dict[str, int] = {}
    for r in rows:
        counts[r["municipio"]] = counts.get(r["municipio"], 0) + 1
    for m, c in sorted(counts.items()):
        print(f"  {m}: {c}")

    BOOL_FIELDS = {"oportunidad_detectada"}
    INT_FIELDS = {"id", "n_venta", "n_arriendo", "estrato", "score_corto", "score_mediano",
                  "score_largo", "score_verde", "n_cafes_500m", "n_coworking_1km",
                  "n_gimnasios_1km", "n_yoga_1km", "score_salud", "n_remates_municipio",
                  "score_seguridad"}

    result = []
    for r in rows:
        entry = {}
        for k, v in r.items():
            if v is None:
                entry[k] = None
            elif k in BOOL_FIELDS:
                entry[k] = bool(v)
            elif k in INT_FIELDS:
                entry[k] = int(v)
            elif hasattr(v, "__float__"):
                entry[k] = float(v)
            else:
                entry[k] = v
        result.append(entry)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"\nEscrito: {OUTPUT}  ({OUTPUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
