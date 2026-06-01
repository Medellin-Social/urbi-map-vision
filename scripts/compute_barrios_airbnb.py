"""
Agrega raw.airbnb_listings_portal → analytics.barrios_airbnb_real

Por barrio (barrio_id) con ≥ MIN_LISTINGS listings:
  - Percentiles p25/p50/p75 de ocupación TTM
  - ADR p50 (USD y COP)
  - Ingresos anuales p50 (USD y COP)
  - Counts: total, entire_home, private_room, superhosts
  - Promedios: rating_overall, num_reviews
  - Yield = ingresos_p50_usd / precio_venta_m2_p50 (de analytics.barrios_mercado)
  - Comparación con datos mock de raw.airbnb_barrios

Solo listings con ttm_occupancy IS NOT NULL y ttm_avg_rate_native > 0.

Uso:
  python scripts/compute_barrios_airbnb.py
  python scripts/compute_barrios_airbnb.py --dry-run  # imprime sin escribir
  python scripts/compute_barrios_airbnb.py --min-listings 1
"""

import argparse
import os
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

DB_URL     = os.getenv("DATABASE_URL", "postgresql://urbidata:urbidata007@localhost:5433/urbidata")
USD_TO_COP = float(os.getenv("USD_TO_COP", "4163"))
MIN_LISTINGS = 1


