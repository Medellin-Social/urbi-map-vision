"""
Descarga POIs del Valle de Aburrá desde OpenStreetMap (Overpass API)
y los carga en raw.pois. Opcionalmente construye analytics.barrios_pois_distancia.

TIPOS DE POI
------------
- metro       : Estaciones de Metro / Metrocable (railway=station)
- parque      : Parques urbanos (leisure=park)
- mall        : Centros comerciales (shop=mall)
- universidad : Universidades (amenity=university)
- hospital    : Hospitales y clínicas (amenity=hospital | amenity=clinic)

BBOX: Valle de Aburrá completo — cubre los 10 municipios.

Uso:
    python scripts/load_pois.py                    # carga raw.pois
    python scripts/load_pois.py --dry-run          # simula sin escribir
    python scripts/load_pois.py --build-analytics  # carga + analytics + resumen
"""

import argparse
import json
import logging
import os
from pathlib import Path

import psycopg2
import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

DB_URL = os.getenv("DATABASE_URL")
if not DB_URL:
    DB_URL = (
        f"postgresql://{os.getenv('POSTGRES_USER')}:{os.getenv('POSTGRES_PASSWORD')}"
        f"@{os.getenv('POSTGRES_HOST','localhost')}:{os.getenv('POSTGRES_PORT','5432')}"
        f"/{os.getenv('POSTGRES_DB')}"
    )

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
# Valle de Aburrá: sur=5.98 norte=6.52 oeste=-75.76 este=-75.45
BBOX = "5.98,-75.76,6.52,-75.45"

# (osm_key, osm_value, tipo_normalizado)
POI_TAGS = [
    ("railway", "station",        "metro"),
    ("leisure", "park",           "parque"),
    ("shop",    "mall",           "mall"),
    ("amenity", "university",     "universidad"),
    ("amenity", "hospital",       "hospital"),
    ("amenity", "clinic",         "hospital"),
    ("amenity", "cafe",           "cafe"),
    ("office",  "coworking",      "coworking"),
    ("leisure", "fitness_centre", "gimnasio"),
    ("amenity", "restaurant",     "restaurante"),
    ("amenity", "bar",            "bar"),
    ("amenity", "coworking",      "coworking"),
    ("leisure", "yoga",           "yoga_studio"),
    ("leisure", "dance",          "yoga_studio"),
    ("amenity", "studio",         "yoga_studio"),
    ("sport",   "yoga",           "yoga_studio"),
]

CREATE_RAW_SQL = """
CREATE TABLE IF NOT EXISTS raw.pois (
    id          SERIAL PRIMARY KEY,
    osm_id      TEXT UNIQUE,
    nombre      TEXT,
    tipo        TEXT,
    subtipo     TEXT,
    raw_tags    JSONB,
    geometry    GEOMETRY(POINT, 4326),
    cargado_en  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pois_geometry ON raw.pois USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_pois_tipo     ON raw.pois (tipo);
"""

TRUNCATE_RAW_SQL = "TRUNCATE TABLE raw.pois RESTART IDENTITY;"

CREATE_ANALYTICS_SQL = """
CREATE TABLE IF NOT EXISTS analytics.barrios_pois_distancia (
    barrio_id           INT PRIMARY KEY,
    nombre_barrio       TEXT,
    municipio           TEXT,
    dist_metro_km       NUMERIC(8,3),
    dist_parque_km      NUMERIC(8,3),
    dist_mall_km        NUMERIC(8,3),
    n_universidades_2km INT,
    n_hospitales_3km    INT,
    n_cafes_500m        INT,
    n_coworking_1km     INT,
    n_gimnasios_1km     INT,
    n_restaurantes_500m INT,
    n_bares_500m        INT,
    n_yoga_1km          INT,
    dist_yoga_km        NUMERIC(8,3),
    indice_nomada       NUMERIC(10,2),
    calculado_en        TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE analytics.barrios_pois_distancia ADD COLUMN IF NOT EXISTS n_cafes_500m        INT;
ALTER TABLE analytics.barrios_pois_distancia ADD COLUMN IF NOT EXISTS n_coworking_1km     INT;
ALTER TABLE analytics.barrios_pois_distancia ADD COLUMN IF NOT EXISTS n_gimnasios_1km     INT;
ALTER TABLE analytics.barrios_pois_distancia ADD COLUMN IF NOT EXISTS n_restaurantes_500m INT;
ALTER TABLE analytics.barrios_pois_distancia ADD COLUMN IF NOT EXISTS n_bares_500m        INT;
ALTER TABLE analytics.barrios_pois_distancia ADD COLUMN IF NOT EXISTS n_yoga_1km          INT;
ALTER TABLE analytics.barrios_pois_distancia ADD COLUMN IF NOT EXISTS dist_yoga_km        NUMERIC(8,3);
ALTER TABLE analytics.barrios_pois_distancia ADD COLUMN IF NOT EXISTS indice_nomada       NUMERIC(10,2);
"""

