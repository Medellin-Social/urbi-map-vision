"""
Carga el puntaje promedio Saber 11 (ICFES) por municipio del Valle de Aburrá
en raw.icfes_municipio, vía Socrata (datos.gov.co, sin token — API pública).

Dataset: "Resultados únicos Saber 11" (kgxf-xxbe), resultados por estudiante
histórico. Se agrega a nivel MUNICIPIO (no hay comuna en el dataset ni
lat/lon por colegio confiable para matchear contra raw.pois tipo=colegio,
así que NO se intenta geocodificar por colegio — sería un match ficticio).
Broadcast a barrio se hace por municipio, igual que
analytics.barrios_seguridad para los municipios satélite.

Uso:
  python scripts/load_icfes_municipio.py
  python scripts/load_icfes_municipio.py --dry-run
"""

import argparse
import os
from pathlib import Path

import psycopg2
import psycopg2.extras
import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

DB_URL = os.environ["DATABASE_URL"]

SOCRATA_URL = "https://www.datos.gov.co/resource/kgxf-xxbe.json"
MUNICIPIOS = [
    "MEDELLIN", "BELLO", "ITAGUI", "ENVIGADO", "SABANETA",
    "LA ESTRELLA", "CALDAS", "COPACABANA", "GIRARDOTA", "BARBOSA",
]

DDL = """
CREATE TABLE IF NOT EXISTS raw.icfes_municipio (
    municipio         text PRIMARY KEY,
    avg_punt_global    numeric(6,2),
    n_estudiantes      integer,
    cargado_en         timestamptz NOT NULL DEFAULT now()
);
"""

UPSERT_SQL = """
INSERT INTO raw.icfes_municipio (municipio, avg_punt_global, n_estudiantes)
VALUES (%(municipio)s, %(avg_punt_global)s, %(n_estudiantes)s)
ON CONFLICT (municipio) DO UPDATE SET
    avg_punt_global = EXCLUDED.avg_punt_global,
    n_estudiantes   = EXCLUDED.n_estudiantes,
    cargado_en      = now()
"""


def fetch() -> list[dict]:
    mun_list = ",".join(f"'{m}'" for m in MUNICIPIOS)
    where = f"cole_depto_ubicacion='ANTIOQUIA' AND cole_mcpio_ubicacion in({mun_list})"
    params = {
        "$select": "cole_mcpio_ubicacion,avg(punt_global::number) as avg_punt_global,count(*) as n",
        "$where": where,
        "$group": "cole_mcpio_ubicacion",
    }
    resp = requests.get(SOCRATA_URL, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    print("Consultando Socrata (datos.gov.co) — Resultados únicos Saber 11...")
    data = fetch()
    rows = [
        {
            "municipio": r["cole_mcpio_ubicacion"],
            "avg_punt_global": round(float(r["avg_punt_global"]), 2),
            "n_estudiantes": int(r["n"]),
        }
        for r in data
    ]
    rows.sort(key=lambda r: -r["avg_punt_global"])
    for r in rows:
        print(f"  {r['municipio']:<15} avg_punt_global={r['avg_punt_global']:<8} n={r['n_estudiantes']}")

    if args.dry_run:
        print("[dry-run] Sin escritura a DB.")
        return

    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    cur.execute(DDL)
    conn.commit()
    psycopg2.extras.execute_batch(cur, UPSERT_SQL, rows)
    conn.commit()
    print(f"Upsert completado: {len(rows)} municipios.")
    conn.close()


if __name__ == "__main__":
    main()
