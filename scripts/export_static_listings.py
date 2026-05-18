"""
Exporta listings de metrocuadrado/fincaraiz a archivos JSON estáticos por municipio.
Incluye URL para el botón "Ver →" en el panel.

Uso:
    python scripts/export_static_listings.py
    python scripts/export_static_listings.py --municipio envigado
"""

import argparse
import json
import os
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

DB_URL = os.getenv("DATABASE_URL", "postgresql://urbidata:urbidata007@localhost:5433/urbidata")
OUTPUT_DIR = Path(__file__).parent.parent / "public" / "data"

MUNICIPIOS = {
    "bello":       "BELLO",
    "envigado":    "ENVIGADO",
    "itagui":      "ITAGUI",
    "sabaneta":    "SABANETA",
    "la_estrella": "LA ESTRELLA",
}

QUERY = """
SELECT
    l.id,
    l.tipo_operacion,
    l.precio                        AS precio_cop,
    l.area_m2,
    CASE WHEN l.area_m2 > 0 THEN ROUND(l.precio / l.area_m2) ELSE NULL END AS precio_m2,
    l.estrato,
    l.lat,
    l.lon                           AS lng,
    UPPER(b.nombre)                 AS barrio,
    l.url,
    l.habitaciones,
    l.banos,
    l.direccion_raw,
    l.fuente,
    l.fecha_scraping
FROM raw.listings_metrocuadrado l
JOIN raw.barrios b ON b.id = l.barrio_id
WHERE upper(b.municipio) = %s
  AND l.activo = TRUE
  AND l.precio > 0
  AND l.area_m2 > 0

UNION ALL

SELECT
    l.id,
    l.tipo_operacion,
    l.precio                        AS precio_cop,
    l.area_m2,
    CASE WHEN l.area_m2 > 0 THEN ROUND(l.precio / l.area_m2) ELSE NULL END AS precio_m2,
    NULL::integer                   AS estrato,
    NULL::double precision          AS lat,
    NULL::double precision          AS lng,
    UPPER(b.nombre)                 AS barrio,
    l.url,
    l.habitaciones,
    l.banos,
    l.direccion_raw,
    l.fuente,
    l.fecha_scraping
FROM raw.listings_fincaraiz l
JOIN raw.barrios b ON b.id = l.barrio_id
WHERE upper(b.municipio) = %s
  AND l.activo = TRUE
  AND l.precio > 0
  AND l.area_m2 > 0

ORDER BY fecha_scraping DESC
"""


def export_municipio(cur, slug: str, municipio_upper: str) -> int:
    cur.execute(QUERY, (municipio_upper, municipio_upper))
    rows = [dict(r) for r in cur.fetchall()]

    # Convert Decimal to float; drop internal-only fields
    for r in rows:
        for k in ("precio_cop", "area_m2", "precio_m2", "lat", "lng"):
            if r[k] is not None:
                r[k] = float(r[k])
        r.pop("fecha_scraping", None)

    out = OUTPUT_DIR / f"listings_{slug}.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, separators=(",", ":"))

    return len(rows)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--municipio", help="Solo exportar este slug (ej: envigado)")
    args = parser.parse_args()

    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    targets = {args.municipio: MUNICIPIOS[args.municipio]} if args.municipio else MUNICIPIOS

    for slug, upper in targets.items():
        n = export_municipio(cur, slug, upper)
        size_kb = (OUTPUT_DIR / f"listings_{slug}.json").stat().st_size // 1024
        print(f"  {slug}: {n} listings → {size_kb} KB")

    conn.close()
    print("✓ Listo")


if __name__ == "__main__":
    main()