TRUNCATE_ANALYTICS_SQL = "TRUNCATE TABLE analytics.barrios_pois_distancia RESTART IDENTITY;"

INSERT_ANALYTICS_SQL = """
INSERT INTO analytics.barrios_pois_distancia
    (barrio_id, nombre_barrio, municipio,
     dist_metro_km, dist_parque_km, dist_mall_km,
     n_universidades_2km, n_hospitales_3km,
     n_cafes_500m, n_coworking_1km, n_gimnasios_1km,
     n_restaurantes_500m, n_bares_500m,
     n_yoga_1km, dist_yoga_km, indice_nomada)
SELECT
    b.id,
    b.nombre,
    b.municipio,
    metro.dist_km,
    parque.dist_km,
    mall.dist_km,
    (SELECT COUNT(*) FROM raw.pois p
     WHERE p.tipo = 'universidad'
       AND ST_DWithin(ST_Centroid(b.geometry)::geography, p.geometry::geography, 2000)),
    (SELECT COUNT(*) FROM raw.pois p
     WHERE p.tipo = 'hospital'
       AND ST_DWithin(ST_Centroid(b.geometry)::geography, p.geometry::geography, 3000)),
    (SELECT COUNT(*) FROM raw.pois p
     WHERE p.tipo = 'cafe'
       AND ST_DWithin(ST_Centroid(b.geometry)::geography, p.geometry::geography, 500))
        AS n_cafes_500m,
    (SELECT COUNT(*) FROM raw.pois p
     WHERE p.tipo = 'coworking'
       AND ST_DWithin(ST_Centroid(b.geometry)::geography, p.geometry::geography, 1000))
        AS n_coworking_1km,
    (SELECT COUNT(*) FROM raw.pois p
     WHERE p.tipo = 'gimnasio'
       AND ST_DWithin(ST_Centroid(b.geometry)::geography, p.geometry::geography, 1000))
        AS n_gimnasios_1km,
    (SELECT COUNT(*) FROM raw.pois p
     WHERE p.tipo = 'restaurante'
       AND ST_DWithin(ST_Centroid(b.geometry)::geography, p.geometry::geography, 500))
        AS n_restaurantes_500m,
    (SELECT COUNT(*) FROM raw.pois p
     WHERE p.tipo = 'bar'
       AND ST_DWithin(ST_Centroid(b.geometry)::geography, p.geometry::geography, 500))
        AS n_bares_500m,
    (SELECT COUNT(*) FROM raw.pois p
     WHERE p.tipo = 'yoga_studio'
       AND ST_DWithin(ST_Centroid(b.geometry)::geography, p.geometry::geography, 1000))
        AS n_yoga_1km,
    yoga.dist_km                                                        AS dist_yoga_km,
    -- indice_nomada: coworking (4x), cafes (2x), gimnasios (1.5x), restaurantes (1x),
    --               bares (0.5x), yoga (8 si >=3, 4 si >=1, 0 si ninguno)
    ROUND(CAST(
        (SELECT COUNT(*) FROM raw.pois p WHERE p.tipo = 'coworking'
         AND ST_DWithin(ST_Centroid(b.geometry)::geography, p.geometry::geography, 1000)) * 4.0
      + (SELECT COUNT(*) FROM raw.pois p WHERE p.tipo = 'cafe'
         AND ST_DWithin(ST_Centroid(b.geometry)::geography, p.geometry::geography, 500)) * 2.0
      + (SELECT COUNT(*) FROM raw.pois p WHERE p.tipo = 'gimnasio'
         AND ST_DWithin(ST_Centroid(b.geometry)::geography, p.geometry::geography, 1000)) * 1.5
      + (SELECT COUNT(*) FROM raw.pois p WHERE p.tipo = 'restaurante'
         AND ST_DWithin(ST_Centroid(b.geometry)::geography, p.geometry::geography, 500)) * 1.0
      + (SELECT COUNT(*) FROM raw.pois p WHERE p.tipo = 'bar'
         AND ST_DWithin(ST_Centroid(b.geometry)::geography, p.geometry::geography, 500)) * 0.5
      + CASE
            WHEN (SELECT COUNT(*) FROM raw.pois p WHERE p.tipo = 'yoga_studio'
                  AND ST_DWithin(ST_Centroid(b.geometry)::geography, p.geometry::geography, 1000)) >= 3
                THEN 8.0
            WHEN (SELECT COUNT(*) FROM raw.pois p WHERE p.tipo = 'yoga_studio'
                  AND ST_DWithin(ST_Centroid(b.geometry)::geography, p.geometry::geography, 1000)) >= 1
                THEN 4.0
            ELSE 0.0
        END
    AS numeric), 2)                                                     AS indice_nomada
FROM raw.barrios b
LEFT JOIN LATERAL (
    SELECT ROUND(CAST(
               ST_Distance(ST_Centroid(b.geometry)::geography, p.geometry::geography) / 1000
           AS numeric), 3) AS dist_km
    FROM raw.pois p WHERE p.tipo = 'metro'
    ORDER BY ST_Distance(ST_Centroid(b.geometry)::geography, p.geometry::geography)
    LIMIT 1
) metro ON true
LEFT JOIN LATERAL (
    SELECT ROUND(CAST(
               ST_Distance(ST_Centroid(b.geometry)::geography, p.geometry::geography) / 1000
           AS numeric), 3) AS dist_km
    FROM raw.pois p WHERE p.tipo = 'parque'
    ORDER BY ST_Distance(ST_Centroid(b.geometry)::geography, p.geometry::geography)
    LIMIT 1
) parque ON true
LEFT JOIN LATERAL (
    SELECT ROUND(CAST(
               ST_Distance(ST_Centroid(b.geometry)::geography, p.geometry::geography) / 1000
           AS numeric), 3) AS dist_km
    FROM raw.pois p WHERE p.tipo = 'mall'
    ORDER BY ST_Distance(ST_Centroid(b.geometry)::geography, p.geometry::geography)
    LIMIT 1
) mall ON true
LEFT JOIN LATERAL (
    SELECT ROUND(CAST(
               ST_Distance(ST_Centroid(b.geometry)::geography, p.geometry::geography) / 1000
           AS numeric), 3) AS dist_km
    FROM raw.pois p WHERE p.tipo = 'yoga_studio'
    ORDER BY ST_Distance(ST_Centroid(b.geometry)::geography, p.geometry::geography)
    LIMIT 1
) yoga ON true;
"""


