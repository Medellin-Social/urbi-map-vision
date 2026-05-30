"""
Aggregate raw scraped listings into per-barrio statistics.

Input:  data/raw/{slug}_{tipo}.json
Output: data/processed/barrios_stats.json

Fields per barrio:
  nombre, municipio, slug_municipio
  precio_m2       median price/m² from venta listings
  arriendo        median rent from arriendo listings
  yield_anual     (arriendo*12 / (precio_m2 * avg_area)) * 100
  anos_recupero   100 / yield_anual
  n_venta         count venta listings
  n_arriendo      count arriendo listings
  lat, lng        centroid (from listings or config fallback)
  score_salud     salud financiera del municipio (from remates_por_municipio.json)
  categoria_salud text label for score_salud
  estrato         placeholder (0 = unknown, to be enriched later)
  dist_metro      placeholder (-1 = unknown)
  dist_parque     placeholder (-1 = unknown)
  dist_mall       placeholder (-1 = unknown)

Run:
  python aggregate.py
"""

import json
import statistics
from pathlib import Path

from config import MUNICIPIOS, BARRIO_COORDS

RAW_DIR = Path(__file__).parent / "data" / "raw"
PROCESSED_DIR = Path(__file__).parent / "data" / "processed"
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

OUTPUT = PROCESSED_DIR / "barrios_stats.json"
REMATES_POR_MUNICIPIO = PROCESSED_DIR / "remates_por_municipio.json"

# Minimum listings required to include a barrio
MIN_LISTINGS_VENTA = 2
MIN_LISTINGS_ARRIENDO = 1

# Generic city-level names to exclude (listings that didn't specify a barrio)
_CITY_NAMES = {m["nombre"].upper() for m in MUNICIPIOS}
_CITY_NAMES.update({"MEDELLÍN", "BELLO", "ITAGÜÍ", "ENVIGADO", "SABANETA",
                     "LA ESTRELLA", "ANTIOQUIA", "COLOMBIA"})

# Reasonable price ranges (filter outliers)
MIN_PRECIO_M2 = 500_000       # 500k COP/m²
MAX_PRECIO_M2 = 30_000_000    # 30M COP/m²
MIN_ARRIENDO = 300_000        # 300k COP/month
MAX_ARRIENDO = 30_000_000     # 30M COP/month
MIN_AREA = 20                 # m²
MAX_AREA = 1000               # m²


# Accepted municipio values per slug (normalized uppercase, accent variants)
_SLUG_VALID_MUNICIPIOS: dict[str, set[str]] = {
    "medellin":    {"MEDELLÍN", "MEDELLIN"},
    "bello":       {"BELLO"},
    "envigado":    {"ENVIGADO"},
    "itagui":      {"ITAGÜÍ", "ITAGUI", "ITAGUÍ"},
    "la-estrella": {"LA ESTRELLA"},
    "sabaneta":    {"SABANETA"},
}


def load_raw_files() -> dict[str, list[dict]]:
    """Load all raw JSON files. Returns dict: barrio_key → list of listings."""
    all_listings: dict[str, list[dict]] = {}
    filtered_out = 0

    for json_file in sorted(RAW_DIR.glob("*.json")):
        parts = json_file.stem.split("_", 1)
        if len(parts) != 2:
            continue
        slug, tipo = parts

        with open(json_file, encoding="utf-8") as f:
            try:
                listings = json.load(f)
            except json.JSONDecodeError:
                print(f"WARN: could not parse {json_file}")
                continue

        valid_muns = _SLUG_VALID_MUNICIPIOS.get(slug)

        for listing in listings:
            if not listing:
                continue
            barrio = listing.get("barrio", "").upper().strip()
            municipio = listing.get("municipio", "").upper().strip()
            if not barrio:
                continue

            # Drop listings that fincaraiz mis-assigned to a different municipality
            if valid_muns and municipio and municipio not in valid_muns:
                filtered_out += 1
                continue

            # Composite key: BARRIO__MUNICIPIO_SLUG
            key = f"{barrio}__{slug}"
            if key not in all_listings:
                all_listings[key] = []
            listing["_slug"] = slug
            listing["_municipio_nombre"] = municipio
            all_listings[key].append(listing)

    if filtered_out:
        print(f"  Filtered {filtered_out} listings with wrong municipality")
    return all_listings


def safe_median(values: list[float]) -> float | None:
    clean = [v for v in values if v and v > 0]
    if not clean:
        return None
    return statistics.median(clean)


def safe_mean(values: list[float]) -> float | None:
    clean = [v for v in values if v and v > 0]
    if not clean:
        return None
    return statistics.mean(clean)