AGGREGATE_SQL = """
WITH listings AS (
    SELECT
        lp.barrio_id,
        lp.room_type,
        lp.superhost,
        lp.ttm_occupancy,
        lp.ttm_avg_rate      AS adr_usd,
        lp.ttm_avg_rate_native AS adr_cop_native,
        lp.ttm_revenue       AS rev_usd,
        lp.ttm_revenue_native AS rev_cop_native,
        lp.rating_overall,
        lp.num_reviews
    FROM raw.airbnb_listings_portal lp
    WHERE lp.barrio_id IS NOT NULL
      AND lp.ttm_occupancy IS NOT NULL
),
barrio_agg AS (
    SELECT
        barrio_id,
        COUNT(*)                                          AS n_listings,
        COUNT(*) FILTER (WHERE room_type = 'entire_home') AS n_entire_home,
        COUNT(*) FILTER (WHERE room_type = 'private_room') AS n_private_room,
        COUNT(*) FILTER (WHERE superhost = true)          AS n_superhosts,

        -- ocupacion percentiles
        ROUND(CAST(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY ttm_occupancy) * 100 AS numeric), 1)
                                                          AS ocupacion_p25_pct,
        ROUND(CAST(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY ttm_occupancy) * 100 AS numeric), 1)
                                                          AS ocupacion_p50_pct,
        ROUND(CAST(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY ttm_occupancy) * 100 AS numeric), 1)
                                                          AS ocupacion_p75_pct,

        -- ADR p50
        ROUND(CAST(PERCENTILE_CONT(0.50) WITHIN GROUP (
            ORDER BY adr_usd) FILTER (WHERE adr_usd > 0) AS numeric), 2)
                                                          AS adr_p50_usd,
        ROUND(CAST(PERCENTILE_CONT(0.50) WITHIN GROUP (
            ORDER BY adr_cop_native) FILTER (WHERE adr_cop_native > 0) AS numeric), 0)
                                                          AS adr_p50_cop,

        -- ingresos anuales p50 (TTM revenue)
        ROUND(CAST(PERCENTILE_CONT(0.50) WITHIN GROUP (
            ORDER BY rev_usd) FILTER (WHERE rev_usd > 0) AS numeric), 0)
                                                          AS ingresos_p50_usd,
        ROUND(CAST(PERCENTILE_CONT(0.50) WITHIN GROUP (
            ORDER BY rev_cop_native) FILTER (WHERE rev_cop_native > 0) AS numeric), 0)
                                                          AS ingresos_p50_cop,

        -- ratings
        ROUND(AVG(rating_overall)  FILTER (WHERE rating_overall > 0), 2)
                                                          AS rating_promedio,
        ROUND(AVG(num_reviews)     FILTER (WHERE num_reviews > 0), 0)
                                                          AS reviews_promedio
    FROM listings
    GROUP BY barrio_id
    HAVING COUNT(*) >= %(min_listings)s
),
barrio_meta AS (
    SELECT b.id AS barrio_id, b.nombre, b.municipio, b.comuna
    FROM raw.barrios b
),
barrio_precio AS (
    SELECT barrio_id,
           precio_venta_m2_p50    AS precio_venta_m2_p50_cop,
           area_promedio_m2
    FROM analytics.barrios_mercado
    WHERE precio_venta_m2_p50 IS NOT NULL
),
barrio_mock AS (
    SELECT DISTINCT ON (barrio_id)
           barrio_id,
           n_listings             AS mock_n_listings,
           ocupacion_pct          AS mock_ocupacion_pct,
           adr_cop                AS mock_adr_cop,
           ingresos_anuales_estimados AS mock_ingresos_anuales_cop
    FROM raw.airbnb_barrios
    ORDER BY barrio_id, fecha_consulta DESC
)
SELECT
    ba.barrio_id,
    bm.nombre                                             AS barrio_nombre,
    bm.comuna,
    bm.municipio,
    ba.n_listings                                         AS n_listings_airbnb,
    ba.n_entire_home,
    ba.n_private_home,
    ba.n_superhosts,
    ba.ocupacion_p25_pct,
    ba.ocupacion_p50_pct,
    ba.ocupacion_p75_pct,
    ba.adr_p50_usd,
    ba.adr_p50_cop,
    ba.ingresos_p50_usd                                   AS ingresos_anuales_p50_usd,
    ba.ingresos_p50_cop                                   AS ingresos_anuales_p50_cop,
    -- yield = ingresos_anuales_usd / precio_venta_m2_cop * 100
    CASE
        WHEN bp.precio_venta_m2_p50_cop > 0 AND ba.ingresos_p50_usd IS NOT NULL
             AND bp.area_promedio_m2 > 0
        THEN ROUND(
            ba.ingresos_p50_usd * %(usd_to_cop)s
            / (bp.precio_venta_m2_p50_cop * bp.area_promedio_m2) * 100, 2)
        ELSE NULL
    END                                                   AS yield_airbnb_real_pct,
    ba.rating_promedio,
    ba.reviews_promedio,
    bp.precio_venta_m2_p50_cop,
    bp.area_promedio_m2,
    bk.mock_n_listings,
    bk.mock_ocupacion_pct,
    bk.mock_adr_cop,
    bk.mock_ingresos_anuales_cop,
    -- diffs
    CASE WHEN bk.mock_ocupacion_pct IS NOT NULL
         THEN ROUND(ba.ocupacion_p50_pct - bk.mock_ocupacion_pct, 2) END AS diff_ocupacion_pct,
    CASE WHEN bk.mock_adr_cop IS NOT NULL AND ba.adr_p50_cop IS NOT NULL
         THEN ROUND(ba.adr_p50_cop - bk.mock_adr_cop, 0) END AS diff_adr_cop,
    NOW()                                                 AS calculado_en
FROM barrio_agg ba
JOIN barrio_meta bm ON bm.barrio_id = ba.barrio_id
LEFT JOIN barrio_precio bp ON bp.barrio_id = ba.barrio_id
LEFT JOIN barrio_mock  bk ON bk.barrio_id = ba.barrio_id
"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run",      action="store_true")
    parser.add_argument("--min-listings", type=int, default=MIN_LISTINGS)
    args = parser.parse_args()

    conn = psycopg2.connect(DB_URL)
    cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Fix SQL: n_private_home → n_private_room
    sql = AGGREGATE_SQL.replace("ba.n_private_home", "ba.n_private_room")

    cur.execute(sql, {"min_listings": args.min_listings, "usd_to_cop": USD_TO_COP})
    rows = cur.fetchall()
    print(f"Barrios con datos reales: {len(rows)}")

    by_mun = {}
    for r in rows:
        mun = r["municipio"]
        by_mun.setdefault(mun, 0)
        by_mun[mun] += 1

    print("\nCobertura por municipio:")
    for mun, n in sorted(by_mun.items(), key=lambda x: -x[1]):
        print(f"  {mun:15} {n:4} barrios")

    if args.dry_run:
        print("\n[dry-run] Sin escribir.")
        conn.close()
        return

    # Rebuild table
    cur.execute("TRUNCATE analytics.barrios_airbnb_real")

    cols = [
        "barrio_id", "barrio_nombre", "comuna", "municipio",
        "n_listings_airbnb", "n_entire_home", "n_private_room", "n_superhosts",
        "ocupacion_p25_pct", "ocupacion_p50_pct", "ocupacion_p75_pct",
        "adr_p50_usd", "adr_p50_cop",
        "ingresos_anuales_p50_usd", "ingresos_anuales_p50_cop",
        "yield_airbnb_real_pct",
        "rating_promedio", "reviews_promedio",
        "precio_venta_m2_p50_cop", "area_promedio_m2",
        "mock_n_listings", "mock_ocupacion_pct", "mock_adr_cop", "mock_ingresos_anuales_cop",
        "diff_ocupacion_pct", "diff_adr_cop", "calculado_en",
    ]

    for row in rows:
        vals = [row.get(c) for c in cols]
        ph   = ", ".join(["%s"] * len(cols))
        cur.execute(
            f"INSERT INTO analytics.barrios_airbnb_real ({', '.join(cols)}) VALUES ({ph})",
            vals,
        )

    conn.commit()
    conn.close()
    print(f"\n✓ analytics.barrios_airbnb_real actualizada: {len(rows)} barrios.")
    print("  Cobertura Airbnb ahora incluye todos los municipios con listings.")


if __name__ == "__main__":
    main()