def build_overpass_query() -> str:
    lines = [f"[out:json][timeout:90];", "("]
    for tag_key, tag_val, _ in POI_TAGS:
        lines.append(f'  node["{tag_key}"="{tag_val}"]({BBOX});')
        lines.append(f'  way["{tag_key}"="{tag_val}"]({BBOX});')
    lines.append(");")
    lines.append("out center tags;")
    return "\n".join(lines)


def detect_tipo(tags: dict) -> tuple[str, str] | None:
    for tag_key, tag_val, tipo in POI_TAGS:
        if tags.get(tag_key) == tag_val:
            return tipo, f"{tag_key}={tag_val}"
    return None


def fetch_pois() -> list[dict]:
    query = build_overpass_query()
    log.info(f"Consultando Overpass API (bbox: {BBOX})...")
    resp = requests.post(
        OVERPASS_URL,
        data={"data": query},
        headers={"User-Agent": "social/1.0 (data pipeline)"},
        timeout=120,
    )
    resp.raise_for_status()
    elements = resp.json().get("elements", [])
    log.info(f"Elementos OSM recibidos: {len(elements)}")
    return elements


def parse_pois(elements: list[dict]) -> list[dict]:
    rows = []
    seen: set[str] = set()

    for el in elements:
        tags = el.get("tags", {})
        result = detect_tipo(tags)
        if not result:
            continue

        tipo, subtipo = result
        osm_id = f"{el['type']}/{el['id']}"
        if osm_id in seen:
            continue
        seen.add(osm_id)

        nombre = (
            tags.get("name")
            or tags.get("name:es")
            or tags.get("ref")
            or osm_id
        )

        if el["type"] == "node":
            lat, lon = el.get("lat"), el.get("lon")
        else:
            center = el.get("center", {})
            lat, lon = center.get("lat"), center.get("lon")

        if lat is None or lon is None:
            continue

        rows.append({
            "osm_id":    osm_id,
            "nombre":    nombre,
            "tipo":      tipo,
            "subtipo":   subtipo,
            "raw_tags":  json.dumps(tags),
            "lat":       float(lat),
            "lon":       float(lon),
        })

    return rows


def load_raw_pois(conn, rows: list[dict]) -> int:
    with conn:
        with conn.cursor() as cur:
            cur.execute(CREATE_RAW_SQL)
            cur.execute(TRUNCATE_RAW_SQL)
            for row in rows:
                cur.execute(
                    """
                    INSERT INTO raw.pois (osm_id, nombre, tipo, subtipo, raw_tags, geometry)
                    VALUES (%(osm_id)s, %(nombre)s, %(tipo)s, %(subtipo)s, %(raw_tags)s,
                            ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326))
                    ON CONFLICT (osm_id) DO NOTHING
                    """,
                    row,
                )
            cur.execute("SELECT COUNT(*) FROM raw.pois")
            count = cur.fetchone()[0]
    log.info(f"Insertados {count} POIs en raw.pois.")
    return count


