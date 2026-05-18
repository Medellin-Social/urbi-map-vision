"""
Download barrio polygon data for all Valle de Aburrá municipalities.

Sources:
  Medellín    → already exists: public/data/barrios_medellin.geojson
  Bello       → datos.gov.co pnhh-ccwd
  La Estrella → datos.gov.co 5h8y-kv4j
  Itagüí      → arcgis.itagui.gov.co Cartografia_Base MapServer layer 13
  Envigado    → services7.arcgis.com AMVA 2024 Mapa_Base_MA_2024_WFL1 layer 3
  Sabaneta    → services7.arcgis.com Alcaldía Sabaneta Barrios FeatureServer/0
  Others      → Voronoi tessellation from scraped centroids,
                clipped to ADM2 municipality boundary (geoBoundaries COL ADM2)

Output:
  public/data/barrios_{municipio}.geojson   per municipality
  public/data/barrios_valle_aburra.geojson  combined (all municipalities)

Run:
  python download_polygons.py
"""

import json
import time
from pathlib import Path

import requests
from scipy.spatial import Voronoi
from shapely.geometry import (
    MultiPolygon, Point, Polygon, mapping, shape
)
from shapely.ops import unary_union

# ── Paths ─────────────────────────────────────────────────────────────────────

ROOT = Path(__file__).parent.parent
PUBLIC_DATA = ROOT / "public" / "data"
PUBLIC_DATA.mkdir(parents=True, exist_ok=True)
PROCESSED = Path(__file__).parent / "data" / "processed" / "barrios_stats.json"

# ── DANE municipality codes (for filtering ADM2) ──────────────────────────────

DANE_CODES = {
    "medellin":    "05001",
    "bello":       "05088",
    "itagui":      "05360",
    "envigado":    "05266",
    "sabaneta":    "05675",
    "la-estrella": "05400",
}

MUN_DISPLAY = {
    "medellin":    "Medellín",
    "bello":       "Bello",
    "itagui":      "Itagüí",
    "envigado":    "Envigado",
    "sabaneta":    "Sabaneta",
    "la-estrella": "La Estrella",
}

# ── datos.gov.co sources (confirmed with real polygon geometry) ───────────────

DATOS_GOV_SOURCES = {
    "bello":       "pnhh-ccwd",
    "la-estrella": "5h8y-kv4j",
}

# Field mappings for each source
FIELD_MAP = {
    "bello":       {"nombre": "nombre"},
    "la-estrella": {"nombre": "nombre_uni"},
}

# ── Helpers ───────────────────────────────────────────────────────────────────

HEADERS = {"User-Agent": "urbi-map-vision/1.0 (educational/research)"}


def fetch_json(url: str, **kwargs) -> dict | list | None:
    try:
        r = requests.get(url, headers=HEADERS, timeout=25, **kwargs)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"  WARN fetch {url[:60]}: {e}")
        return None


def normalize_feature(feat: dict, slug: str) -> dict | None:
    """Normalize a feature to standard {id, nombre, municipio} properties."""
    props = feat.get("properties") or {}
    geo = feat.get("geometry")
    if not geo:
        return None

    fm = FIELD_MAP.get(slug, {})
    nombre_key = fm.get("nombre", "nombre")
    nombre = (
        props.get(nombre_key)
        or props.get("NOMBRE")
        or props.get("nombre")
        or props.get("name")
        or props.get("barrio")
        or "SIN NOMBRE"
    )
    return {
        "type": "Feature",
        "properties": {
            "nombre": str(nombre).upper().strip(),
            "municipio": MUN_DISPLAY.get(slug, slug).upper(),
            "slug_municipio": slug,
            "source": "datos.gov.co",
        },
        "geometry": geo,
    }


# ── ArcGIS REST download helpers ─────────────────────────────────────────────

ARCGIS_SOURCES = {
    "itagui": {
        "url": "https://arcgis.itagui.gov.co/waserver/rest/services/Cartografia_Base/00_Cartografia_Base/MapServer/13/query",
        "nombre_field": "nom_barrio",
        "source_label": "alcaldia_itagui",
    },
    "envigado": {
        "url": "https://services7.arcgis.com/vAISUooSGCM0wKQp/arcgis/rest/services/Mapa_Base_MA_2024_WFL1/FeatureServer/3/query",
        "nombre_field": "nom_barrio",
        "source_label": "amva_2024",
    },
    "sabaneta": {
        "url": "https://services7.arcgis.com/OsNfmcCXlLRPMVA8/arcgis/rest/services/Barrios/FeatureServer/0/query",
        "nombre_field": "NOMBRE_MAYUS",
        "source_label": "alcaldia_sabaneta",
    },
}


