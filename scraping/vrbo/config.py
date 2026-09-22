"""Shared config for VRBO scraper — writes to raw.listings_premium."""
import hashlib
import os
from pathlib import Path
from typing import Optional

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from rapidfuzz import fuzz, process

_ROOT = Path(__file__).parent.parent.parent
load_dotenv(_ROOT / ".env.local")
load_dotenv(_ROOT / ".env")

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://social:urbidata007@localhost:5433/social",
)
USD_TO_COP = float(os.getenv("USD_TO_COP", "4100"))

# raw.listings_premium — shared with medellinliving and other premium sources.
# CREATE TABLE only if it doesn't exist; existing medellinliving data is preserved.
CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS raw.listings_premium (
    id                SERIAL PRIMARY KEY,
    fuente            VARCHAR NOT NULL,
    tipo_operacion    VARCHAR,
    tipo_inmueble     VARCHAR,
    titulo            VARCHAR,
    precio_cop        BIGINT,
    precio_usd        DECIMAL(12,2),
    area_m2           DECIMAL(10,2),
    habitaciones      INTEGER,
    banos             DECIMAL(4,1),
    barrio_raw        VARCHAR,
    barrio_id         INTEGER REFERENCES raw.barrios(id),
    url               VARCHAR UNIQUE NOT NULL,
    lat               DECIMAL(10,6),
    lon               DECIMAL(10,6),
    fecha_scraping    TIMESTAMP DEFAULT NOW(),
    fecha_publicacion TIMESTAMP,
    dedup_hash        VARCHAR UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_lp_barrio_id      ON raw.listings_premium(barrio_id);
CREATE INDEX IF NOT EXISTS idx_lp_fuente         ON raw.listings_premium(fuente);
CREATE INDEX IF NOT EXISTS idx_lp_tipo_operacion ON raw.listings_premium(tipo_operacion);
CREATE INDEX IF NOT EXISTS idx_lp_precio_cop     ON raw.listings_premium(precio_cop);

-- historial de precio, mismo patrón que raw.fn_track_precio_cambio() (alembic 0018)
-- pero sobre precio_cop en vez de precio.
CREATE OR REPLACE FUNCTION raw.fn_track_precio_cambio_premium()
RETURNS trigger LANGUAGE plpgsql AS $BODY$
BEGIN
    IF OLD.precio_cop IS DISTINCT FROM NEW.precio_cop
       AND OLD.precio_cop IS NOT NULL
       AND NEW.precio_cop IS NOT NULL
       AND NEW.precio_cop > 0
    THEN
        INSERT INTO raw.listings_precio_historial
            (listing_url, fuente, precio_anterior, precio_nuevo, fecha_cambio)
        VALUES
            (NEW.url, NEW.fuente, OLD.precio_cop, NEW.precio_cop, CURRENT_DATE)
        ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
END;
$BODY$;

DROP TRIGGER IF EXISTS trg_precio_cambio_premium ON raw.listings_premium;
CREATE TRIGGER trg_precio_cambio_premium
    BEFORE UPDATE OF precio_cop ON raw.listings_premium
    FOR EACH ROW EXECUTE FUNCTION raw.fn_track_precio_cambio_premium();
"""

UPSERT_SQL = """
INSERT INTO raw.listings_premium (
    fuente, tipo_operacion, tipo_inmueble, titulo,
    precio_cop, precio_usd, area_m2, habitaciones, banos,
    barrio_raw, barrio_id, url, lat, lon,
    fecha_publicacion, dedup_hash
) VALUES (
    %(fuente)s, %(tipo_operacion)s, %(tipo_inmueble)s, %(titulo)s,
    %(precio_cop)s, %(precio_usd)s, %(area_m2)s, %(habitaciones)s, %(banos)s,
    %(barrio_raw)s, %(barrio_id)s, %(url)s, %(lat)s, %(lon)s,
    %(fecha_publicacion)s, %(dedup_hash)s
)
ON CONFLICT (url) DO UPDATE SET
    precio_cop        = EXCLUDED.precio_cop,
    precio_usd        = EXCLUDED.precio_usd,
    area_m2           = EXCLUDED.area_m2,
    habitaciones      = EXCLUDED.habitaciones,
    banos             = EXCLUDED.banos,
    barrio_raw        = EXCLUDED.barrio_raw,
    barrio_id         = EXCLUDED.barrio_id,
    lat               = EXCLUDED.lat,
    lon               = EXCLUDED.lon,
    titulo            = EXCLUDED.titulo,
    fecha_scraping    = NOW()
"""


def get_conn():
    return psycopg2.connect(DATABASE_URL)


def ensure_table(conn) -> None:
    with conn.cursor() as cur:
        cur.execute(CREATE_TABLE_SQL)
    conn.commit()


def load_barrios(conn) -> list[dict]:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT id, nombre, municipio FROM raw.barrios ORDER BY id")
        return [dict(r) for r in cur.fetchall()]


def match_barrio(
    barrio_raw: str,
    barrios: list[dict],
    municipio_hint: Optional[str] = None,
) -> Optional[int]:
    if not barrio_raw or not barrios:
        return None
    query = barrio_raw.upper()
    if municipio_hint:
        scoped = [b for b in barrios if b.get("municipio", "").upper() == municipio_hint.upper()]
        if scoped:
            nombres_s = [b["nombre"] for b in scoped]
            result = process.extractOne(
                query, nombres_s, scorer=fuzz.token_set_ratio, score_cutoff=68
            )
            if result:
                return scoped[nombres_s.index(result[0])]["id"]
    nombres = [b["nombre"] for b in barrios]
    result = process.extractOne(query, nombres, scorer=fuzz.token_set_ratio, score_cutoff=70)
    if not result:
        return None
    return barrios[nombres.index(result[0])]["id"]


def barrio_from_coords(conn, lat: float, lon: float) -> Optional[int]:
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id FROM raw.barrios
                WHERE ST_Contains(geometry, ST_SetSRID(ST_Point(%s, %s), 4326))
                LIMIT 1
                """,
                (lon, lat),
            )
            row = cur.fetchone()
            return row[0] if row else None
    except Exception:
        return None


def make_dedup_hash(fuente: str, url: str) -> str:
    return hashlib.md5(f"{fuente}:{url}".encode()).hexdigest()


def upsert_listing(conn, listing: dict) -> None:
    with conn.cursor() as cur:
        cur.execute(UPSERT_SQL, listing)
    conn.commit()
