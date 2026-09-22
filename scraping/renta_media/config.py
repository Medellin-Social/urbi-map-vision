"""Shared config for renta_media scrapers."""
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
EUR_TO_COP = float(os.getenv("EUR_TO_COP", "4500"))
USD_TO_COP = float(os.getenv("USD_TO_COP", "4100"))

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS raw.listings_renta_media (
    id                SERIAL PRIMARY KEY,
    fuente            VARCHAR NOT NULL,
    titulo            VARCHAR,
    precio_mes_cop    BIGINT,
    precio_mes_usd    DECIMAL,
    area_m2           DECIMAL,
    habitaciones      INTEGER,
    banos             DECIMAL,
    barrio_raw        VARCHAR,
    barrio_id         INTEGER REFERENCES raw.barrios(id),
    amoblado          BOOLEAN DEFAULT TRUE,
    incluye_servicios BOOLEAN,
    min_noches        INTEGER,
    url               VARCHAR UNIQUE,
    lat               DECIMAL(10,6),
    lon               DECIMAL(10,6),
    fecha_scraping    TIMESTAMP DEFAULT NOW(),
    dedup_hash        VARCHAR UNIQUE,
    descripcion       TEXT,
    fotos             TEXT[],
    amenidades        TEXT[]
);
CREATE INDEX IF NOT EXISTS idx_lrm_barrio_id ON raw.listings_renta_media(barrio_id);
CREATE INDEX IF NOT EXISTS idx_lrm_fuente    ON raw.listings_renta_media(fuente);
ALTER TABLE raw.listings_renta_media ADD COLUMN IF NOT EXISTS descripcion  TEXT;
ALTER TABLE raw.listings_renta_media ADD COLUMN IF NOT EXISTS fotos        TEXT[];
ALTER TABLE raw.listings_renta_media ADD COLUMN IF NOT EXISTS amenidades   TEXT[];

-- historial de precio, mismo patrón que raw.fn_track_precio_cambio() (alembic 0018)
-- pero sobre precio_mes_cop en vez de precio.
CREATE OR REPLACE FUNCTION raw.fn_track_precio_cambio_renta_media()
RETURNS trigger LANGUAGE plpgsql AS $BODY$
BEGIN
    IF OLD.precio_mes_cop IS DISTINCT FROM NEW.precio_mes_cop
       AND OLD.precio_mes_cop IS NOT NULL
       AND NEW.precio_mes_cop IS NOT NULL
       AND NEW.precio_mes_cop > 0
    THEN
        INSERT INTO raw.listings_precio_historial
            (listing_url, fuente, precio_anterior, precio_nuevo, fecha_cambio)
        VALUES
            (NEW.url, NEW.fuente, OLD.precio_mes_cop, NEW.precio_mes_cop, CURRENT_DATE)
        ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
END;
$BODY$;

DROP TRIGGER IF EXISTS trg_precio_cambio_renta_media ON raw.listings_renta_media;
CREATE TRIGGER trg_precio_cambio_renta_media
    BEFORE UPDATE OF precio_mes_cop ON raw.listings_renta_media
    FOR EACH ROW EXECUTE FUNCTION raw.fn_track_precio_cambio_renta_media();
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

    # Try municipality-scoped match first (lower cutoff — we already know the city)
    if municipio_hint:
        scoped = [b for b in barrios if b.get("municipio", "").upper() == municipio_hint.upper()]
        if scoped:
            nombres_s = [b["nombre"] for b in scoped]
            result = process.extractOne(
                query, nombres_s, scorer=fuzz.token_set_ratio, score_cutoff=68
            )
            if result:
                idx = nombres_s.index(result[0])
                return scoped[idx]["id"]

    # Global fallback
    nombres = [b["nombre"] for b in barrios]
    result = process.extractOne(
        query, nombres, scorer=fuzz.token_set_ratio, score_cutoff=70
    )
    if not result:
        return None
    idx = nombres.index(result[0])
    return barrios[idx]["id"]


def make_dedup_hash(fuente: str, url: str) -> str:
    return hashlib.md5(f"{fuente}:{url}".encode()).hexdigest()


UPSERT_SQL = """
INSERT INTO raw.listings_renta_media (
    fuente, titulo, precio_mes_cop, precio_mes_usd, area_m2,
    habitaciones, banos, barrio_raw, barrio_id, amoblado,
    incluye_servicios, min_noches, url, lat, lon, dedup_hash
) VALUES (
    %(fuente)s, %(titulo)s, %(precio_mes_cop)s, %(precio_mes_usd)s, %(area_m2)s,
    %(habitaciones)s, %(banos)s, %(barrio_raw)s, %(barrio_id)s, %(amoblado)s,
    %(incluye_servicios)s, %(min_noches)s, %(url)s, %(lat)s, %(lon)s, %(dedup_hash)s
)
ON CONFLICT (url) DO UPDATE SET
    precio_mes_cop    = EXCLUDED.precio_mes_cop,
    precio_mes_usd    = EXCLUDED.precio_mes_usd,
    titulo            = EXCLUDED.titulo,
    area_m2           = EXCLUDED.area_m2,
    habitaciones      = EXCLUDED.habitaciones,
    banos             = EXCLUDED.banos,
    barrio_raw        = EXCLUDED.barrio_raw,
    barrio_id         = EXCLUDED.barrio_id,
    amoblado          = EXCLUDED.amoblado,
    incluye_servicios = EXCLUDED.incluye_servicios,
    min_noches        = EXCLUDED.min_noches,
    lat               = EXCLUDED.lat,
    lon               = EXCLUDED.lon,
    fecha_scraping    = NOW()
"""


def upsert_listing(conn, listing: dict) -> None:
    with conn.cursor() as cur:
        cur.execute(UPSERT_SQL, listing)
    conn.commit()


UPDATE_DETAIL_SQL = """
UPDATE raw.listings_renta_media SET
    descripcion = COALESCE(%(descripcion)s, descripcion),
    fotos       = CASE WHEN %(fotos)s IS NOT NULL THEN %(fotos)s ELSE fotos END,
    amenidades  = CASE WHEN %(amenidades)s IS NOT NULL THEN %(amenidades)s ELSE amenidades END,
    lat         = COALESCE(%(lat)s, lat),
    lon         = COALESCE(%(lon)s, lon),
    area_m2     = COALESCE(%(area_m2)s, area_m2),
    habitaciones = COALESCE(%(habitaciones)s, habitaciones),
    banos       = COALESCE(%(banos)s, banos),
    fecha_scraping = NOW()
WHERE url = %(url)s
"""


def update_listing_detail(
    conn,
    url: str,
    descripcion: Optional[str] = None,
    fotos: Optional[list] = None,
    amenidades: Optional[list] = None,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    area_m2: Optional[float] = None,
    habitaciones: Optional[int] = None,
    banos: Optional[float] = None,
) -> bool:
    """Update rich detail fields for an existing listing row. Returns True if row updated."""
    with conn.cursor() as cur:
        cur.execute(UPDATE_DETAIL_SQL, {
            "url":          url,
            "descripcion":  descripcion,
            "fotos":        fotos,
            "amenidades":   amenidades,
            "lat":          lat,
            "lon":          lon,
            "area_m2":      area_m2,
            "habitaciones": habitaciones,
            "banos":        banos,
        })
        updated = cur.rowcount > 0
    conn.commit()
    return updated