def download_arcgis(slug: str) -> list[dict]:
    """Download barrio polygons from ArcGIS REST FeatureServer/MapServer."""
    cfg = ARCGIS_SOURCES[slug]
    params = {
        "f": "geojson",
        "where": "1=1",
        "outFields": "*",
        "outSR": "4326",
    }
    print(f"  Downloading {slug} from ArcGIS ({cfg['source_label']})...")
    data = fetch_json(cfg["url"], params=params)
    if not data:
        return []
    features = data.get("features", [])
    normalized = []
    for feat in features:
        props = feat.get("properties") or {}
        geo = feat.get("geometry")
        if not geo:
            continue
        nombre_raw = (
            props.get(cfg["nombre_field"])
            or props.get("NOMBRE")
            or props.get("nom_barrio")
            or props.get("NOMBARRIO")
            or "SIN NOMBRE"
        )
        normalized.append({
            "type": "Feature",
            "properties": {
                "nombre": str(nombre_raw).upper().strip(),
                "municipio": MUN_DISPLAY.get(slug, slug).upper(),
                "slug_municipio": slug,
                "source": cfg["source_label"],
            },
            "geometry": geo,
        })
    print(f"  → {len(normalized)} features")
    return normalized


# ── Step 1: Download from datos.gov.co ───────────────────────────────────────

def download_datos_gov(slug: str, uid: str) -> list[dict]:
    url = f"https://www.datos.gov.co/resource/{uid}.geojson"
    print(f"  Downloading {slug} from datos.gov.co/{uid}...")
    data = fetch_json(url)
    if not data:
        return []
    features = data.get("features", [])
    normalized = [f for f in (normalize_feature(f, slug) for f in features) if f]
    print(f"  → {len(normalized)} features")
    return normalized


# ── Step 2: Load ADM2 municipality boundaries ─────────────────────────────────

def load_adm2_boundaries() -> dict[str, Polygon | MultiPolygon]:
    """Download Colombia ADM2 (municipalities) and return shapely geometries keyed by DANE code."""
    url = "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/COL/ADM2/geoBoundaries-COL-ADM2.geojson"
    cache = Path(__file__).parent / "data" / "col_adm2.geojson"

    if cache.exists():
        print("  Using cached ADM2...")
        with open(cache) as f:
            data = json.load(f)
    else:
        print("  Downloading Colombia ADM2 boundaries...")
        r = requests.get(url, headers=HEADERS, timeout=60)
        r.raise_for_status()
        data = r.json()
        with open(cache, "w") as f:
            json.dump(data, f)

    boundaries = {}
    for feat in data.get("features", []):
        props = feat.get("properties", {})
        # geoBoundaries uses shapeISO (COL-05001) or shapeName
        shape_name = props.get("shapeName", "")
        shape_iso = props.get("shapeISO", "")

        # Match our municipalities by name
        name_lower = shape_name.lower()
        for slug, display in MUN_DISPLAY.items():
            if display.lower() in name_lower or slug in name_lower:
                geom = shape(feat["geometry"])
                boundaries[slug] = geom
                break

    # Also try DANE code matching via shapeName known patterns
    for feat in data.get("features", []):
        props = feat.get("properties", {})
        shape_name = props.get("shapeName", "").upper()
        for slug, display in MUN_DISPLAY.items():
            if slug in boundaries:
                continue
            if display.upper() in shape_name or shape_name in display.upper():
                boundaries[slug] = shape(feat["geometry"])

    print(f"  Loaded {len(boundaries)} ADM2 boundaries: {list(boundaries.keys())}")
    return boundaries


# ── Step 3: Voronoi generation ────────────────────────────────────────────────

