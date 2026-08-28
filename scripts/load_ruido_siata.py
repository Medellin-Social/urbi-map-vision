"""
Carga la red de monitoreo de ruido de SIATA en raw.ruido_estaciones — dos
endpoints JSON internos del geoportal (geoportal.siata.gov.co), sin token,
no documentados en el catálogo de "datos abiertos" (se encontraron
inspeccionando las URLs literales dentro del bundle JS del visor:
/assets/index-*.js). No cambiar de fuente sin re-verificar el bundle, estas
URLs pueden romperse en un rebuild del frontend de SIATA.

Dos redes:
  - 'oficial'   → 8 estaciones fijas, promedio 7 días (día/noche)
  - 'ciudadano' → ~373 sensores de bajo costo, promedio 24h (día/noche).
    Sentinel -999 = sensor offline/sin lectura, se descarta.

Uso:
  python scripts/load_ruido_siata.py
  python scripts/load_ruido_siata.py --dry-run
"""

import argparse
import os
from pathlib import Path

import psycopg2
import psycopg2.extras
import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://social:urbidata007@localhost:5433/social",
)

BASE = "https://geoportal.siata.gov.co/fastgeoapi/geodata/geodataJson/1"
URL_OFICIAL = f"{BASE}/ruido_oficial"
URL_CIUDADANO = f"{BASE}/ccr"

DDL = """
CREATE TABLE IF NOT EXISTS raw.ruido_estaciones (
    id            serial PRIMARY KEY,
    codigo        integer NOT NULL,
    red           text NOT NULL,     -- 'oficial' | 'ciudadano'
    nombre        text,
    municipio     text,
    db_prom_dia   numeric(5,1),
    db_prom_noche numeric(5,1),
    ventana       text,              -- '7d' | '24h'
    fecha_inicio  text,
    fecha_fin     text,
    geometry      geometry(Point, 4326),
    cargado_en    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (codigo, red)
);
CREATE INDEX IF NOT EXISTS idx_ruido_estaciones_geom
    ON raw.ruido_estaciones USING GIST(geometry);
"""

UPSERT_SQL = """
INSERT INTO raw.ruido_estaciones
    (codigo, red, nombre, municipio, db_prom_dia, db_prom_noche, ventana,
     fecha_inicio, fecha_fin, geometry)
VALUES (
    %(codigo)s, %(red)s, %(nombre)s, %(municipio)s, %(db_prom_dia)s, %(db_prom_noche)s,
    %(ventana)s, %(fecha_inicio)s, %(fecha_fin)s,
    ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326)
)
ON CONFLICT (codigo, red) DO UPDATE SET
    nombre        = EXCLUDED.nombre,
    municipio     = EXCLUDED.municipio,
    db_prom_dia   = EXCLUDED.db_prom_dia,
    db_prom_noche = EXCLUDED.db_prom_noche,
    fecha_inicio  = EXCLUDED.fecha_inicio,
    fecha_fin     = EXCLUDED.fecha_fin,
    geometry      = EXCLUDED.geometry
"""


def fetch_oficial() -> list[dict]:
    resp = requests.get(URL_OFICIAL, timeout=30)
    resp.raise_for_status()
    rows = []
    for f in resp.json()["features"]:
        p = f["properties"]
        lon, lat = f["geometry"]["coordinates"]
        rows.append({
            "codigo": p["codigo"], "red": "oficial",
            "nombre": p.get("nombreLargo") or p.get("nombreEstacion"),
            "municipio": p.get("Municipio"),
            "db_prom_dia": p.get("Datos_Ruido_7D_prom_dia"),
            "db_prom_noche": p.get("Datos_Ruido_7D_prom_noche"),
            "ventana": "7d",
            "fecha_inicio": p.get("fechaInicio"), "fecha_fin": p.get("fechaFin"),
            "lon": lon, "lat": lat,
        })
    return rows


def fetch_ciudadano() -> list[dict]:
    resp = requests.get(URL_CIUDADANO, timeout=30)
    resp.raise_for_status()
    rows = []
    for f in resp.json()["features"]:
        p = f["properties"]
        d = p.get("Datos_Ruido_Ciudadanos_D")
        n = p.get("Datos_Ruido_Ciudadanos_N")
        if d == -999.0 or n == -999.0 or d is None or n is None:
            continue  # sensor offline / sin lectura
        lon, lat = f["geometry"]["coordinates"]
        rows.append({
            "codigo": p["codigo"], "red": "ciudadano",
            "nombre": f"Sensor ciudadano {p['codigo']}",
            "municipio": None,
            "db_prom_dia": d, "db_prom_noche": n,
            "ventana": "24h",
            "fecha_inicio": p.get("fechaInicio"), "fecha_fin": p.get("fechaFin"),
            "lon": lon, "lat": lat,
        })
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    print("Consultando red oficial (8 estaciones)...")
    oficial = fetch_oficial()
    print(f"  → {len(oficial)} estaciones")

    print("Consultando red ciudadana (sensores bajo costo)...")
    ciudadano = fetch_ciudadano()
    print(f"  → {len(ciudadano)} sensores con lectura válida (de ~373 totales)")

    rows = oficial + ciudadano

    if args.dry_run:
        avg_dia = sum(r["db_prom_dia"] for r in rows) / len(rows)
        print(f"[dry-run] {len(rows)} estaciones/sensores, dB promedio día ≈ {avg_dia:.1f}. Sin escritura a DB.")
        return

    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    cur.execute(DDL)
    conn.commit()
    psycopg2.extras.execute_batch(cur, UPSERT_SQL, rows)
    conn.commit()
    print(f"Upsert completado: {len(rows)} estaciones/sensores.")
    conn.close()


if __name__ == "__main__":
    main()
