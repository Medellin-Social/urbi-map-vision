"""
Genera public/data/comunas_medellin.geojson

Estrategia:
  1. Calcula el centroide de cada barrio en raw.barrios (MEDELLIN)
  2. Asigna cada barrio a la comuna más cercana usando centroides de referencia
  3. Actualiza raw.barrios.comuna
  4. Disuelve polígonos por comuna via ST_Union → GeoJSON
"""

import json
import math
import os
import psycopg2
import psycopg2.extras
from pathlib import Path

DB_URL = os.environ["DATABASE_URL"]
OUT_PATH = Path(__file__).parent.parent / "public" / "data" / "comunas_medellin.geojson"

# Centroides de referencia de cada comuna (lat, lng) — fuente: Alcaldía de Medellín POT
COMUNAS = [
    {"cd": 1,  "nombre": "POPULAR",             "lat": 6.2971, "lng": -75.5392},
    {"cd": 2,  "nombre": "SANTA CRUZ",          "lat": 6.2832, "lng": -75.5522},
    {"cd": 3,  "nombre": "MANRIQUE",            "lat": 6.2680, "lng": -75.5428},
    {"cd": 4,  "nombre": "ARANJUEZ",            "lat": 6.2752, "lng": -75.5740},
    {"cd": 5,  "nombre": "CASTILLA",            "lat": 6.2973, "lng": -75.5818},
    {"cd": 6,  "nombre": "DOCE DE OCTUBRE",     "lat": 6.2948, "lng": -75.5982},
    {"cd": 7,  "nombre": "ROBLEDO",             "lat": 6.2720, "lng": -75.6100},
    {"cd": 8,  "nombre": "VILLA HERMOSA",       "lat": 6.2432, "lng": -75.5490},
    {"cd": 9,  "nombre": "BUENOS AIRES",        "lat": 6.2295, "lng": -75.5556},
    {"cd": 10, "nombre": "LA CANDELARIA",       "lat": 6.2504, "lng": -75.5700},
    {"cd": 11, "nombre": "LAURELES",            "lat": 6.2488, "lng": -75.5972},
    {"cd": 12, "nombre": "LA AMERICA",          "lat": 6.2400, "lng": -75.5948},
    {"cd": 13, "nombre": "SAN JAVIER",          "lat": 6.2588, "lng": -75.6108},
    {"cd": 14, "nombre": "EL POBLADO",          "lat": 6.2040, "lng": -75.5561},
    {"cd": 15, "nombre": "GUAYABAL",            "lat": 6.2065, "lng": -75.5855},
    {"cd": 16, "nombre": "BELEN",               "lat": 6.2240, "lng": -75.6085},
    {"cd": 60, "nombre": "SAN CRISTOBAL",       "lat": 6.2768, "lng": -75.6430},
    {"cd": 70, "nombre": "ALTAVISTA",           "lat": 6.2040, "lng": -75.6350},
    {"cd": 80, "nombre": "SAN ANTONIO DE PRADO","lat": 6.1742, "lng": -75.6371},
    {"cd": 90, "nombre": "SANTA ELENA",         "lat": 6.2278, "lng": -75.4834},
]


def haversine(lat1, lng1, lat2, lng2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def nearest_comuna(lat, lng):
    return min(COMUNAS, key=lambda c: haversine(lat, lng, c["lat"], c["lng"]))


def main():
    conn = psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    conn.autocommit = False
    cur = conn.cursor()

    # ── 1. Centroides de barrios MEDELLIN ──────────────────────────────────────
    print("── 1. Calculando centroides de barrios ───────────────────────────")
    cur.execute("""
        SELECT
            id,
            nombre,
            ST_Y(ST_Centroid(geometry)) AS lat,
            ST_X(ST_Centroid(geometry)) AS lng
        FROM raw.barrios
        WHERE municipio = 'MEDELLIN'
          AND geometry IS NOT NULL
    """)
    barrios = cur.fetchall()
    print(f"   {len(barrios)} barrios con geometría")

    # ── 2. Asignar comuna más cercana ──────────────────────────────────────────
    print("── 2. Asignando comunas por centroide más cercano ────────────────")
    asignaciones = []
    for b in barrios:
        com = nearest_comuna(b["lat"], b["lng"])
        asignaciones.append((com["nombre"], b["id"]))

    # Actualizar raw.barrios.comuna
    cur.executemany(
        "UPDATE raw.barrios SET comuna = %s WHERE id = %s",
        asignaciones
    )
    conn.commit()
    print(f"   {len(asignaciones)} barrios actualizados")

    # Resumen de asignación
    cur.execute("""
        SELECT comuna, COUNT(*) as n
        FROM raw.barrios
        WHERE municipio = 'MEDELLIN'
        GROUP BY comuna ORDER BY n DESC
    """)
    for r in cur.fetchall():
        print(f"   {(r['comuna'] or 'NULL'):<30} {r['n']:>3} barrios")

    # ── 3. Generar GeoJSON de comunas via ST_Union ─────────────────────────────
    print("\n── 3. Generando polígonos de comunas (ST_Union) ─────────────────")
    cur.execute("""
        SELECT
            b.comuna,
            ST_AsGeoJSON(
                ST_Union(b.geometry),
                6
            ) AS geom_json
        FROM raw.barrios b
        WHERE b.municipio = 'MEDELLIN'
          AND b.comuna IS NOT NULL
          AND b.geometry IS NOT NULL
        GROUP BY b.comuna
        ORDER BY b.comuna
    """)
    rows = cur.fetchall()
    print(f"   {len(rows)} comunas generadas")

    # Añadir cd_comuna y orden
    cd_map = {c["nombre"]: c["cd"] for c in COMUNAS}

    features = []
    for r in rows:
        nombre = r["comuna"]
        cd = cd_map.get(nombre, 0)
        features.append({
            "type": "Feature",
            "id": cd,
            "geometry": json.loads(r["geom_json"]),
            "properties": {
                "cd_comuna": cd,
                "nombre": nombre,
                "municipio": "MEDELLIN",
            }
        })

    # Ordenar por cd_comuna
    features.sort(key=lambda f: f["properties"]["cd_comuna"])

    fc = {"type": "FeatureCollection", "features": features}
    OUT_PATH.write_text(json.dumps(fc, ensure_ascii=False), encoding="utf-8")
    print(f"\n✅ Guardado: {OUT_PATH}")
    print(f"   {len(features)} comunas | {OUT_PATH.stat().st_size // 1024} KB")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