def voronoi_for_municipality(
    slug: str,
    barrios: list[dict],
    boundary: Polygon | MultiPolygon,
) -> list[dict]:
    """
    Generate Voronoi polygon for each barrio centroid, clipped to municipality boundary.
    Returns list of GeoJSON features.
    """
    if not barrios:
        return []

    # Filter to barrios with valid coords in this municipality
    pts = []
    barrio_data = []
    for b in barrios:
        lat, lng = b.get("lat"), b.get("lng")
        if lat and lng:
            pt = Point(float(lng), float(lat))
            if boundary.contains(pt) or boundary.distance(pt) < 0.01:
                pts.append([float(lng), float(lat)])
                barrio_data.append(b)

    if len(pts) < 3:
        print(f"  WARN: only {len(pts)} points for {slug} — skipping Voronoi")
        return []

    import numpy as np
    pts_arr = np.array(pts)

    # Add far-away mirror points to close Voronoi regions
    bbox = boundary.bounds  # (minx, miny, maxx, maxy)
    margin = max(bbox[2]-bbox[0], bbox[3]-bbox[1]) * 2
    cx, cy = (bbox[0]+bbox[2])/2, (bbox[1]+bbox[3])/2
    mirror = np.array([
        [cx - margin, cy], [cx + margin, cy],
        [cx, cy - margin], [cx, cy + margin],
    ])
    all_pts = np.vstack([pts_arr, mirror])

    vor = Voronoi(all_pts)

    features = []
    for i, (b, pt) in enumerate(zip(barrio_data, pts)):
        region_idx = vor.point_region[i]
        region = vor.regions[region_idx]
        if -1 in region or not region:
            continue
        vertices = vor.vertices[region]
        try:
            poly = Polygon(vertices)
            clipped = poly.intersection(boundary)
            if clipped.is_empty:
                continue
            features.append({
                "type": "Feature",
                "properties": {
                    "nombre": b["nombre"].upper(),
                    "municipio": MUN_DISPLAY.get(slug, slug).upper(),
                    "slug_municipio": slug,
                    "source": "voronoi",
                },
                "geometry": mapping(clipped),
            })
        except Exception:
            continue

    print(f"  → {len(features)} Voronoi polygons for {slug}")
    return features


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    # Load scraped barrio centroids
    with open(PROCESSED) as f:
        barrios_stats = json.load(f)

    barrios_by_slug: dict[str, list[dict]] = {}
    for b in barrios_stats:
        slug = b.get("slug_municipio", "")
        if slug:
            barrios_by_slug.setdefault(slug, []).append(b)

    all_features: list[dict] = []

    # 1. Medellín — already exists
    med_path = PUBLIC_DATA / "barrios_medellin.geojson"
    if med_path.exists():
        print("Medellín: using existing barrios_medellin.geojson")
        with open(med_path) as f:
            med_data = json.load(f)
        med_features = []
        for feat in med_data.get("features", []):
            props = feat.get("properties", {})
            feat["properties"] = {
                "nombre": str(props.get("nombre", "")).upper(),
                "municipio": "MEDELLÍN",
                "slug_municipio": "medellin",
                "source": "alcaldia_medellin",
            }
            med_features.append(feat)
        all_features.extend(med_features)
        print(f"  → {len(med_features)} features")
    else:
        print("WARNING: barrios_medellin.geojson not found")

    # 2. datos.gov.co sources
    for slug, uid in DATOS_GOV_SOURCES.items():
        print(f"\n{MUN_DISPLAY[slug]}:")
        feats = download_datos_gov(slug, uid)
        if feats:
            out = PUBLIC_DATA / f"barrios_{slug.replace('-', '_')}.geojson"
            with open(out, "w") as f:
                json.dump({"type": "FeatureCollection", "features": feats}, f,
                          ensure_ascii=False, indent=2)
            print(f"  Written → {out.name}")
            all_features.extend(feats)
        time.sleep(0.5)

    # 3. ArcGIS real polygon sources (Itagüí, Envigado, Sabaneta)
    for slug in ARCGIS_SOURCES:
        print(f"\n{MUN_DISPLAY[slug]}:")
        feats = download_arcgis(slug)
        if feats:
            out = PUBLIC_DATA / f"barrios_{slug.replace('-', '_')}.geojson"
            with open(out, "w") as f:
                json.dump({"type": "FeatureCollection", "features": feats}, f,
                          ensure_ascii=False, indent=2)
            print(f"  Written → {out.name}")
            all_features.extend(feats)
        time.sleep(0.5)

    # 4. Voronoi for remaining municipalities (no real polygon source available)
    already_done = set(DATOS_GOV_SOURCES) | set(ARCGIS_SOURCES) | {"medellin"}
    remaining = [s for s in DANE_CODES if s not in already_done]
    print(f"\nGenerating Voronoi for: {remaining}")

    print("\nLoading ADM2 boundaries...")
    try:
        adm2 = load_adm2_boundaries()
    except Exception as e:
        print(f"  ERROR loading ADM2: {e}")
        adm2 = {}

    for slug in remaining:
        print(f"\n{MUN_DISPLAY[slug]}:")
        barrios = barrios_by_slug.get(slug, [])
        if not barrios:
            print(f"  no barrio centroids — skipping")
            continue

        boundary = adm2.get(slug)
        if not boundary:
            print(f"  no ADM2 boundary found — using convex hull from centroids")
            pts_raw = [(b["lng"], b["lat"]) for b in barrios if b.get("lat") and b.get("lng")]
            if len(pts_raw) < 3:
                continue
            from shapely.geometry import MultiPoint
            boundary = MultiPoint(pts_raw).convex_hull.buffer(0.01)

        feats = voronoi_for_municipality(slug, barrios, boundary)
        if feats:
            out = PUBLIC_DATA / f"barrios_{slug.replace('-', '_')}.geojson"
            with open(out, "w") as f:
                json.dump({"type": "FeatureCollection", "features": feats}, f,
                          ensure_ascii=False, indent=2)
            print(f"  Written → {out.name}")
            all_features.extend(feats)

    # 5. Save combined GeoJSON
    combined = {"type": "FeatureCollection", "features": all_features}
    out_combined = PUBLIC_DATA / "barrios_valle_aburra.geojson"
    with open(out_combined, "w") as f:
        json.dump(combined, f, ensure_ascii=False, indent=2)

    print(f"\n{'='*60}")
    print(f"Combined: {len(all_features)} features → {out_combined.name}")
    by_mun: dict[str, int] = {}
    for feat in all_features:
        mun = feat.get("properties", {}).get("municipio", "?")
        by_mun[mun] = by_mun.get(mun, 0) + 1
    for mun, cnt in sorted(by_mun.items()):
        print(f"  {mun}: {cnt}")


if __name__ == "__main__":
    main()
