"""
Descarga el parquet trimestral de Ookla Speedtest Open Data (broadband fijo,
sin token — bucket público S3) y carga los tiles del Valle de Aburrá en
raw.internet_speed_tiles (upsert por quadkey/tile_x/tile_y).

Fuente: https://github.com/teamookla/ookla-open-data (dominio público, sin auth).
Resolución: tiles ~610m (zoom 16 Bing tile system). El archivo mundial pesa
~350MB — se descarga a un temp, se filtra al bbox del Valle de Aburrá en
streaming por row-group (no se carga el mundo entero en memoria) y se borra.

Uso:
  python scripts/load_internet_speed.py
  python scripts/load_internet_speed.py --year 2026 --quarter 2
  python scripts/load_internet_speed.py --dry-run
"""

import argparse
import os
import tempfile
from datetime import date
from pathlib import Path

import psycopg2
import psycopg2.extras
import pyarrow.parquet as pq
import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://social:urbidata007@localhost:5433/social",
)

# Bounding box del Valle de Aburrá (lat_min, lon_min, lat_max, lon_max) —
# mismo bbox que scripts/load_pois_overpass.py
LAT_MIN, LON_MIN, LAT_MAX, LON_MAX = 5.95, -75.76, 6.52, -75.43

S3_BASE = "https://ookla-open-data.s3.amazonaws.com/parquet/performance/type=fixed"


def _latest_quarter() -> tuple[int, int]:
    """Ookla publica con ~2 meses de rezago; usa el trimestre anterior al actual."""
    today = date.today()
    q = (today.month - 1) // 3 + 1
    q -= 1
    year = today.year
    if q == 0:
        q, year = 4, year - 1
    return year, q


def download_and_filter(year: int, quarter: int) -> list[dict]:
    url = f"{S3_BASE}/year={year}/quarter={quarter}/{year}-{(quarter-1)*3+1:02d}-01_performance_fixed_tiles.parquet"
    print(f"Descargando {url} ...")

    with tempfile.NamedTemporaryFile(suffix=".parquet", delete=False) as tmp:
        tmp_path = tmp.name
        with requests.get(url, stream=True, timeout=120) as resp:
            resp.raise_for_status()
            for chunk in resp.iter_content(chunk_size=1024 * 1024):
                tmp.write(chunk)

    print("Filtrando al bbox del Valle de Aburrá por row-group (streaming)...")
    rows: list[dict] = []
    try:
        pf = pq.ParquetFile(tmp_path)
        cols = ["tile_x", "tile_y", "avg_d_kbps", "avg_u_kbps", "avg_lat_ms", "tests", "devices"]
        for batch in pf.iter_batches(batch_size=200_000, columns=cols):
            df = batch.to_pandas()
            m = (
                (df.tile_x >= LON_MIN) & (df.tile_x <= LON_MAX)
                & (df.tile_y >= LAT_MIN) & (df.tile_y <= LAT_MAX)
            )
            if m.any():
                rows.extend(df[m].to_dict("records"))
    finally:
        os.unlink(tmp_path)

    print(f"  → {len(rows)} tiles en el Valle de Aburrá")
    return rows


DDL = """
CREATE TABLE IF NOT EXISTS raw.internet_speed_tiles (
    id           serial PRIMARY KEY,
    tile_x       double precision NOT NULL,
    tile_y       double precision NOT NULL,
    avg_d_kbps   integer,
    avg_u_kbps   integer,
    avg_lat_ms   integer,
    tests        integer,
    devices      integer,
    anio         int NOT NULL,
    trimestre    int NOT NULL,
    geometry     geometry(Point, 4326),
    cargado_en   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tile_x, tile_y, anio, trimestre)
);
CREATE INDEX IF NOT EXISTS idx_internet_speed_tiles_geom
    ON raw.internet_speed_tiles USING GIST(geometry);
"""

UPSERT_SQL = """
INSERT INTO raw.internet_speed_tiles
    (tile_x, tile_y, avg_d_kbps, avg_u_kbps, avg_lat_ms, tests, devices, anio, trimestre, geometry)
VALUES (
    %(tile_x)s, %(tile_y)s, %(avg_d_kbps)s, %(avg_u_kbps)s, %(avg_lat_ms)s,
    %(tests)s, %(devices)s, %(anio)s, %(trimestre)s,
    ST_SetSRID(ST_MakePoint(%(tile_x)s, %(tile_y)s), 4326)
)
ON CONFLICT (tile_x, tile_y, anio, trimestre) DO UPDATE SET
    avg_d_kbps = EXCLUDED.avg_d_kbps,
    avg_u_kbps = EXCLUDED.avg_u_kbps,
    avg_lat_ms = EXCLUDED.avg_lat_ms,
    tests      = EXCLUDED.tests,
    devices    = EXCLUDED.devices
"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int)
    parser.add_argument("--quarter", type=int)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    year, quarter = (args.year, args.quarter) if args.year and args.quarter else _latest_quarter()
    print(f"Trimestre: {year}-Q{quarter}")

    rows = download_and_filter(year, quarter)
    for r in rows:
        r["anio"] = year
        r["trimestre"] = quarter

    if args.dry_run:
        avg_mbps = sum(r["avg_d_kbps"] for r in rows if r["avg_d_kbps"]) / 1000 / max(1, len(rows))
        print(f"[dry-run] {len(rows)} tiles, avg descarga ≈ {avg_mbps:.1f} Mbps. Sin escritura a DB.")
        return

    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    cur.execute(DDL)
    conn.commit()

    psycopg2.extras.execute_batch(cur, UPSERT_SQL, rows, page_size=500)
    conn.commit()
    print(f"Upsert completado: {len(rows)} tiles.")
    conn.close()


if __name__ == "__main__":
    main()