def build_analytics(conn) -> int:
    log.info("Construyendo analytics.barrios_pois_distancia...")
    with conn:
        with conn.cursor() as cur:
            cur.execute(CREATE_ANALYTICS_SQL)
            cur.execute(TRUNCATE_ANALYTICS_SQL)
            cur.execute(INSERT_ANALYTICS_SQL)
            cur.execute("SELECT COUNT(*) FROM analytics.barrios_pois_distancia")
            count = cur.fetchone()[0]
    log.info(f"Calculadas distancias para {count} barrios.")
    return count


def print_summary(conn):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT nombre_barrio, municipio, dist_metro_km, dist_parque_km,
                   dist_mall_km, n_universidades_2km, n_hospitales_3km
            FROM analytics.barrios_pois_distancia
            WHERE dist_metro_km IS NOT NULL
            ORDER BY dist_metro_km ASC
            LIMIT 10
        """)
        rows = cur.fetchall()

    log.info("=== TOP 10 BARRIOS MÁS CERCANOS AL METRO ===")
    log.info(f"{'Barrio':<30} {'Muni':<12} {'Metro':>8} {'Parque':>8} {'Mall':>8} {'Univ':>6} {'Hosp':>6}")
    for r in rows:
        log.info(f"{r[0]:<30} {r[1]:<12} {str(r[2]):>8} {str(r[3]):>8} {str(r[4]):>8} {str(r[5]):>6} {str(r[6]):>6}")

    with conn.cursor() as cur:
        cur.execute("""
            SELECT nombre_barrio, municipio, dist_metro_km
            FROM analytics.barrios_pois_distancia
            ORDER BY dist_metro_km DESC NULLS LAST
            LIMIT 10
        """)
        rows_far = cur.fetchall()

    log.info("=== TOP 10 BARRIOS MÁS ALEJADOS DEL METRO ===")
    for r in rows_far:
        log.info(f"{r[0]:<30} {r[1]:<12} {str(r[2]):>8} km")

    with conn.cursor() as cur:
        cur.execute("""
            SELECT
                ROW_NUMBER() OVER (ORDER BY indice_nomada DESC NULLS LAST) AS ranking,
                nombre_barrio,
                municipio,
                indice_nomada,
                n_cafes_500m,
                n_coworking_1km,
                n_gimnasios_1km,
                n_restaurantes_500m,
                n_bares_500m
            FROM analytics.barrios_pois_distancia
            ORDER BY indice_nomada DESC NULLS LAST
            LIMIT 10
        """)
        rows_nomada = cur.fetchall()

    log.info("=== TOP 10 BARRIOS POR ÍNDICE NÓMADA ===")
    log.info(
        f"{'#':>3} {'Barrio':<30} {'Muni':<12} {'Índice':>8}"
        f" {'Cafés':>6} {'Cowrk':>6} {'Gym':>5} {'Rest':>5} {'Bar':>5}"
    )
    for r in rows_nomada:
        log.info(
            f"{str(r[0]):>3} {r[1]:<30} {r[2]:<12} {str(r[3]):>8}"
            f" {str(r[4]):>6} {str(r[5]):>6} {str(r[6]):>5} {str(r[7]):>5} {str(r[8]):>5}"
        )


def main():
    parser = argparse.ArgumentParser(description="Carga POIs del Valle de Aburrá en raw.pois")
    parser.add_argument("--dry-run", action="store_true", help="No escribe en DB")
    parser.add_argument(
        "--build-analytics",
        action="store_true",
        help="Construye analytics.barrios_pois_distancia y muestra resumen",
    )
    args = parser.parse_args()

    elements = fetch_pois()
    rows = parse_pois(elements)

    by_tipo: dict[str, int] = {}
    for r in rows:
        by_tipo[r["tipo"]] = by_tipo.get(r["tipo"], 0) + 1
    log.info(f"POIs parseados: {len(rows)} — {by_tipo}")

    if args.dry_run:
        for r in rows[:5]:
            log.info(f"[dry-run] {r['tipo']:12} {r['nombre'][:40]} ({r['lat']:.4f}, {r['lon']:.4f})")
        log.info(f"[dry-run] Total: {len(rows)} POIs. Sin escritura en DB.")
        return

    conn = psycopg2.connect(DB_URL)
    try:
        load_raw_pois(conn, rows)
        if args.build_analytics:
            build_analytics(conn)
            print_summary(conn)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
