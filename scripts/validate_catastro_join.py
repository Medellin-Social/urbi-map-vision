"""
Validate that raw.barrios.comuna → raw.catastro_medellin.ds_comuna join has 100% coverage.

Run after importing new barrio geometries or catastro data:
  python scripts/validate_catastro_join.py

Exits with code 1 if any Medellín barrios have no catastro match.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

DB_URL = os.environ["DATABASE_URL"]


def main() -> None:
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute("""
        SELECT DISTINCT b.municipio, b.comuna
        FROM raw.barrios b
        WHERE UPPER(b.municipio) = 'MEDELLIN'
          AND NOT EXISTS (
              SELECT 1 FROM raw.catastro_medellin c
              WHERE UPPER(TRIM(c.ds_comuna)) = UPPER(TRIM(b.comuna))
          )
        ORDER BY b.comuna
    """)
    unmatched = cur.fetchall()

    cur.execute("""
        SELECT ds_comuna FROM raw.catastro_medellin
        WHERE NOT EXISTS (
            SELECT 1 FROM raw.barrios b
            WHERE UPPER(b.municipio) = 'MEDELLIN'
              AND UPPER(TRIM(b.comuna)) = UPPER(TRIM(raw.catastro_medellin.ds_comuna))
        )
        GROUP BY ds_comuna ORDER BY ds_comuna
    """)
    orphan_catastro = cur.fetchall()
    conn.close()

    ok = True
    if unmatched:
        ok = False
        print("FAIL — Medellín barrios with no catastro match:")
        for row in unmatched:
            print(f"  comuna='{row['comuna']}'")
        print(f"\nFix: add matching entry in raw.catastro_medellin OR normalize barrio.comuna name.")
    else:
        print("OK — all Medellín barrios have catastro match.")

    if orphan_catastro:
        print("\nWARN — catastro comunas with no barrio match (may be corregimientos):")
        for row in orphan_catastro:
            print(f"  ds_comuna='{row['ds_comuna']}'")

    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
