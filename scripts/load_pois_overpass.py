"""
Descarga POIs de OpenStreetMap (Overpass API) para todo el Valle de Aburrá
y los carga en raw.pois (upsert por osm_id).

Tipos buscados (mismos que ya existen en la tabla):
  cafe, coworking, gimnasio, hospital, mall, metro, parque,
  restaurante, universidad, bar, yoga_studio

Uso:
  python scripts/load_pois_overpass.py
  python scripts/load_pois_overpass.py --dry-run   # imprime sin insertar
"""

import json
import os
import time
from pathlib import Path

import psycopg2
import psycopg2.extras
import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://urbidata:urbidata007@localhost:5433/urbidata",
)

# Bounding box del Valle de Aburrá (sur, oeste, norte, este)
BBOX = (5.95, -75.76, 6.52, -75.43)

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://overpass.openstreetmap.fr/api/interpreter",
]
OVERPASS_TIMEOUT = 120
OVERPASS_HEADERS = {
    "User-Agent": "urbi-map-vision/1.0 (data pipeline; info.facturIA@gmail.com)",
    "Accept": "application/json",
}


# ── Reglas de clasificación ──────────────────────────────────────────────────
#
# Cada regla define:
#   tipo     → campo tipo en raw.pois
#   subtipo  → campo subtipo (formato "key=value" como los existentes)
#   query    → bloque OverpassQL para nwr[]()
#
# El orden importa: yoga se evalúa antes que gimnasio para que los
# fitness_centre con sport=yoga se clasifiquen como yoga_studio.

def _bbox_str(bbox):
    return f"{bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}"


POI_RULES = [
    # ── yoga_studio: misma lógica que los datos existentes de Medellín ────
    # El OSM local usa amenity=studio (incluye estudios de baile/yoga/medios)
    # y leisure=dance como proxy de espacios de bienestar/yoga.
    {
        "tipo": "yoga_studio",
        "subtipo": "amenity=studio",
        "queries": [
            'nwr["amenity"="studio"]({bbox})',
        ],
    },
    {
        "tipo": "yoga_studio",
        "subtipo": "leisure=dance",
        "queries": [
            'nwr["leisure"="dance"]({bbox})',
        ],
    },
    # ── resto de tipos ─────────────────────────────────────────────────────
    {
        "tipo": "cafe",
        "subtipo": "amenity=cafe",
        "queries": ['nwr["amenity"="cafe"]({bbox})'],
    },
    {
        "tipo": "coworking",
        "subtipo": "office=coworking",
        "queries": ['nwr["office"="coworking"]({bbox})'],
    },
    {
        "tipo": "gimnasio",
        "subtipo": "leisure=fitness_centre",
        "queries": ['nwr["leisure"="fitness_centre"]({bbox})'],
    },
    {
        "tipo": "hospital",
        "subtipo": "amenity=hospital",
        "queries": ['nwr["amenity"="hospital"]({bbox})'],
    },
    {
        "tipo": "hospital",
        "subtipo": "amenity=clinic",
        "queries": ['nwr["amenity"="clinic"]({bbox})'],
    },
    {
        "tipo": "mall",
        "subtipo": "shop=mall",
        "queries": ['nwr["shop"="mall"]({bbox})'],
    },
    {
        "tipo": "metro",
        "subtipo": "railway=station",
        "queries": ['nwr["railway"="station"]({bbox})'],
    },
    {
        "tipo": "parque",
        "subtipo": "leisure=park",
        "queries": ['nwr["leisure"="park"]({bbox})'],
    },
    {
        "tipo": "restaurante",
        "subtipo": "amenity=restaurant",
        "queries": ['nwr["amenity"="restaurant"]({bbox})'],
    },
    {
        "tipo": "universidad",
        "subtipo": "amenity=university",
        "queries": [
            'nwr["amenity"="university"]({bbox})',
            'nwr["amenity"="college"]({bbox})',
        ],
    },
    {
        "tipo": "bar",
        "subtipo": "amenity=bar",
        "queries": ['nwr["amenity"="bar"]({bbox})'],
    },
]


