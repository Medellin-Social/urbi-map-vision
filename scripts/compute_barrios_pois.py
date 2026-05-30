"""
Recalcula analytics.barrios_pois_distancia para todos los barrios del Valle
de Aburrá usando PostGIS + raw.pois.

Métricas calculadas:
  dist_metro_km       distancia al metro/tren más cercano
  dist_parque_km      distancia al parque más cercano
  dist_mall_km        distancia al centro comercial más cercano
  dist_yoga_km        distancia al yoga studio más cercano
  n_cafes_500m        cafés en 500 m
  n_coworking_1km     coworkings en 1 km
  n_gimnasios_1km     gimnasios en 1 km  (excluye yoga_studio)
  n_restaurantes_500m restaurantes en 500 m
  n_bares_500m        bares en 500 m
  n_yoga_1km          yoga studios en 1 km
  n_universidades_2km universidades en 2 km
  n_hospitales_3km    hospitales/clínicas en 3 km
  indice_nomada       score compuesto ponderado

Uso:
  python scripts/compute_barrios_pois.py
  python scripts/compute_barrios_pois.py --municipio BELLO    # solo uno
  python scripts/compute_barrios_pois.py --dry-run            # imprime sin escribir
"""

import argparse
import os
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://urbidata:urbidata007@localhost:5433/urbidata",
)

