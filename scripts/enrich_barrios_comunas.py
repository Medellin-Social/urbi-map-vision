"""
Añade cd_comuna y nombre_comuna a cada feature de barrios_medellin.geojson
usando point-in-polygon contra comunas_medellin.geojson (Shapely).
"""

import json
from pathlib import Path
from shapely.geometry import shape, Point

ROOT = Path(__file__).parent.parent / "public" / "data"
BARRIOS_IN  = ROOT / "barrios_medellin.geojson"
COMUNAS_IN  = ROOT / "comunas_medellin.geojson"
BARRIOS_OUT = ROOT / "barrios_medellin.geojson"

# Cargar comunas
with open(COMUNAS_IN, encoding="utf-8") as f:
    comunas_fc = json.load(f)

comunas = []
for feat in comunas_fc["features"]:
    p = feat["properties"]
    comunas.append({
        "cd":     p["cd_comuna"],
        "nombre": p["nombre"],
        "shape":  shape(feat["geometry"]),
    })

def find_comuna(geom_json):
    """Retorna (cd_comuna, nombre_comuna) para el centroide del polígono."""
    try:
        centroid = shape(geom_json).centroid
    except Exception:
        return None, None
    for c in comunas:
        if c["shape"].contains(centroid):
            return c["cd"], c["nombre"]
    # fallback: comuna más cercana
    best = min(comunas, key=lambda c: c["shape"].distance(centroid))
    return best["cd"], best["nombre"]

# Cargar y enriquecer barrios
with open(BARRIOS_IN, encoding="utf-8") as f:
    barrios_fc = json.load(f)

assigned = 0
for feat in barrios_fc["features"]:
    geo = feat.get("geometry")
    if not geo:
        feat["properties"]["cd_comuna"]     = None
        feat["properties"]["nombre_comuna"] = None
        continue
    cd, nombre = find_comuna(geo)
    feat["properties"]["cd_comuna"]     = cd
    feat["properties"]["nombre_comuna"] = nombre
    if cd:
        assigned += 1

with open(BARRIOS_OUT, "w", encoding="utf-8") as f:
    json.dump(barrios_fc, f, ensure_ascii=False)

total = len(barrios_fc["features"])
print(f"✅ {assigned}/{total} barrios con comuna asignada")

# Resumen
from collections import Counter
counts = Counter(
    f["properties"].get("nombre_comuna") or "SIN COMUNA"
    for f in barrios_fc["features"]
)
for nombre, n in sorted(counts.items(), key=lambda x: -x[1]):
    print(f"  {nombre:<30} {n:>3} barrios")