def resolve_coords(barrio: str, listings: list[dict]) -> tuple[float | None, float | None]:
    """Get best lat/lng: median of listing coords, fallback to config."""
    lats = [l["lat"] for l in listings if l.get("lat")]
    lngs = [l["lng"] for l in listings if l.get("lng")]
    if lats and lngs:
        return statistics.median(lats), statistics.median(lngs)
    # Fallback: config
    coords = BARRIO_COORDS.get(barrio.upper())
    if coords:
        return coords
    return None, None


def municipio_nombre_for_slug(slug: str) -> str:
    for m in MUNICIPIOS:
        if m["slug"] == slug:
            return m["nombre"]
    return slug.title()


def aggregate_barrio(barrio: str, slug: str, listings: list[dict]) -> dict | None:
    venta = [
        l for l in listings
        if l.get("tipo") == "venta"
        and MIN_PRECIO_M2 <= (l.get("precio_m2") or 0) <= MAX_PRECIO_M2
        and MIN_AREA <= (l.get("area") or 0) <= MAX_AREA
    ]
    arriendo = [
        l for l in listings
        if l.get("tipo") == "arriendo"
        and MIN_ARRIENDO <= (l.get("precio") or 0) <= MAX_ARRIENDO
        and MIN_AREA <= (l.get("area") or 0) <= MAX_AREA
    ]

    if len(venta) < MIN_LISTINGS_VENTA and len(arriendo) < MIN_LISTINGS_ARRIENDO:
        return None

    precio_m2 = safe_median([l["precio_m2"] for l in venta if l.get("precio_m2")])
    avg_area_venta = safe_mean([l["area"] for l in venta if l.get("area")])
    arriendo_med = safe_median([l["precio"] for l in arriendo if l.get("precio")])

    # Yield: (rent * 12) / total_value * 100
    # total_value = precio_m2 * avg_area
    yield_anual = None
    anos_recupero = None
    if precio_m2 and arriendo_med and avg_area_venta:
        valor_total = precio_m2 * avg_area_venta
        if valor_total > 0:
            yield_anual = round((arriendo_med * 12 / valor_total) * 100, 2)
            anos_recupero = round(100 / yield_anual, 2) if yield_anual > 0 else None

    lat, lng = resolve_coords(barrio, listings)

    municipio_nombre = municipio_nombre_for_slug(slug)

    return {
        "nombre": barrio,
        "municipio": municipio_nombre,
        "slug_municipio": slug,
        "precio_m2": int(precio_m2) if precio_m2 else None,
        "arriendo": int(arriendo_med) if arriendo_med else None,
        "yield_anual": yield_anual,
        "anos_recupero": anos_recupero,
        "n_venta": len(venta),
        "n_arriendo": len(arriendo),
        "lat": round(lat, 6) if lat else None,
        "lng": round(lng, 6) if lng else None,
        # Placeholders — enriched by catastro/DRN later
        "estrato": 0,
        "dist_metro": -1.0,
        "dist_parque": -1.0,
        "dist_mall": -1.0,
    }


def load_remates_scores() -> dict[str, dict]:
    """Load salud_financiera scores per municipio. Returns {} if file missing."""
    if not REMATES_POR_MUNICIPIO.exists():
        return {}
    with open(REMATES_POR_MUNICIPIO, encoding="utf-8") as f:
        return json.load(f)


def run():
    print("Loading raw files...")
    grouped = load_raw_files()
    print(f"  {len(grouped)} barrio-keys found")

    remates_scores = load_remates_scores()
    if remates_scores:
        print(f"  Remates scores loaded for: {list(remates_scores.keys())}")

    barrios = []
    for key, listings in grouped.items():
        barrio, slug = key.split("__", 1)
        # Skip generic city-level names (low-quality barrio data)
        if barrio.upper() in _CITY_NAMES:
            continue
        result = aggregate_barrio(barrio, slug, listings)
        if result:
            barrios.append(result)

    # Merge municipio-level remates score into each barrio
    for b in barrios:
        mun = b["municipio"]
        rs = remates_scores.get(mun, {})
        b["score_salud"] = rs.get("score_salud", 100)
        b["categoria_salud"] = rs.get("categoria_salud", "SIN DATOS")
        b["n_remates_municipio"] = rs.get("n_remates_activos", 0)
        b["remates_por_100_listings"] = rs.get("remates_por_100_listings")

    # Sort: municipio then barrio name
    barrios.sort(key=lambda x: (x["municipio"], x["nombre"]))

    # Assign stable IDs (start from 100 to avoid colliding with hardcoded ones)
    for i, b in enumerate(barrios, start=100):
        b["id"] = i

    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(barrios, f, ensure_ascii=False, indent=2)

    print(f"\nAggregated {len(barrios)} barrios → {OUTPUT}")

    # Summary by municipio
    by_mun: dict[str, int] = {}
    for b in barrios:
        by_mun[b["municipio"]] = by_mun.get(b["municipio"], 0) + 1
    for mun, cnt in sorted(by_mun.items()):
        print(f"  {mun}: {cnt} barrios")


if __name__ == "__main__":
    run()
