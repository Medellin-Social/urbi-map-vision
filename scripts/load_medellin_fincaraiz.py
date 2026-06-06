"""
Load Medellín fincaraiz JSON files → raw.listings_fincaraiz.

Reads all data/raw/medellin_*_*.json files produced by scrape_fincaraiz.py
and upserts into raw.listings_fincaraiz with barrio_id resolved via PostGIS.

Run:
  python scripts/load_medellin_fincaraiz.py
  python scripts/load_medellin_fincaraiz.py --dry-run
  python scripts/load_medellin_fincaraiz.py --tipo-inmueble apartaestudio
"""

import argparse
import json
import os
from pathlib import Path

import psycopg2
import psycopg2.extras

DB_URL = os.environ.get("DATABASE_URL", "postgresql://urbidata:urbidata007@localhost:5433/urbidata")
RAW_DIR = Path(__file__).parent / "data" / "raw"

SLUG = "medellin"
TIPOS = [
    "apartamento", "apartaestudio", "casa", "local",
    "oficina", "bodega", "consultorio", "lote", "casa_lote", "finca",
]
OPERACIONES = ["venta", "arriendo"]

UPSERT_SQL = """
INSERT INTO raw.listings_fincaraiz
    (fuente, tipo_operacion, tipo_inmueble, precio, area_m2,
     habitaciones, banos, direccion_raw, barrio_id, url,
     barrio_raw, municipio_raw, raw_data, activo,
     lat, lon, estrato_real, descripcion, amenidades, fecha_scraping)
VALUES
    ('fincaraiz',%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,true,%s,%s,%s,%s,%s,NOW())
ON CONFLICT (url) DO UPDATE SET
    descripcion    = EXCLUDED.descripcion,
    amenidades     = EXCLUDED.amenidades,
    precio         = EXCLUDED.precio,
    area_m2        = EXCLUDED.area_m2,
    habitaciones   = EXCLUDED.habitaciones,
    banos          = EXCLUDED.banos,
    tipo_inmueble  = EXCLUDED.tipo_inmueble,
    raw_data       = EXCLUDED.raw_data,
    fecha_scraping = EXCLUDED.fecha_scraping
WHERE
    EXCLUDED.descripcion IS NOT NULL
    OR EXCLUDED.amenidades IS NOT NULL
    OR listings_fincaraiz.descripcion IS NULL
"""

BARRIO_SQL = """
SELECT id FROM raw.barrios
WHERE ST_Contains(
    geometry,
    ST_SetSRID(ST_Point(%s, %s), 4326)
)
AND municipio ILIKE 'medell%%'
LIMIT 1
"""

BARRIO_NEAREST_SQL = """
SELECT id FROM raw.barrios
WHERE municipio ILIKE 'medell%%'
ORDER BY ST_Distance(geometry, ST_SetSRID(ST_Point(%s, %s), 4326))
LIMIT 1
"""


def resolve_barrio(cur, lon: float, lat: float) -> int | None:
    cur.execute(BARRIO_SQL, (lon, lat))
    row = cur.fetchone()
    if row:
        return row["id"]
    cur.execute(BARRIO_NEAREST_SQL, (lon, lat))
    row = cur.fetchone()
    return row["id"] if row else None


def load_file(cur, json_path: Path, dry_run: bool) -> tuple[int, int]:
    listings = json.load(open(json_path))
    inserted = skipped = 0

    for lst in listings:
        if not lst:
            continue

        lat = lst.get("lat")
        lng = lst.get("lng")
        listing_id = lst.get("id")
        precio = lst.get("precio") or 0
        url = lst.get("url")

        if not url or not listing_id or not precio:
            skipped += 1
            continue

        barrio_id = None
        if lat and lng:
            barrio_id = resolve_barrio(cur, float(lng), float(lat))

        amenidades_list = lst.get("amenidades") or []
        raw_data_json = json.dumps({
            "id": listing_id,
            "descripcion": lst.get("descripcion"),
            "amenidades": amenidades_list,
        })

        if not dry_run:
            cur.execute(UPSERT_SQL, (
                lst.get("tipo"),                        # tipo_operacion
                lst.get("tipo_inmueble", "apartamento"),
                precio,
                lst.get("area") or None,
                lst.get("habitaciones"),
                lst.get("banos"),
                lst.get("direccion"),
                barrio_id,
                url,
                (lst.get("barrio") or "").upper(),
                (lst.get("municipio") or "MEDELLIN").upper(),
                raw_data_json,
                float(lng) if lng else None,
                float(lat) if lat else None,
                lst.get("estrato") or None,
                lst.get("descripcion"),
                amenidades_list if amenidades_list else None,
            ))
        inserted += 1

    return inserted, skipped


def main():
    parser = argparse.ArgumentParser(description="Load Medellín fincaraiz JSONs → raw.listings_fincaraiz")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--tipo-inmueble", choices=TIPOS, help="Only load this tipo")
    parser.add_argument("--operacion", choices=OPERACIONES, help="Only load this operacion")
    args = parser.parse_args()

    tipos = [args.tipo_inmueble] if args.tipo_inmueble else TIPOS
    operaciones = [args.operacion] if args.operacion else OPERACIONES

    conn = psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    conn.autocommit = False
    cur = conn.cursor()

    total_inserted = total_skipped = 0

    for tipo in tipos:
        for op in operaciones:
            json_path = RAW_DIR / f"{SLUG}_{tipo}_{op}.json"
            if not json_path.exists():
                print(f"  SKIP (no file): {json_path.name}")
                continue

            inserted, skipped = load_file(cur, json_path, args.dry_run)
            total_inserted += inserted
            total_skipped += skipped
            print(f"  {tipo:20} {op:8} → {inserted} upserted, {skipped} skipped")

    if not args.dry_run:
        conn.commit()
        print(f"\n✓ Committed. Total: {total_inserted} upserted, {total_skipped} skipped")
    else:
        conn.rollback()
        print(f"\n[dry-run] Would upsert {total_inserted}, skip {total_skipped}")

    conn.close()


if __name__ == "__main__":
    main()
