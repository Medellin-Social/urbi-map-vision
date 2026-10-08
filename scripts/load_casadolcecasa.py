"""
Load scraped Casa Dolce Casa listings into raw.listings_casadolcecasa.

Reads the latest data/raw/casadolcecasa_*.json (produced by
scrape_casadolcecasa.py), parses the labeled fields into the same shape as
raw.listings_fincaraiz, resolves barrio_id via PostGIS, and upserts.

The table is created if missing (mirrors the columns cache.py needs).

Run:
  python scripts/load_casadolcecasa.py [--dry-run]
"""

import argparse
import json
import os
import re
from datetime import datetime, timezone
from hashlib import md5
from pathlib import Path

import psycopg2
import psycopg2.extras

DB_URL = os.environ["DATABASE_URL"]
RAW_DIR = Path(__file__).parent / "data" / "raw"

DDL = """
CREATE TABLE IF NOT EXISTS raw.listings_casadolcecasa (
    id              bigint PRIMARY KEY,          -- Directorist listing id
    codigo          text,
    fuente          text DEFAULT 'casadolcecasa',
    tipo_operacion  text,
    tipo_inmueble   text,
    precio          numeric,
    area_m2         numeric,
    habitaciones    integer,
    banos           integer,
    parqueaderos    smallint,
    piso            smallint,
    estrato_real    integer,
    antiguedad      text,
    direccion_raw   text,
    barrio_raw      text,
    municipio_raw   text,
    lat             numeric,
    lon             numeric,
    geom            geometry(Point, 4326),
    barrio_id       integer,
    amenidades      text[],
    fotos           text[],
    descripcion     text,
    url             text,
    dedup_hash      varchar,
    activo          boolean DEFAULT true,
    raw_data        jsonb,
    fecha_scraping  timestamptz DEFAULT now()
);
"""

BARRIO_SQL = """
SELECT id FROM raw.barrios
WHERE ST_Contains(geometry, ST_SetSRID(ST_Point(%s, %s), 4326))
LIMIT 1
"""
BARRIO_NEAREST_SQL = """
SELECT id FROM raw.barrios
ORDER BY geometry <-> ST_SetSRID(ST_Point(%s, %s), 4326)
LIMIT 1
"""

UPSERT = """
INSERT INTO raw.listings_casadolcecasa
    (id, codigo, fuente, tipo_operacion, tipo_inmueble, precio, area_m2,
     habitaciones, banos, parqueaderos, piso, estrato_real, antiguedad,
     direccion_raw, barrio_raw, municipio_raw, lat, lon, geom, barrio_id,
     amenidades, fotos, descripcion, url, dedup_hash, activo, raw_data, fecha_scraping)
VALUES (%(id)s, %(codigo)s, 'casadolcecasa', %(tipo_operacion)s, %(tipo_inmueble)s,
     %(precio)s, %(area_m2)s, %(habitaciones)s, %(banos)s, %(parqueaderos)s, %(piso)s,
     %(estrato_real)s, %(antiguedad)s, %(direccion_raw)s, %(barrio_raw)s, %(municipio_raw)s,
     %(lat)s, %(lon)s,
     CASE WHEN %(lat)s IS NOT NULL AND %(lon)s IS NOT NULL
          THEN ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326) END,
     %(barrio_id)s, %(amenidades)s, %(fotos)s, %(descripcion)s, %(url)s,
     %(dedup_hash)s, true, %(raw_data)s, now())
ON CONFLICT (id) DO UPDATE SET
    precio        = EXCLUDED.precio,
    area_m2       = EXCLUDED.area_m2,
    barrio_id     = COALESCE(EXCLUDED.barrio_id, raw.listings_casadolcecasa.barrio_id),
    amenidades    = EXCLUDED.amenidades,
    fotos         = EXCLUDED.fotos,
    descripcion   = EXCLUDED.descripcion,
    raw_data      = EXCLUDED.raw_data,
    activo        = true,
    fecha_scraping = now()
"""


