"""
Muestrea congestión vial por barrio usando HERE Traffic Flow API v7 y la
carga en analytics.barrios_congestion.

Por qué HERE y no GCP: HERE tiene free tier generoso y su `jamFactor` (0-10)
ya es un índice de congestión listo, sin cobrar por extraer/almacenar los datos.

Cómo funciona:
  Para cada barrio (centroide de raw.barrios) consulta el flujo de tráfico en
  un círculo de radio R y agrega los segmentos:
    jam_factor_avg  media del jamFactor de los segmentos (0=libre, 10=parado)
    jam_factor_max  peor segmento (cuello de botella de entrada/salida)
    speed_kmh       velocidad media actual
    free_flow_kmh   velocidad media en flujo libre
    speed_ratio     speed/free_flow (1.0=libre, <1 congestionado)

La "franja" (pico_am / pico_pm / valle) se pasa por CLI porque depende de la
HORA en que corres el script. Correlo vía cron a las 7am, 6pm y una hora valle
(ej. 3pm) para tener el contraste entrada-salida hora pico vs normal.

Requiere env var HERE_API_KEY (https://platform.here.com, plan freemium).

Uso:
  HERE_API_KEY=xxx python scripts/load_traffic_here.py --franja pico_am
  python scripts/load_traffic_here.py --franja valle --municipio ENVIGADO
  python scripts/load_traffic_here.py --franja pico_pm --dry-run   # 1 barrio, no escribe
  python scripts/load_traffic_here.py --self-check                 # test agregación offline
"""

import argparse
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import psycopg2
import psycopg2.extras
import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

DB_URL = os.environ["DATABASE_URL"]
HERE_API_KEY = os.getenv("HERE_API_KEY", "")

FLOW_URL = "https://data.traffic.hereapi.com/v7/flow"
RADIUS_M = 800          # radio de muestreo alrededor del centroide del barrio
FRANJAS = ("pico_am", "pico_pm", "valle")
REQUEST_PAUSE = 0.2     # cortesía entre llamadas (free tier tiene rate limit)

CREATE_SQL = """
CREATE TABLE IF NOT EXISTS analytics.barrios_congestion (
    barrio_id      integer NOT NULL,
    nombre_barrio  text,
    municipio      text,
    franja         text NOT NULL,        -- pico_am | pico_pm | valle
    jam_factor_avg numeric(4,2),
    jam_factor_max numeric(4,2),
    speed_kmh      numeric(6,2),
    free_flow_kmh  numeric(6,2),
    speed_ratio    numeric(4,3),
    n_segmentos    integer,
    muestreado_en  timestamptz,
    PRIMARY KEY (barrio_id, franja)      -- guarda el último muestreo por franja
);
"""

BARRIOS_SQL = """
SELECT
    b.id,
    b.nombre,
    b.municipio,
    ST_Y(ST_Centroid(b.geometry)) AS lat,
    ST_X(ST_Centroid(b.geometry)) AS lon
FROM raw.barrios b
{where}
ORDER BY b.id
"""

UPSERT_SQL = """
INSERT INTO analytics.barrios_congestion (
    barrio_id, nombre_barrio, municipio, franja,
    jam_factor_avg, jam_factor_max, speed_kmh, free_flow_kmh,
    speed_ratio, n_segmentos, muestreado_en
) VALUES (
    %(barrio_id)s, %(nombre)s, %(municipio)s, %(franja)s,
    %(jam_avg)s, %(jam_max)s, %(speed_kmh)s, %(free_kmh)s,
    %(speed_ratio)s, %(n_seg)s, %(muestreado_en)s
)
ON CONFLICT (barrio_id, franja) DO UPDATE SET
    nombre_barrio  = EXCLUDED.nombre_barrio,
    municipio      = EXCLUDED.municipio,
    jam_factor_avg = EXCLUDED.jam_factor_avg,
    jam_factor_max = EXCLUDED.jam_factor_max,
    speed_kmh      = EXCLUDED.speed_kmh,
    free_flow_kmh  = EXCLUDED.free_flow_kmh,
    speed_ratio    = EXCLUDED.speed_ratio,
    n_segmentos    = EXCLUDED.n_segmentos,
    muestreado_en  = EXCLUDED.muestreado_en
"""


def fetch_flow(lat: float, lon: float) -> list[dict]:
    """Consulta HERE Flow v7 en un círculo. Retorna lista de currentFlow."""
    params = {
        "apiKey": HERE_API_KEY,
        "in": f"circle:{lat:.6f},{lon:.6f};r={RADIUS_M}",
        "locationReferencing": "none",  # no necesitamos geometría, solo los flows
    }
    for attempt in range(3):
        try:
            resp = requests.get(FLOW_URL, params=params, timeout=30)
            if resp.status_code == 200:
                results = resp.json().get("results", [])
                return [r["currentFlow"] for r in results if "currentFlow" in r]
            if resp.status_code == 429:  # rate limit
                wait = 5 * (attempt + 1)
                print(f"  WARN: 429 rate limit, esperando {wait}s...")
                time.sleep(wait)
                continue
            print(f"  WARN: HERE → {resp.status_code}: {resp.text[:200]}")
            return []
        except requests.RequestException as exc:
            print(f"  WARN: error de red ({exc}), reintento...")
            time.sleep(3 * (attempt + 1))
    return []


