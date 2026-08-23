"""Shared config for eventos scrapers."""
import os
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

_ROOT = Path(__file__).parent.parent.parent
load_dotenv(_ROOT / ".env.local")
load_dotenv(_ROOT / ".env")

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://social:urbidata007@localhost:5433/social",
)

MEETUP_TOKEN = os.getenv("MEETUP_TOKEN", "")

LAT_MEDELLIN = 6.2442
LON_MEDELLIN = -75.5812

BARRIOS_COMUNIDAD = [
    {"nombre": "El Poblado", "lat": 6.2086, "lon": -75.5659},
    {"nombre": "Laureles",   "lat": 6.2518, "lon": -75.5900},
    {"nombre": "Envigado",   "lat": 6.1752, "lon": -75.5874},
    {"nombre": "El Centro",  "lat": 6.2518, "lon": -75.5636},
    {"nombre": "Sabaneta",   "lat": 6.1514, "lon": -75.6167},
]


def get_conn():
    return psycopg2.connect(DATABASE_URL)


def asignar_barrio(cur, lat, lon) -> int | None:
    if lat is None or lon is None:
        return None
    cur.execute("""
        SELECT id FROM raw.barrios
        WHERE ST_Within(
            ST_SetSRID(ST_MakePoint(%s, %s), 4326),
            geometry
        )
        LIMIT 1
    """, (lon, lat))
    row = cur.fetchone()
    if row:
        return row[0]
    # Nearest-neighbor fallback: closest barrio within 500m
    cur.execute("""
        SELECT id FROM raw.barrios
        WHERE ST_DWithin(
            geometry::geography,
            ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography,
            500
        )
        ORDER BY geometry <-> ST_SetSRID(ST_MakePoint(%s, %s), 4326)
        LIMIT 1
    """, (lon, lat, lon, lat))
    row = cur.fetchone()
    return row[0] if row else None