# Pesos del índice nómada (reverse-engineered del dataset existente de Medellín)
# indice = cafes*2 + gym*1.5 + yoga*4 + rest*1 + bar*0.5 + cowork*5
COMPUTE_SQL = """
WITH centroids AS (
    SELECT
        b.id          AS barrio_id,
        b.nombre      AS nombre_barrio,
        b.municipio,
        ST_Centroid(b.geometry)::geography AS centro
    FROM raw.barrios b
    {where}
),
dist_metro AS (
    SELECT c.barrio_id,
        ROUND((MIN(ST_Distance(c.centro, p.geometry::geography)) / 1000)::numeric, 3) AS dist_km
    FROM centroids c
    CROSS JOIN LATERAL (
        SELECT geometry FROM raw.pois WHERE tipo = 'metro'
        ORDER BY geometry <-> c.centro::geometry LIMIT 1
    ) p
    GROUP BY c.barrio_id
),
dist_parque AS (
    SELECT c.barrio_id,
        ROUND((MIN(ST_Distance(c.centro, p.geometry::geography)) / 1000)::numeric, 3) AS dist_km
    FROM centroids c
    CROSS JOIN LATERAL (
        SELECT geometry FROM raw.pois WHERE tipo = 'parque'
        ORDER BY geometry <-> c.centro::geometry LIMIT 1
    ) p
    GROUP BY c.barrio_id
),
dist_mall AS (
    SELECT c.barrio_id,
        ROUND((MIN(ST_Distance(c.centro, p.geometry::geography)) / 1000)::numeric, 3) AS dist_km
    FROM centroids c
    CROSS JOIN LATERAL (
        SELECT geometry FROM raw.pois WHERE tipo = 'mall'
        ORDER BY geometry <-> c.centro::geometry LIMIT 1
    ) p
    GROUP BY c.barrio_id
),
dist_yoga AS (
    SELECT c.barrio_id,
        ROUND((MIN(ST_Distance(c.centro, p.geometry::geography)) / 1000)::numeric, 3) AS dist_km
    FROM centroids c
    LEFT JOIN LATERAL (
        SELECT geometry FROM raw.pois WHERE tipo = 'yoga_studio'
        ORDER BY geometry <-> c.centro::geometry LIMIT 1
    ) p ON true
    GROUP BY c.barrio_id
),
cnt_cafe AS (
    SELECT c.barrio_id,
        COUNT(p.id)::int AS cnt
    FROM centroids c
    LEFT JOIN raw.pois p
        ON p.tipo = 'cafe'
        AND ST_DWithin(c.centro, p.geometry::geography, 500)
    GROUP BY c.barrio_id
),
cnt_cowork AS (
    SELECT c.barrio_id,
        COUNT(p.id)::int AS cnt
    FROM centroids c
    LEFT JOIN raw.pois p
        ON p.tipo = 'coworking'
        AND ST_DWithin(c.centro, p.geometry::geography, 1000)
    GROUP BY c.barrio_id
),
cnt_gym AS (
    SELECT c.barrio_id,
        COUNT(p.id)::int AS cnt
    FROM centroids c
    LEFT JOIN raw.pois p
        ON p.tipo = 'gimnasio'
        AND ST_DWithin(c.centro, p.geometry::geography, 1000)
    GROUP BY c.barrio_id
),
cnt_rest AS (
    SELECT c.barrio_id,
        COUNT(p.id)::int AS cnt
    FROM centroids c
    LEFT JOIN raw.pois p
        ON p.tipo = 'restaurante'
        AND ST_DWithin(c.centro, p.geometry::geography, 500)
    GROUP BY c.barrio_id
),
cnt_bar AS (
    SELECT c.barrio_id,
        COUNT(p.id)::int AS cnt
    FROM centroids c
    LEFT JOIN raw.pois p
        ON p.tipo = 'bar'
        AND ST_DWithin(c.centro, p.geometry::geography, 500)
    GROUP BY c.barrio_id
),
cnt_yoga AS (
    SELECT c.barrio_id,
        COUNT(p.id)::int AS cnt
    FROM centroids c
    LEFT JOIN raw.pois p
        ON p.tipo = 'yoga_studio'
        AND ST_DWithin(c.centro, p.geometry::geography, 1000)
    GROUP BY c.barrio_id
),
cnt_univ AS (
    SELECT c.barrio_id,
        COUNT(p.id)::int AS cnt
    FROM centroids c
    LEFT JOIN raw.pois p
        ON p.tipo = 'universidad'
        AND ST_DWithin(c.centro, p.geometry::geography, 2000)
    GROUP BY c.barrio_id
),
cnt_hosp AS (
    SELECT c.barrio_id,
        COUNT(p.id)::int AS cnt
    FROM centroids c
    LEFT JOIN raw.pois p
        ON p.tipo = 'hospital'
        AND ST_DWithin(c.centro, p.geometry::geography, 3000)
    GROUP BY c.barrio_id
)
INSERT INTO analytics.barrios_pois_distancia (
    barrio_id, nombre_barrio, municipio,
    dist_metro_km, dist_parque_km, dist_mall_km, dist_yoga_km,
    n_cafes_500m, n_coworking_1km, n_gimnasios_1km,
    n_restaurantes_500m, n_bares_500m,
    n_yoga_1km, n_universidades_2km, n_hospitales_3km,
    indice_nomada, calculado_en
)
SELECT
    c.barrio_id,
    c.nombre_barrio,
    c.municipio,
    dm.dist_km,
    dp.dist_km,
    dml.dist_km,
    dy.dist_km,
    COALESCE(cafe.cnt, 0),
    COALESCE(cow.cnt, 0),
    COALESCE(gym.cnt, 0),
    COALESCE(rest.cnt, 0),
    COALESCE(bar.cnt, 0),
    COALESCE(yoga.cnt, 0),
    COALESCE(univ.cnt, 0),
    COALESCE(hosp.cnt, 0),
    ROUND((
        COALESCE(cafe.cnt, 0) * 2.0
        + COALESCE(gym.cnt, 0)  * 1.5
        + COALESCE(yoga.cnt, 0) * 4.0
        + COALESCE(rest.cnt, 0) * 1.0
        + COALESCE(bar.cnt, 0)  * 0.5
        + COALESCE(cow.cnt, 0)  * 5.0
    )::numeric, 2),
    NOW()
FROM centroids c
LEFT JOIN dist_metro  dm  ON dm.barrio_id  = c.barrio_id
LEFT JOIN dist_parque dp  ON dp.barrio_id  = c.barrio_id
LEFT JOIN dist_mall   dml ON dml.barrio_id = c.barrio_id
LEFT JOIN dist_yoga   dy  ON dy.barrio_id  = c.barrio_id
LEFT JOIN cnt_cafe    cafe ON cafe.barrio_id = c.barrio_id
LEFT JOIN cnt_cowork  cow  ON cow.barrio_id  = c.barrio_id
LEFT JOIN cnt_gym     gym  ON gym.barrio_id  = c.barrio_id
LEFT JOIN cnt_rest    rest ON rest.barrio_id = c.barrio_id
LEFT JOIN cnt_bar     bar  ON bar.barrio_id  = c.barrio_id
LEFT JOIN cnt_yoga    yoga ON yoga.barrio_id = c.barrio_id
LEFT JOIN cnt_univ    univ ON univ.barrio_id = c.barrio_id
LEFT JOIN cnt_hosp    hosp ON hosp.barrio_id = c.barrio_id
ON CONFLICT (barrio_id) DO UPDATE SET
    nombre_barrio       = EXCLUDED.nombre_barrio,
    municipio           = EXCLUDED.municipio,
    dist_metro_km       = EXCLUDED.dist_metro_km,
    dist_parque_km      = EXCLUDED.dist_parque_km,
    dist_mall_km        = EXCLUDED.dist_mall_km,
    dist_yoga_km        = EXCLUDED.dist_yoga_km,
    n_cafes_500m        = EXCLUDED.n_cafes_500m,
    n_coworking_1km     = EXCLUDED.n_coworking_1km,
    n_gimnasios_1km     = EXCLUDED.n_gimnasios_1km,
    n_restaurantes_500m = EXCLUDED.n_restaurantes_500m,
    n_bares_500m        = EXCLUDED.n_bares_500m,
    n_yoga_1km          = EXCLUDED.n_yoga_1km,
    n_universidades_2km = EXCLUDED.n_universidades_2km,
    n_hospitales_3km    = EXCLUDED.n_hospitales_3km,
    indice_nomada       = EXCLUDED.indice_nomada,
    calculado_en        = EXCLUDED.calculado_en
"""

