"""
Descarga polígonos de barrios desde un FeatureServer (ArcGIS) y los agrega
a raw.barrios en PostgreSQL con PostGIS.

Append-only, nunca reemplaza: los ~271 barrios de Medellín ya cargados se
quedan con su `id` estable para siempre (referenciado por FK desde listings,
eventos, analytics, etc — reasignar IDs los rompería en silencio). Corridas
futuras solo agregan barrios de OTROS municipios que todavía no existan
(clave natural: nombre + municipio, UNIQUE constraint en la tabla) — para
eso, ajustar BARRIOS_GEOJSON_URL en .env a la fuente de ese municipio.

Fuente usada para la carga inicial de Medellín: Centro Nacional de Memoria
Histórica — FeatureServer público (no trae columna de comuna, queda NULL).

Uso:
    python scripts/load_barrios.py
    python scripts/load_barrios.py --dry-run   # sin escribir a DB
"""

import argparse
import json
import logging
import os
import sys
from pathlib import Path

import psycopg2
import requests
from dotenv import load_dotenv

# Cargar .env desde raíz del proyecto
load_dotenv(Path(__file__).parent.parent / ".env")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuración
# ---------------------------------------------------------------------------
BARRIOS_URL = os.getenv(
    "BARRIOS_GEOJSON_URL",
    (
        "https://serviciosgiscnmh.centrodememoriahistorica.gov.co"
        "/agccnmh/rest/services/DCMH/Medellinguerraurbana/FeatureServer/1/query"
        "?where=1%3D1&outFields=*&outSR=4326&f=geojson&resultRecordCount=2000"
    ),
)

DB_URL = os.getenv("DATABASE_URL")
if not DB_URL:
    DB_HOST = os.getenv("POSTGRES_HOST", "localhost")
    DB_PORT = os.getenv("POSTGRES_PORT", "5432")
    DB_USER = os.getenv("POSTGRES_USER")
    DB_PASS = os.getenv("POSTGRES_PASSWORD")
    DB_NAME = os.getenv("POSTGRES_DB")
    DB_URL = f"postgresql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS raw.barrios (
    id          SERIAL PRIMARY KEY,
    nombre      TEXT,
    comuna      TEXT,
    municipio   TEXT,
    fuente      TEXT,
    raw_props   JSONB,                        -- propiedades originales completas
    geometry    GEOMETRY(MULTIPOLYGON, 4326), -- WGS84
    cargado_en  TIMESTAMPTZ DEFAULT NOW()
);

-- Índice espacial para queries geoespaciales
CREATE INDEX IF NOT EXISTS idx_barrios_geometry
    ON raw.barrios USING GIST (geometry);
"""

INSERT_SQL = """
INSERT INTO raw.barrios (nombre, comuna, municipio, fuente, raw_props, geometry)
VALUES (
    %(nombre)s,
    %(comuna)s,
    %(municipio)s,
    %(fuente)s,
    %(raw_props)s,
    ST_Multi(ST_GeomFromGeoJSON(%(geometry)s))
)
ON CONFLICT (nombre, municipio) DO NOTHING;
"""


def download_geojson(url: str) -> dict:
    log.info(f"Descargando GeoJSON desde: {url}")
    resp = requests.get(url, timeout=60)
    resp.raise_for_status()
    data = resp.json()
    features = data.get("features", [])
    log.info(f"Features descargadas: {len(features)}")
    return data


def extract_row(feature: dict) -> dict:
    props = feature.get("properties") or {}
    geom = feature.get("geometry")

    # Mapeo de campos — ajustar si cambia la fuente
    nombre = (
        props.get("Nombre_Barrio")
        or props.get("nombre_barrio")
        or props.get("NOMBRE")
        or props.get("nombre")
    )
    comuna = (
        props.get("COMUNA")
        or props.get("comuna")
        or props.get("NOMBRE_COMUNA")
    )
    municipio = (
        props.get("Nombre_Municipio")
        or props.get("MUNICIPIO")
        or props.get("municipio")
        or "Medellín"
    )

    return {
        "nombre": nombre,
        "comuna": comuna,
        "municipio": municipio,
        "fuente": BARRIOS_URL,
        "raw_props": json.dumps(props),
        "geometry": json.dumps(geom),
    }


def load_to_db(features: list[dict], dry_run: bool = False) -> int:
    if dry_run:
        log.info(f"[dry-run] Se insertarían {len(features)} barrios.")
        if features:
            log.info(f"[dry-run] Ejemplo: {features[0]}")
        return len(features)

    conn = psycopg2.connect(DB_URL)
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(CREATE_TABLE_SQL)

                rows = [extract_row(f) for f in features]
                # Filtrar features sin geometría
                rows = [r for r in rows if r["geometry"] != "null"]
                skipped_geom = len(features) - len(rows)
                if skipped_geom:
                    log.warning(f"Features sin geometría omitidas: {skipped_geom}")

                inserted = 0
                for row in rows:
                    cur.execute(INSERT_SQL, row)
                    inserted += cur.rowcount  # 0 si ya existía (ON CONFLICT DO NOTHING)

                ya_existian = len(rows) - inserted
                log.info(
                    f"raw.barrios: {inserted} nuevos insertados, "
                    f"{ya_existian} ya existían (nombre+municipio, sin tocar)."
                )
                return inserted
    finally:
        conn.close()


def main():
    parser = argparse.ArgumentParser(description="Carga barrios en raw.barrios")
    parser.add_argument("--dry-run", action="store_true", help="No escribe a DB")
    args = parser.parse_args()

    data = download_geojson(BARRIOS_URL)
    features = data.get("features", [])

    if not features:
        log.error("GeoJSON sin features. Verificar URL o formato.")
        sys.exit(1)

    total = load_to_db(features, dry_run=args.dry_run)
    log.info(f"Listo. {total} barrios {'simulados' if args.dry_run else 'cargados'}.")


if __name__ == "__main__":
    main()
