"""
Casa Dolce Casa (casadolcecasa.com.co) scraper.

The site is WordPress + Directorist plugin, which exposes a public REST API:
  - GET /wp-json/directorist/v2/listings?per_page=N&page=M
    Returns each listing with a `fields` object holding all custom data.
  - x-wp-total / x-wp-totalpages headers give the count.

Custom fields are opaquely keyed (custom-select, custom-number, ...). The
CUSTOM_FIELD_MAP below was reverse-engineered by diffing the API `fields`
against the rendered property page labels (verified 2026-06-30). Raw keys are
kept too, so nothing is lost if a label guess is wrong.

Run:
  python scrape_casadolcecasa.py            # -> data/raw/casadolcecasa_YYYY-MM-DD.json + .csv
"""

import csv
import json
from datetime import date
from pathlib import Path

import requests

RAW_DIR = Path(__file__).parent / "data" / "raw"
RAW_DIR.mkdir(parents=True, exist_ok=True)

BASE = "https://casadolcecasa.com.co/wp-json/directorist/v2/listings"

# Directorist custom-field key -> human label (reverse-engineered from rendered page).
CUSTOM_FIELD_MAP = {
    "custom-number-2":   "codigo",
    "custom-select-4":   "operacion",          # Venta / Arriendo
    "custom-number":     "area_m2",
    "custom-select":     "habitaciones",
    "custom-select-2":   "banos",
    "custom-text":       "piso",
    "custom-number-3":   "estrato",
    "custom-select-3":   "antiguedad",
    "custom-select-6":   "estado",
    "custom-select-7":   "disponibilidad",
    "custom-text-2":     "zona_barrio",
    "custom-checkbox":   "amenidades",
    "custom-checkbox-2": "seguridad",
    "custom-checkbox-3": "cercanias",
    "custom-checkbox-4": "entrega_inmediata",
    "custom-checkbox-6": "conserjeria",
    "custom-checkbox-7": "estrato_checkbox",
    "custom-checkbox-8": "admite_mascotas",
    "custom-checkbox-11": "aire_acondicionado",
    "custom-checkbox-12": "jardin",
    "custom-checkbox-13": "garajes",
}

# Flat columns for the CSV (everything else still lives in the JSON).
CSV_COLS = [
    "id", "codigo", "nombre", "operacion", "tipo", "precio",
    "area_m2", "habitaciones", "banos", "piso", "estrato", "garajes",
    "antiguedad", "estado", "zona_barrio", "municipio", "direccion",
    "latitud", "longitud", "admite_mascotas", "aire_acondicionado",
    "amenidades", "seguridad", "cercanias", "n_fotos", "url",
]


def fetch_all():
    listings, page = [], 1
    while True:
        r = requests.get(BASE, params={"per_page": 100, "page": page}, timeout=60)
        r.raise_for_status()
        batch = r.json()
        if not batch:
            break
        listings.extend(batch)
        total_pages = int(r.headers.get("x-wp-totalpages", 1))
        print(f"  page {page}/{total_pages}: {len(batch)} listings")
        if page >= total_pages:
            break
        page += 1
    return listings


def join(v):
    """Directorist returns checkboxes as lists; flatten for CSV."""
    if isinstance(v, list):
        return " | ".join(str(x) for x in v)
    return v


def flatten(item):
    """Map raw `fields` to labeled keys, keep a clean record."""
    f = item.get("fields", {})
    labeled = {CUSTOM_FIELD_MAP.get(k, k): v for k, v in f.items()}
    cats = f.get("categories") or item.get("categories") or []
    locs = f.get("locations") or []
    imgs = f.get("listing_img") or f.get("images") or []
    return {
        "id": item.get("id"),
        "codigo": labeled.get("codigo"),
        "nombre": f.get("title") or item.get("slug"),
        "operacion": labeled.get("operacion"),
        "tipo": cats[0]["name"] if cats else None,
        "precio": f.get("price"),
        "area_m2": labeled.get("area_m2"),
        "habitaciones": labeled.get("habitaciones"),
        "banos": labeled.get("banos"),
        "piso": labeled.get("piso"),
        "estrato": labeled.get("estrato"),
        "garajes": join(labeled.get("garajes")),
        "antiguedad": labeled.get("antiguedad"),
        "estado": labeled.get("estado"),
        "zona_barrio": labeled.get("zona_barrio"),
        "municipio": locs[0]["name"] if locs else None,
        "direccion": (f.get("address") or "").strip(),
        "latitud": f.get("latitude"),
        "longitud": f.get("longitude"),
        "admite_mascotas": join(labeled.get("admite_mascotas")),
        "aire_acondicionado": join(labeled.get("aire_acondicionado")),
        "amenidades": join(labeled.get("amenidades")),
        "seguridad": join(labeled.get("seguridad")),
        "cercanias": join(labeled.get("cercanias")),
        "n_fotos": len(imgs),
        "fotos": [i.get("src") for i in imgs],
        "url": item.get("permalink"),
        "descripcion": f.get("description"),
        "fields_raw": f,  # keep everything, nothing lost
    }


def main():
    print("Fetching Casa Dolce Casa listings...")
    raw = fetch_all()
    records = [flatten(x) for x in raw]
    stamp = date.today().isoformat()

    json_path = RAW_DIR / f"casadolcecasa_{stamp}.json"
    json_path.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")

    csv_path = RAW_DIR / f"casadolcecasa_{stamp}.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=CSV_COLS, extrasaction="ignore")
        w.writeheader()
        w.writerows(records)

    print(f"\n{len(records)} listings -> {json_path}")
    print(f"{len(records)} listings -> {csv_path}")


if __name__ == "__main__":
    main()