def overpass_query(query_body: str) -> list[dict]:
    """Ejecuta un bloque de OverpassQL y retorna la lista de elements."""
    bbox_s = _bbox_str(BBOX)
    body = query_body.replace("{bbox}", bbox_s)

    full_query = f"[out:json][timeout:{OVERPASS_TIMEOUT}];\n(\n{body};\n);\nout center;"

    for url in OVERPASS_URLS:
        for attempt in range(2):
            try:
                resp = requests.post(
                    url,
                    data={"data": full_query},
                    headers=OVERPASS_HEADERS,
                    timeout=OVERPASS_TIMEOUT + 10,
                )
                if resp.status_code == 200:
                    return resp.json().get("elements", [])
                wait = 10 * (attempt + 1)
                print(f"  WARN: {url} → {resp.status_code}, reintentando en {wait}s...")
                time.sleep(wait)
            except requests.RequestException as exc:
                wait = 10 * (attempt + 1)
                print(f"  WARN: {url} error ({exc}), reintentando en {wait}s...")
                time.sleep(wait)

    raise RuntimeError("Todos los mirrors de Overpass fallaron")


def element_to_point(el: dict) -> tuple[float, float] | None:
    """Retorna (lat, lon) del elemento. Para ways/relations usa el centro."""
    etype = el.get("type")
    if etype == "node":
        return el.get("lat"), el.get("lon")
    # way / relation → campo 'center'
    center = el.get("center")
    if center:
        return center.get("lat"), center.get("lon")
    return None


def osm_id_str(el: dict) -> str:
    return f"{el['type']}/{el['id']}"


def fetch_all_pois() -> list[dict]:
    """
    Descarga todos los POIs según las reglas definidas.
    Retorna lista de dicts con campos: osm_id, nombre, tipo, subtipo, raw_tags, lat, lon.
    Deduplicados por osm_id — si un elemento cae en varias reglas, gana la primera.
    """
    seen: dict[str, dict] = {}  # osm_id → poi dict

    for rule in POI_RULES:
        tipo = rule["tipo"]
        subtipo = rule["subtipo"]

        for q in rule["queries"]:
            print(f"  Fetching {tipo} / {subtipo} ...")
            elements = overpass_query(q)
            print(f"    → {len(elements)} elementos de Overpass")

            new_count = 0
            for el in elements:
                oid = osm_id_str(el)
                if oid in seen:
                    continue  # ya clasificado con prioridad mayor

                coords = element_to_point(el)
                if not coords or None in coords:
                    continue

                lat, lon = coords
                tags = el.get("tags", {})
                nombre = tags.get("name", "")

                seen[oid] = {
                    "osm_id": oid,
                    "nombre": nombre,
                    "tipo": tipo,
                    "subtipo": subtipo,
                    "raw_tags": json.dumps(tags, ensure_ascii=False),
                    "lat": lat,
                    "lon": lon,
                }
                new_count += 1

            print(f"    → {new_count} nuevos para insertar")
            time.sleep(1)  # cortesía al servidor público

    return list(seen.values())


UPSERT_SQL = """
INSERT INTO raw.pois (osm_id, nombre, tipo, subtipo, raw_tags, geometry)
VALUES (
    %(osm_id)s,
    %(nombre)s,
    %(tipo)s,
    %(subtipo)s,
    %(raw_tags)s::jsonb,
    ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326)
)
ON CONFLICT (osm_id) DO UPDATE SET
    nombre   = EXCLUDED.nombre,
    tipo     = EXCLUDED.tipo,
    subtipo  = EXCLUDED.subtipo,
    raw_tags = EXCLUDED.raw_tags,
    geometry = EXCLUDED.geometry
"""


def load_pois(pois: list[dict], dry_run: bool = False) -> None:
    if dry_run:
        print(f"\n[dry-run] Se insertarían/actualizarían {len(pois)} POIs.")
        by_tipo: dict[str, int] = {}
        for p in pois:
            by_tipo[p["tipo"]] = by_tipo.get(p["tipo"], 0) + 1
        for t, c in sorted(by_tipo.items()):
            print(f"  {t}: {c}")
        return

    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    batch = 500
    inserted = 0
    for i in range(0, len(pois), batch):
        chunk = pois[i : i + batch]
        psycopg2.extras.execute_batch(cur, UPSERT_SQL, chunk, page_size=batch)
        inserted += len(chunk)

    conn.commit()
    conn.close()
    print(f"\nUpsert completado: {inserted} POIs procesados.")


def main():
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    print(f"Descargando POIs del Valle de Aburrá (bbox={BBOX})...")
    pois = fetch_all_pois()

    by_tipo: dict[str, int] = {}
    for p in pois:
        by_tipo[p["tipo"]] = by_tipo.get(p["tipo"], 0) + 1

    print(f"\nTotal POIs descargados: {len(pois)}")
    for t, c in sorted(by_tipo.items()):
        print(f"  {t}: {c}")

    load_pois(pois, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
