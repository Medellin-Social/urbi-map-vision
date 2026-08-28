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
  n_colegios_1km      colegios en 1 km
  dist_colegio_km     distancia al colegio más cercano
  n_parques_inf_500m  parques infantiles en 500 m
  n_canchas_1km       canchas / centros deportivos en 1 km
  dist_encicla_km     distancia a la estación EnCicla más cercana
  n_policia_1km       estaciones de policía en 1 km
  dist_policia_km     distancia a la estación de policía más cercana
  n_bomberos_2km      estaciones de bomberos en 2 km
  avg_internet_mbps   velocidad de descarga promedio (Ookla, tiles en 1 km)
  n_tests_internet    tests Ookla agregados en esos tiles (confiabilidad)
  score_icfes_municipio  puntaje Saber 11 promedio del MUNICIPIO (no por barrio — ver load_icfes_municipio.py)
  dist_obra_publica_km   distancia a la obra pública planeada más cercana
  nombre_obra_cercana    nombre de esa obra (seed manual, ver seed_obras_publicas.py)
  db_ruido_dia_cercano   dB promedio día de la estación/sensor de ruido SIATA más cercano
  dist_ruido_km          distancia a esa estación/sensor
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
    "postgresql://social:urbidata007@localhost:5433/social",
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
),
cnt_colegio AS (
    SELECT c.barrio_id,
        COUNT(p.id)::int AS cnt
    FROM centroids c
    LEFT JOIN raw.pois p
        ON p.tipo = 'colegio'
        AND ST_DWithin(c.centro, p.geometry::geography, 1000)
    GROUP BY c.barrio_id
),
dist_colegio AS (
    SELECT c.barrio_id,
        ROUND((MIN(ST_Distance(c.centro, p.geometry::geography)) / 1000)::numeric, 3) AS dist_km
    FROM centroids c
    LEFT JOIN LATERAL (
        SELECT geometry FROM raw.pois WHERE tipo = 'colegio'
        ORDER BY geometry <-> c.centro::geometry LIMIT 1
    ) p ON true
    GROUP BY c.barrio_id
),
cnt_parque_inf AS (
    SELECT c.barrio_id,
        COUNT(p.id)::int AS cnt
    FROM centroids c
    LEFT JOIN raw.pois p
        ON p.tipo = 'parque_infantil'
        AND ST_DWithin(c.centro, p.geometry::geography, 500)
    GROUP BY c.barrio_id
),
cnt_cancha AS (
    SELECT c.barrio_id,
        COUNT(p.id)::int AS cnt
    FROM centroids c
    LEFT JOIN raw.pois p
        ON p.tipo = 'cancha'
        AND ST_DWithin(c.centro, p.geometry::geography, 1000)
    GROUP BY c.barrio_id
),
dist_encicla AS (
    SELECT c.barrio_id,
        ROUND((MIN(ST_Distance(c.centro, p.geometry::geography)) / 1000)::numeric, 3) AS dist_km
    FROM centroids c
    LEFT JOIN LATERAL (
        SELECT geometry FROM raw.pois WHERE tipo = 'encicla'
        ORDER BY geometry <-> c.centro::geometry LIMIT 1
    ) p ON true
    GROUP BY c.barrio_id
),
cnt_policia AS (
    SELECT c.barrio_id,
        COUNT(p.id)::int AS cnt
    FROM centroids c
    LEFT JOIN raw.pois p
        ON p.tipo = 'estacion_policia'
        AND ST_DWithin(c.centro, p.geometry::geography, 1000)
    GROUP BY c.barrio_id
),
dist_policia AS (
    SELECT c.barrio_id,
        ROUND((MIN(ST_Distance(c.centro, p.geometry::geography)) / 1000)::numeric, 3) AS dist_km
    FROM centroids c
    LEFT JOIN LATERAL (
        SELECT geometry FROM raw.pois WHERE tipo = 'estacion_policia'
        ORDER BY geometry <-> c.centro::geometry LIMIT 1
    ) p ON true
    GROUP BY c.barrio_id
),
cnt_bomberos AS (
    SELECT c.barrio_id,
        COUNT(p.id)::int AS cnt
    FROM centroids c
    LEFT JOIN raw.pois p
        ON p.tipo = 'bomberos'
        AND ST_DWithin(c.centro, p.geometry::geography, 2000)
    GROUP BY c.barrio_id
),
internet_cercano AS (
    SELECT c.barrio_id,
        ROUND(AVG(t.avg_d_kbps)::numeric / 1000, 1) AS avg_mbps,
        SUM(t.tests)::int AS n_tests
    FROM centroids c
    LEFT JOIN raw.internet_speed_tiles t
        ON ST_DWithin(c.centro, t.geometry::geography, 1000)
    GROUP BY c.barrio_id
),
icfes AS (
    SELECT c.barrio_id, i.avg_punt_global
    FROM centroids c
    LEFT JOIN raw.icfes_municipio i ON i.municipio = upper(c.municipio)
),
dist_obra AS (
    SELECT c.barrio_id, o.dist_km, o.nombre
    FROM centroids c
    LEFT JOIN LATERAL (
        SELECT o.nombre,
            ROUND((ST_Distance(c.centro, o.geometry::geography) / 1000)::numeric, 3) AS dist_km
        FROM raw.obras_publicas_planeadas o
        ORDER BY o.geometry <-> c.centro::geometry LIMIT 1
    ) o ON true
),
dist_ruido AS (
    SELECT c.barrio_id, r.dist_km, r.db_prom_dia
    FROM centroids c
    LEFT JOIN LATERAL (
        SELECT r.db_prom_dia,
            ROUND((ST_Distance(c.centro, r.geometry::geography) / 1000)::numeric, 3) AS dist_km
        FROM raw.ruido_estaciones r
        ORDER BY r.geometry <-> c.centro::geometry LIMIT 1
    ) r ON true
)
INSERT INTO analytics.barrios_pois_distancia (
    barrio_id, nombre_barrio, municipio,
    dist_metro_km, dist_parque_km, dist_mall_km, dist_yoga_km,
    n_cafes_500m, n_coworking_1km, n_gimnasios_1km,
    n_restaurantes_500m, n_bares_500m,
    n_yoga_1km, n_universidades_2km, n_hospitales_3km,
    n_colegios_1km, dist_colegio_km,
    n_parques_inf_500m, n_canchas_1km, dist_encicla_km,
    n_policia_1km, dist_policia_km, n_bomberos_2km,
    avg_internet_mbps, n_tests_internet,
    score_icfes_municipio, dist_obra_publica_km, nombre_obra_cercana,
    db_ruido_dia_cercano, dist_ruido_km,
    walk_score, transit_score,
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
    COALESCE(col.cnt, 0),
    dcol.dist_km,
    COALESCE(pinf.cnt, 0),
    COALESCE(canc.cnt, 0),
    dencicla.dist_km,
    COALESCE(pol.cnt, 0),
    dpol.dist_km,
    COALESCE(bomb.cnt, 0),
    inet.avg_mbps,
    COALESCE(inet.n_tests, 0),
    icfes.avg_punt_global,
    dobra.dist_km,
    dobra.nombre,
    druido.db_prom_dia,
    druido.dist_km,
    -- Walk score 0-100: densidad de servicios caminables. Tope por categoría
    -- (rendimientos decrecientes, estilo Walk Score) para que discrimine y no sature.
    LEAST(100, (
        LEAST(20, COALESCE(cafe.cnt, 0) * 4)
        + LEAST(20, COALESCE(rest.cnt, 0) * 2)
        + LEAST(10, COALESCE(bar.cnt, 0)  * 2)
        + LEAST(15, COALESCE(gym.cnt, 0)  * 3)
        + LEAST(15, COALESCE(col.cnt, 0)  * 2)
        + CASE WHEN dp.dist_km  IS NOT NULL AND dp.dist_km  < 1.0 THEN 10 ELSE 0 END
        + CASE WHEN dml.dist_km IS NOT NULL AND dml.dist_km < 1.5 THEN 10 ELSE 0 END
    ))::int,
    -- Transit score 0-100: cercanía al metro (0km=100, ~2.5km=0).
    CASE WHEN dm.dist_km IS NULL THEN NULL
         ELSE GREATEST(0, LEAST(100, ROUND(100 - dm.dist_km * 40)))::int END,
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
LEFT JOIN cnt_colegio col  ON col.barrio_id  = c.barrio_id
LEFT JOIN dist_colegio dcol ON dcol.barrio_id = c.barrio_id
LEFT JOIN cnt_parque_inf pinf ON pinf.barrio_id = c.barrio_id
LEFT JOIN cnt_cancha  canc ON canc.barrio_id = c.barrio_id
LEFT JOIN dist_encicla dencicla ON dencicla.barrio_id = c.barrio_id
LEFT JOIN cnt_policia pol  ON pol.barrio_id  = c.barrio_id
LEFT JOIN dist_policia dpol ON dpol.barrio_id = c.barrio_id
LEFT JOIN cnt_bomberos bomb ON bomb.barrio_id = c.barrio_id
LEFT JOIN internet_cercano inet ON inet.barrio_id = c.barrio_id
LEFT JOIN icfes icfes ON icfes.barrio_id = c.barrio_id
LEFT JOIN dist_obra dobra ON dobra.barrio_id = c.barrio_id
LEFT JOIN dist_ruido druido ON druido.barrio_id = c.barrio_id
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
    n_colegios_1km      = EXCLUDED.n_colegios_1km,
    dist_colegio_km     = EXCLUDED.dist_colegio_km,
    n_parques_inf_500m  = EXCLUDED.n_parques_inf_500m,
    n_canchas_1km       = EXCLUDED.n_canchas_1km,
    dist_encicla_km     = EXCLUDED.dist_encicla_km,
    n_policia_1km       = EXCLUDED.n_policia_1km,
    dist_policia_km     = EXCLUDED.dist_policia_km,
    n_bomberos_2km      = EXCLUDED.n_bomberos_2km,
    avg_internet_mbps   = EXCLUDED.avg_internet_mbps,
    n_tests_internet    = EXCLUDED.n_tests_internet,
    score_icfes_municipio = EXCLUDED.score_icfes_municipio,
    dist_obra_publica_km  = EXCLUDED.dist_obra_publica_km,
    nombre_obra_cercana   = EXCLUDED.nombre_obra_cercana,
    db_ruido_dia_cercano  = EXCLUDED.db_ruido_dia_cercano,
    dist_ruido_km         = EXCLUDED.dist_ruido_km,
    walk_score          = EXCLUDED.walk_score,
    transit_score       = EXCLUDED.transit_score,
    indice_nomada       = EXCLUDED.indice_nomada,
    calculado_en        = EXCLUDED.calculado_en
"""

# Columnas nuevas (colegios + scores). IF NOT EXISTS → idempotente.
ALTER_SQL = """
ALTER TABLE analytics.barrios_pois_distancia
    ADD COLUMN IF NOT EXISTS n_colegios_1km     integer,
    ADD COLUMN IF NOT EXISTS dist_colegio_km    numeric(8,3),
    ADD COLUMN IF NOT EXISTS walk_score         integer,
    ADD COLUMN IF NOT EXISTS transit_score      integer,
    ADD COLUMN IF NOT EXISTS n_parques_inf_500m integer,
    ADD COLUMN IF NOT EXISTS n_canchas_1km      integer,
    ADD COLUMN IF NOT EXISTS dist_encicla_km    numeric(8,3),
    ADD COLUMN IF NOT EXISTS n_policia_1km      integer,
    ADD COLUMN IF NOT EXISTS dist_policia_km    numeric(8,3),
    ADD COLUMN IF NOT EXISTS n_bomberos_2km     integer,
    ADD COLUMN IF NOT EXISTS avg_internet_mbps     numeric(8,2),
    ADD COLUMN IF NOT EXISTS n_tests_internet      integer,
    ADD COLUMN IF NOT EXISTS score_icfes_municipio numeric(6,2),
    ADD COLUMN IF NOT EXISTS dist_obra_publica_km  numeric(8,3),
    ADD COLUMN IF NOT EXISTS nombre_obra_cercana   text,
    ADD COLUMN IF NOT EXISTS db_ruido_dia_cercano  numeric(5,1),
    ADD COLUMN IF NOT EXISTS dist_ruido_km         numeric(8,3)
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

    cur.execute(ALTER_SQL)  # columnas nuevas (colegios + scores), idempotente
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
