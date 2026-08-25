"""
Descarga datos de criminalidad por comunas (Medellín) desde medata.gov.co
y los carga en raw.criminalidad (geo_nivel='comuna', periodo_tipo='anual'|'mensual')
— antes raw.criminalidad_comunas + raw.criminalidad_comunas_mes, fusionadas
2026-08-23 junto con raw.criminalidad_municipios en una sola tabla.

Fuentes reales (federated_href en datos.gov.co → archivos en medata.gov.co):
  - wtnd-h3vi: criminalidad por año y comuna
  - gcyu-chif: criminalidad por año-mes y comuna

Los IDs fnd7-qt77 (hurtos geográfico) están muertos; los hurtos ya están
incluidos en las conductas del dataset de criminalidad (Hurto a persona,
Hurto a residencia, Hurto de carro, Hurto de moto, Hurto de semoviente).

Uso:
    python scripts/load_seguridad.py
    python scripts/load_seguridad.py --dry-run
"""

import argparse
import csv
import io
import logging
import os
import sys
from pathlib import Path

import psycopg2
import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# URLs (resueltas vía datos.gov.co → medata.gov.co)
# ---------------------------------------------------------------------------
URL_ANUAL = (
    "https://medata.gov.co/sites/default/files/distribution"
    "/1-027-23-000303/consolidado_cantidad_casos_criminalidad_en_comunas_por_anio.csv"
)
URL_MENSUAL = (
    "https://medata.gov.co/sites/default/files/distribution"
    "/1-027-23-000304/consolidado_cantidad_casos_criminalidad_en_comunas_por_anio_mes.csv"
)

DB_URL = os.getenv("DATABASE_URL")
if not DB_URL:
    DB_URL = (
        f"postgresql://{os.getenv('POSTGRES_USER')}:{os.getenv('POSTGRES_PASSWORD')}"
        f"@{os.getenv('POSTGRES_HOST', 'localhost')}:{os.getenv('POSTGRES_PORT', '5432')}"
        f"/{os.getenv('POSTGRES_DB')}"
    )

# ---------------------------------------------------------------------------
# DDL — la tabla raw.criminalidad ya existe (fusión 2026-08-23); solo índices.
# ---------------------------------------------------------------------------
DDL_ANUAL = """
CREATE INDEX IF NOT EXISTS idx_criminalidad_geo ON raw.criminalidad (geo_nivel, geo_codigo);
CREATE INDEX IF NOT EXISTS idx_criminalidad_periodo ON raw.criminalidad (periodo_tipo, anio, mes);
"""

DDL_MENSUAL = ""  # índices ya cubiertos por DDL_ANUAL, mismo par de índices sirve a ambos periodos

# parse_anual da tuplas (anio, conducta, codigo, cantidad) — mismo orden abajo
INSERT_ANUAL = """
INSERT INTO raw.criminalidad
    (anio, conducta, geo_codigo, cantidad_casos, geo_nivel, periodo_tipo)
VALUES (%s, %s, %s, %s, 'comuna', 'anual')
"""

# parse_mensual da tuplas (anio, mes, conducta, codigo, cantidad) — mismo orden abajo
INSERT_MENSUAL = """
INSERT INTO raw.criminalidad
    (anio, mes, conducta, geo_codigo, cantidad_casos, geo_nivel, periodo_tipo)
VALUES (%s, %s, %s, %s, %s, 'comuna', 'mensual')
"""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def fetch_csv(url: str) -> list[dict]:
    log.info("Descargando %s", url)
    r = requests.get(url, timeout=60)
    r.raise_for_status()
    r.encoding = r.apparent_encoding or "utf-8"
    reader = csv.DictReader(io.StringIO(r.text))
    rows = list(reader)
    log.info("  %d filas descargadas", len(rows))
    return rows


def parse_anual(rows: list[dict]) -> list[tuple]:
    """Columnas: Fecha_hecho, Conducta, Codigo_comuna, Cantidad_casos"""
    records = []
    skipped = 0
    for row in rows:
        try:
            anio = int(row["Fecha_hecho"])
            conducta = row["Conducta"].strip()
            codigo = row["Codigo_comuna"].strip()
            cantidad = int(row["Cantidad_casos"])
            records.append((anio, conducta, codigo, cantidad))
        except (ValueError, KeyError):
            skipped += 1
    if skipped:
        log.warning("  %d filas ignoradas (parse error)", skipped)
    return records


def parse_mensual(rows: list[dict]) -> list[tuple]:
    """Columnas: Fecha_hecho (YYYY-MM), Conducta, Codigo_comuna, Cantidad_casos"""
    records = []
    skipped = 0
    for row in rows:
        try:
            fecha = row["Fecha_hecho"].strip()
            anio, mes = int(fecha[:4]), int(fecha[5:7])
            conducta = row["Conducta"].strip()
            codigo = row["Codigo_comuna"].strip()
            cantidad = int(row["Cantidad_casos"])
            records.append((anio, mes, conducta, codigo, cantidad))
        except (ValueError, KeyError, IndexError):
            skipped += 1
    if skipped:
        log.warning("  %d filas ignoradas (parse error)", skipped)
    return records


def load_table(conn, ddl: str, truncate_sql: str, insert_sql: str, records: list[tuple]):
    with conn.cursor() as cur:
        if ddl.strip():
            cur.execute(ddl)
        cur.execute(truncate_sql)
        log.info("  Tabla vaciada. Insertando %d filas...", len(records))
        cur.executemany(insert_sql, records)
    conn.commit()
    log.info("  Commit OK")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main(dry_run: bool = False):
    rows_anual = fetch_csv(URL_ANUAL)
    rows_mensual = fetch_csv(URL_MENSUAL)

    records_anual = parse_anual(rows_anual)
    records_mensual = parse_mensual(rows_mensual)

    log.info("Criminalidad anual:   %d registros válidos", len(records_anual))
    log.info("Criminalidad mensual: %d registros válidos", len(records_mensual))

    if dry_run:
        log.info("--dry-run: sin escritura a DB")
        return

    conn = psycopg2.connect(DB_URL)
    try:
        log.info("Cargando raw.criminalidad (geo_nivel=comuna, periodo_tipo=anual)...")
        load_table(
            conn,
            DDL_ANUAL,
            "DELETE FROM raw.criminalidad WHERE geo_nivel = 'comuna' AND periodo_tipo = 'anual'",
            INSERT_ANUAL,
            records_anual,
        )
        log.info("Cargando raw.criminalidad (geo_nivel=comuna, periodo_tipo=mensual)...")
        load_table(
            conn,
            DDL_MENSUAL,
            "DELETE FROM raw.criminalidad WHERE geo_nivel = 'comuna' AND periodo_tipo = 'mensual'",
            INSERT_MENSUAL,
            records_mensual,
        )
    finally:
        conn.close()

    log.info("Listo.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    main(dry_run=args.dry_run)