VERIFY_SQL = """
SELECT
    upper(b.municipio) AS municipio,
    COUNT(*)           AS total_barrios,
    COUNT(p.barrio_id) AS con_pois,
    SUM(p.n_yoga_1km)::int        AS yoga_total,
    SUM(p.n_gimnasios_1km)::int   AS gym_total,
    SUM(p.n_coworking_1km)::int   AS cowork_total,
    SUM(p.n_cafes_500m)::int      AS cafes_total,
    ROUND(AVG(p.dist_mall_km)::numeric, 2) AS avg_dist_mall,
    ROUND(AVG(p.dist_parque_km)::numeric, 2) AS avg_dist_parque
FROM raw.barrios b
LEFT JOIN analytics.barrios_pois_distancia p ON p.barrio_id = b.id
GROUP BY upper(b.municipio)
ORDER BY municipio
"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--municipio", help="Filtrar a un solo municipio (ej: BELLO)")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    where = ""
    if args.municipio:
        mun = args.municipio.upper()
        where = f"WHERE upper(b.municipio) = '{mun}'"

    sql = COMPUTE_SQL.format(where=where)

    if args.dry_run:
        print("[dry-run] SQL que se ejecutaría:")
        print(sql[:800] + "\n...")
        return

    print(f"Conectando a {DB_URL[:40]}...")
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    scope = args.municipio or "todos los municipios"
    print(f"Calculando barrios_pois_distancia para {scope}...")
    cur.execute(sql)
    affected = cur.rowcount
    conn.commit()
    print(f"Filas insertadas/actualizadas: {affected}")

    # Verificación post-carga
    print("\n── Resumen por municipio ──────────────────────────────────────────")
    cur.execute(VERIFY_SQL)
    rows = cur.fetchall()
    cols = [d[0] for d in cur.description]
    print("  ".join(f"{c:<15}" for c in cols))
    print("  ".join("-" * 15 for _ in cols))
    for row in rows:
        print("  ".join(f"{str(v):<15}" for v in row))

    conn.close()


if __name__ == "__main__":
    main()
