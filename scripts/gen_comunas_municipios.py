"""
Generate comunas_<slug>.geojson for non-Medellín municipalities.
Each municipality gets ONE dissolved polygon feature (the municipality outline),
using the same schema as comunas_medellin.geojson so the map can load it uniformly.
"""
import json
import sys
from pathlib import Path
from shapely.ops import unary_union
from shapely.geometry import shape, mapping

PUBLIC_DATA = Path(__file__).parent.parent / "public" / "data"

MUNICIPIOS = [
    ("bello",       "BELLO",      "Bello"),
    ("envigado",    "ENVIGADO",   "Envigado"),
    ("itagui",      "ITAGUI",     "Itagüí"),
    ("sabaneta",    "SABANETA",   "Sabaneta"),
    ("la_estrella", "LA ESTRELLA","La Estrella"),
]

# Synthetic cd_comuna offset so IDs don't clash with Medellín (1-16)
# We use 100 + index so Bello=101, Envigado=102, etc.
CD_OFFSET = 100

for idx, (slug, mun_upper, mun_display) in enumerate(MUNICIPIOS, start=1):
    src = PUBLIC_DATA / f"barrios_{slug}.geojson"
    if not src.exists():
        print(f"  skip {slug} (not found)", file=sys.stderr)
        continue

    fc = json.loads(src.read_text())
    geoms = []
    for feat in fc["features"]:
        try:
            geoms.append(shape(feat["geometry"]))
        except Exception:
            pass

    if not geoms:
        print(f"  skip {slug} (no valid geometries)", file=sys.stderr)
        continue

    dissolved = unary_union(geoms)
    cd = CD_OFFSET + idx

    out_fc = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": cd,
                "properties": {
                    "cd_comuna": cd,
                    "nombre": mun_upper,
                    "municipio": mun_upper,
                    "slug_municipio": slug,
                    "is_municipio": True,
                },
                "geometry": mapping(dissolved),
            }
        ],
    }

    out = PUBLIC_DATA / f"comunas_{slug}.geojson"
    out.write_text(json.dumps(out_fc, separators=(",", ":")))
    print(f"  wrote {out.name}  (cd_comuna={cd})")

print("done")
