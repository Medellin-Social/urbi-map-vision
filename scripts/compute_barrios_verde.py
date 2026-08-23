"""
Compute analytics.barrios_verde from raw.pois (tipo='parque') + raw.barrios geometry.

Methodology:
  - n_parques:                COUNT of parque POIs whose centroid is within barrio polygon
  - area_barrio_m2:           ST_Area(geometry::geography)
  - area_parques_estimada_m2: n_parques * 5000 m² (fixed estimate per park)
  - indice_verde_pct:         area_parques / area_barrio * 100

Categories:
  >= 20% → MUY VERDE  (score 15)
  >= 10% → VERDE      (score 10)
  >=  5% → MODERADO   (score 6)
   < 5%  → POCO VERDE (score 2)

Source data: OSM parks via raw.pois (populated by scripts/load_pois_overpass.py)

Run:
  python scripts/compute_barrios_verde.py
  python scripts/compute_barrios_verde.py --dry-run
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://social:urbidata007@localhost:5433/social",
)

AREA_POR_PARQUE_M2 = 5_000

_SQL = """
SELECT
    b.id                                        AS barrio_id,
    b.nombre                                    AS nombre_barrio,
    b.municipio,
    COUNT(p.id)::bigint                         AS n_parques,
    ST_Area(b.geometry::geography)::numeric     AS area_barrio_m2
FROM raw.barrios b
LEFT JOIN raw.pois p
    ON p.tipo = 'parque'
   AND ST_Within(p.geometry, b.geometry)
GROUP BY b.id, b.nombre, b.municipio
"""

_UPSERT = """
INSERT INTO analytics.barrios_verde
    (barrio_id, nombre_barrio, municipio,
     n_parques, area_barrio_m2, area_parques_estimada_m2,
     indice_verde_pct, categoria_verde, score_verde, calculado_en)
VALUES
    (%(barrio_id)s, %(nombre_barrio)s, %(municipio)s,
     %(n_parques)s, %(area_barrio_m2)s, %(area_parques_estimada_m2)s,
     %(indice_verde_pct)s, %(categoria_verde)s, %(score_verde)s, NOW())
ON CONFLICT (barrio_id) DO UPDATE SET
    nombre_barrio            = EXCLUDED.nombre_barrio,
    n_parques                = EXCLUDED.n_parques,
    area_barrio_m2           = EXCLUDED.area_barrio_m2,
    area_parques_estimada_m2 = EXCLUDED.area_parques_estimada_m2,
    indice_verde_pct         = EXCLUDED.indice_verde_pct,
    categoria_verde          = EXCLUDED.categoria_verde,
    score_verde              = EXCLUDED.score_verde,
    calculado_en             = NOW()
"""

_ADD_PK = """
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'barrios_verde_barrio_id_pkey'
          AND conrelid = 'analytics.barrios_verde'::regclass
    ) THEN
        ALTER TABLE analytics.barrios_verde ADD PRIMARY KEY (barrio_id);
    END IF;
EXCEPTION WHEN others THEN NULL;
END $$;
"""


def classify(pct: float) -> tuple[str, int]:
    if pct >= 20:
        return "MUY VERDE", 15
    if pct >= 10:
        return "VERDE", 10
    if pct >= 5:
        return "MODERADO", 6
    return "POCO VERDE", 2


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute(_SQL)
    rows = cur.fetchall()
    print(f"Barrios found: {len(rows)}")

    records = []
    for row in rows:
        area = float(row["area_barrio_m2"]) if row["area_barrio_m2"] else 0
        n = int(row["n_parques"])
        area_parques = n * AREA_POR_PARQUE_M2
        pct = round(area_parques / area * 100, 2) if area > 0 else 0.0
        categoria, score = classify(pct)
        records.append({
            "barrio_id": row["barrio_id"],
            "nombre_barrio": row["nombre_barrio"],
            "municipio": row["municipio"],
            "n_parques": n,
            "area_barrio_m2": round(area, 2),
            "area_parques_estimada_m2": float(area_parques),
            "indice_verde_pct": pct,
            "categoria_verde": categoria,
            "score_verde": score,
        })

    if args.dry_run:
        for r in records:
            if r["n_parques"] > 0:
                print(f"  {r['nombre_barrio']:30s} n={r['n_parques']:3d} pct={r['indice_verde_pct']:5.1f}% → {r['categoria_verde']}")
        print(f"\nDry-run: {len(records)} barrios, {sum(1 for r in records if r['n_parques'] > 0)} con parques")
        conn.close()
        return

    cur.execute(_ADD_PK)
    psycopg2.extras.execute_batch(cur, _UPSERT, records, page_size=200)
    conn.commit()
    conn.close()

    by_cat: dict[str, int] = {}
    for r in records:
        by_cat[r["categoria_verde"]] = by_cat.get(r["categoria_verde"], 0) + 1
    print(f"Upserted {len(records)} barrios")
    for cat, cnt in sorted(by_cat.items(), key=lambda x: -x[1]):
        print(f"  {cat}: {cnt}")


if __name__ == "__main__":
    main()