def to_int(v):
    """Pull first integer out of values like '3', '2 baños', ['1']."""
    if isinstance(v, list):
        v = v[0] if v else None
    if v is None or v == "":
        return None
    m = re.search(r"\d+", str(v))
    return int(m.group()) if m else None


def to_num(v):
    if v in (None, ""):
        return None
    try:
        return float(str(v).replace(",", ""))
    except ValueError:
        return None


def resolve_barrio(cur, lon, lat):
    if lon is None or lat is None:
        return None
    cur.execute(BARRIO_SQL, (lon, lat))
    r = cur.fetchone()
    if r:
        return r[0]
    cur.execute(BARRIO_NEAREST_SQL, (lon, lat))
    r = cur.fetchone()
    return r[0] if r else None


def build_amenidades(rec):
    out = []
    for key in ("amenidades", "seguridad", "cercanias"):
        val = rec.get(key)
        if val:
            out.extend(p.strip() for p in str(val).split("|") if p.strip())
    if str(rec.get("aire_acondicionado", "")).lower() in ("sì", "si", "sí", "yes"):
        out.append("Aire acondicionado")
    if str(rec.get("admite_mascotas", "")).lower() in ("sì", "si", "sí", "yes"):
        out.append("Acepta mascotas")
    return out or None


def transform(rec, cur):
    lat = to_num(rec.get("latitud"))
    lon = to_num(rec.get("longitud"))
    op = (rec.get("operacion") or "").strip().lower() or None
    return {
        "id": rec["id"],
        "codigo": rec.get("codigo"),
        "tipo_operacion": op,
        "tipo_inmueble": (rec.get("tipo") or "").strip().lower() or None,
        "precio": to_num(rec.get("precio")),
        "area_m2": to_num(rec.get("area_m2")),
        "habitaciones": to_int(rec.get("habitaciones")),
        "banos": to_int(rec.get("banos")),
        "parqueaderos": to_int(rec.get("garajes")),
        "piso": to_int(rec.get("piso")),
        "estrato_real": to_int(rec.get("estrato")),
        "antiguedad": rec.get("antiguedad"),
        "direccion_raw": (rec.get("direccion") or "").strip() or None,
        "barrio_raw": rec.get("zona_barrio"),
        "municipio_raw": rec.get("municipio"),
        "lat": lat,
        "lon": lon,
        "barrio_id": resolve_barrio(cur, lon, lat),
        "amenidades": build_amenidades(rec),
        "fotos": rec.get("fotos") or None,
        "descripcion": rec.get("descripcion"),
        "url": rec.get("url"),
        "dedup_hash": md5(f"casadolcecasa_{rec['id']}".encode()).hexdigest(),
        "raw_data": json.dumps(rec.get("fields_raw") or {}, ensure_ascii=False),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    files = sorted(RAW_DIR.glob("casadolcecasa_*.json"))
    if not files:
        raise SystemExit("No casadolcecasa_*.json found. Run scrape_casadolcecasa.py first.")
    src = files[-1]
    records = json.loads(src.read_text(encoding="utf-8"))
    print(f"Loading {len(records)} listings from {src.name}")

    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    cur.execute(DDL)

    rows = [transform(r, cur) for r in records]
    matched = sum(1 for r in rows if r["barrio_id"])
    print(f"  barrio_id resolved: {matched}/{len(rows)}")

    if args.dry_run:
        print("  dry-run, no writes")
        print("  sample:", {k: rows[0][k] for k in
              ("id", "tipo_operacion", "tipo_inmueble", "precio", "area_m2",
               "habitaciones", "banos", "estrato_real", "barrio_id")})
        conn.rollback()
        return

    psycopg2.extras.execute_batch(cur, UPSERT, rows, page_size=50)
    ids = [r["id"] for r in rows]
    cur.execute(
        "UPDATE raw.listings_casadolcecasa SET activo = false "
        "WHERE id != ALL(%s) AND activo = true",
        (ids,),
    )
    deactivated = cur.rowcount
    conn.commit()
    print(f"  upserted {len(rows)} rows into raw.listings_casadolcecasa")
    print(f"  deactivated {deactivated} listings no longer on site")


if __name__ == "__main__":
    main()