def aggregate(flows: list[dict]) -> dict | None:
    """
    Agrega los segmentos de tráfico. speed/freeFlow de HERE vienen en m/s → km/h.
    Solo cuenta segmentos transitables (traversability=open) con freeFlow válido.
    Retorna None si no hay segmentos usables.
    """
    jams, speeds, frees = [], [], []
    for f in flows:
        if f.get("traversability", "open") != "open":
            continue
        jf = f.get("jamFactor")
        sp = f.get("speed")
        ff = f.get("freeFlow")
        if jf is None or ff is None or ff <= 0:
            continue
        jams.append(jf)
        frees.append(ff * 3.6)
        # speed puede faltar en segmentos cerrados; usa freeFlow como piso
        speeds.append((sp if sp is not None else ff) * 3.6)

    if not jams:
        return None

    speed_kmh = sum(speeds) / len(speeds)
    free_kmh = sum(frees) / len(frees)
    return {
        "jam_avg": round(sum(jams) / len(jams), 2),
        "jam_max": round(max(jams), 2),
        "speed_kmh": round(speed_kmh, 2),
        "free_kmh": round(free_kmh, 2),
        "speed_ratio": round(speed_kmh / free_kmh, 3) if free_kmh > 0 else None,
        "n_seg": len(jams),
    }


def franja_actual() -> str:
    """Deriva la franja desde la hora local de Colombia (UTC-5).
    07±2h → pico_am, 18±2h → pico_pm, resto → valle. Para Airflow (sin --franja).
    """
    hora_cot = (datetime.now(timezone.utc).hour - 5) % 24
    if 6 <= hora_cot <= 9:
        return "pico_am"
    if 16 <= hora_cot <= 19:
        return "pico_pm"
    return "valle"


def run(franja: str | None = None, municipio: str | None = None) -> int:
    """Entry point para Airflow/import. Retorna nº de barrios escritos.
    franja=None → se deriva de la hora (ver franja_actual)."""
    if not HERE_API_KEY:
        raise RuntimeError("falta HERE_API_KEY (env var o .env)")
    franja = franja or franja_actual()

    where = f"WHERE upper(b.municipio) = '{municipio.upper()}'" if municipio else ""
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    cur.execute(CREATE_SQL)
    conn.commit()
    cur.execute(BARRIOS_SQL.format(where=where))
    barrios = cur.fetchall()
    print(f"Muestreando {len(barrios)} barrios | franja={franja} | radio={RADIUS_M}m")

    now = datetime.now(timezone.utc)
    rows, sin_datos = [], 0
    for bid, nombre, municipio_b, lat, lon in barrios:
        agg = aggregate(fetch_flow(lat, lon))
        if agg is None:
            sin_datos += 1
            time.sleep(REQUEST_PAUSE)
            continue
        rows.append({
            "barrio_id": bid, "nombre": nombre, "municipio": municipio_b,
            "franja": franja, "muestreado_en": now, **agg,
        })
        time.sleep(REQUEST_PAUSE)

    if rows:
        psycopg2.extras.execute_batch(cur, UPSERT_SQL, rows, page_size=200)
        conn.commit()
    conn.close()
    print(f"Upsert completado: {len(rows)} barrios | sin datos: {sin_datos}")
    return len(rows)


def self_check():
    """Valida aggregate() sin red ni DB."""
    flows = [
        {"jamFactor": 2.0, "speed": 10.0, "freeFlow": 10.0, "traversability": "open"},
        {"jamFactor": 8.0, "speed": 2.0, "freeFlow": 10.0, "traversability": "open"},
        {"jamFactor": 9.9, "speed": 0.0, "freeFlow": 10.0, "traversability": "closed"},  # ignorado
        {"jamFactor": None, "speed": 5.0, "freeFlow": 10.0, "traversability": "open"},   # ignorado
    ]
    agg = aggregate(flows)
    assert agg["n_seg"] == 2, agg
    assert agg["jam_avg"] == 5.0, agg          # (2+8)/2
    assert agg["jam_max"] == 8.0, agg
    assert agg["speed_kmh"] == 21.6, agg        # ((10+2)/2)*3.6
    assert agg["free_kmh"] == 36.0, agg         # 10*3.6
    assert agg["speed_ratio"] == 0.6, agg       # 21.6/36
    assert aggregate([]) is None
    assert aggregate([{"jamFactor": 1, "freeFlow": 0}]) is None  # freeFlow inválido
    print("self-check OK")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--franja", choices=FRANJAS, help="franja horaria del muestreo")
    parser.add_argument("--municipio", help="filtrar a un municipio (ej: ENVIGADO)")
    parser.add_argument("--dry-run", action="store_true", help="1 barrio, no escribe")
    parser.add_argument("--self-check", action="store_true", help="test offline y sale")
    args = parser.parse_args()

    if args.self_check:
        self_check()
        return

    if not args.franja:
        parser.error("--franja es obligatorio (pico_am | pico_pm | valle)")
    if not HERE_API_KEY:
        sys.exit("ERROR: falta HERE_API_KEY (env var o .env)")

    if args.dry_run:
        where = f"WHERE upper(b.municipio) = '{args.municipio.upper()}'" if args.municipio else ""
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
        cur.execute(BARRIOS_SQL.format(where=where))
        bid, nombre, municipio, lat, lon = cur.fetchone()
        conn.close()
        agg = aggregate(fetch_flow(lat, lon))
        print(f"[dry-run] [{bid}] {nombre}: {agg}")
        return

    run(franja=args.franja, municipio=args.municipio)


if __name__ == "__main__":
    main()
