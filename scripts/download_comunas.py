"""
Descarga polígonos de comunas desde las mismas fuentes ArcGIS que los barrios.

Fuentes:
  Medellín → CNMH FeatureServer layer 0 (misma fuente que barrios, layer 1)
  Itagüí   → arcgis.itagui.gov.co MapServer layer 15

Output:
  public/data/comunas_medellin.geojson
"""

import json
import requests
from pathlib import Path
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

HEADERS = {"User-Agent": "urbi-map-vision/1.0 (educational/research)"}
OUT_DIR = Path(__file__).parent.parent / "public" / "data"


def fetch(url, params=None):
    r = requests.get(url, headers=HEADERS, params=params or {}, timeout=30)
    r.raise_for_status()
    return r.json()


def arcgis_query(url):
    """Descarga todos los features de un ArcGIS FeatureServer/MapServer layer."""
    params = {
        "f": "geojson",
        "where": "1=1",
        "outFields": "*",
        "outSR": "4326",
        "resultRecordCount": 2000,
    }
    data = fetch(url, params)
    features = data.get("features", [])
    print(f"  → {len(features)} features")
    return features


# ── Medellín: CNMH layer 0 "Comunas Medellin" ────────────────────────────────
print("Descargando comunas Medellín (CNMH layer 0)...")
url = (
    "https://serviciosgiscnmh.centrodememoriahistorica.gov.co"
    "/agccnmh/rest/services/DCMH/Medellinguerraurbana/FeatureServer/0/query"
)
raw_features = arcgis_query(url)

# Inspeccionar propiedades del primer feature
if raw_features:
    print("  Propiedades disponibles:", list(raw_features[0].get("properties", {}).keys()))
    print("  Muestra:", json.dumps(raw_features[0].get("properties", {}), ensure_ascii=False))

# Normalizar features
features = []
for i, feat in enumerate(raw_features):
    props = feat.get("properties") or {}
    geo = feat.get("geometry")
    if not geo:
        continue

    # Campos confirmados: Nombre_Comuna, Numero_Comuna
    nombre = (
        props.get("Nombre_Comuna")
        or props.get("NOMBRE_COM")
        or props.get("nombre")
        or f"COMUNA {i+1}"
    )

    cd = (
        props.get("Numero_Comuna")
        or props.get("CODIGO_COM")
        or props.get("codigo")
        or i + 1
    )

    # Simplificar geometría para reducir tamaño (0.0002° ≈ 20m tolerancia)
    try:
        simplified = shape(geo).simplify(0.0002, preserve_topology=True)
        geo = mapping(simplified)
    except Exception:
        pass  # mantener geometría original si falla

    features.append({
        "type": "Feature",
        "id": int(cd) if str(cd).isdigit() else i + 1,
        "geometry": geo,
        "properties": {
            "cd_comuna": int(cd) if str(cd).isdigit() else i + 1,
            "nombre": str(nombre).upper().strip(),
            "municipio": "MEDELLIN",
            "slug_municipio": "medellin",
            "source": "cnmh_medellinguerraurbana",
        },
    })

features.sort(key=lambda f: f["properties"]["cd_comuna"])

out = OUT_DIR / "comunas_medellin.geojson"
out.write_text(
    json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False),
    encoding="utf-8",
)
print(f"\n✅ {len(features)} comunas guardadas → {out}")
print(f"   {out.stat().st_size // 1024} KB")
print("\nComunas descargadas:")
for f in features:
    p = f["properties"]
    print(f"  [{p['cd_comuna']:>3}] {p['nombre']}")
