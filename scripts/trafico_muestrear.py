"""
Muestreador de tráfico para CARACTERIZACIÓN (no stream, no histórico infinito).

Acumula muestras de jamFactor por hora-del-día en raw.trafico_muestras.
Corre durante una CAMPAÑA temporal (~1-2 semanas), luego se computa el perfil
(scripts/compute_trafico_perfil.py) y se apaga. Reusa fetch_flow/aggregate de
load_traffic_here (HERE Traffic Flow v7, sin GCP).

Dos conjuntos de puntos (--set):
  zonas    25 zonas (comuna Medellín + municipio resto). Barato, horario →
           sirve para detectar la VENTANA pico (a qué horas trancó la zona).
  barrios  610 barrios. Caro → correr 1 franja/día para medir INTENSIDAD.

Presupuesto free tier (~1000 req/día): zonas=25/hora, barrios=610/corrida.
Nunca correr ambos el mismo día si suma > cuota.

Uso:
  python scripts/trafico_muestrear.py --set zonas     # correr cada hora (DAG)
  python scripts/trafico_muestrear.py --set barrios   # 1 vez/día
  python scripts/trafico_muestrear.py --set zonas --dry-run
"""

import argparse
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import psycopg2
import psycopg2.extras

sys.path.insert(0, str(Path(__file__).parent.parent))
from scripts.load_traffic_here import (  # reusa el core
    DB_URL, HERE_API_KEY, RADIUS_M, REQUEST_PAUSE, aggregate, fetch_flow,
)

# Guarda de presupuesto: aborta si un set excede esto (evita quemar cuota free)
MAX_PUNTOS = 700

CREATE_SQL = """
CREATE TABLE IF NOT EXISTS raw.trafico_muestras (
    id            bigserial PRIMARY KEY,
    punto_tipo    text NOT NULL,       -- 'zona' | 'barrio'
    punto_id      text NOT NULL,       -- zona=nombre, barrio=id
    nombre        text,
    zona          text,
    hora_local    smallint NOT NULL,   -- 0-23 hora Colombia (UTC-5)
    dow           smallint NOT NULL,   -- 0=lunes .. 6=domingo
    jam_avg       numeric(4,2),
    jam_max       numeric(4,2),
    speed_ratio   numeric(4,3),
    n_segmentos   integer,
    muestreado_en timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_trafico_muestras_lookup
    ON raw.trafico_muestras (punto_tipo, punto_id, hora_local);
"""

# zona = comuna (Medellín) o municipio (resto). Centroide del conjunto de barrios.
ZONAS_SQL = """
SELECT z AS punto_id, z AS nombre, z AS zona,
       ST_Y(ST_Centroid(ST_Collect(geometry))) AS lat,
       ST_X(ST_Centroid(ST_Collect(geometry))) AS lon
FROM (SELECT COALESCE(NULLIF(comuna,''), municipio) AS z, geometry FROM raw.barrios) s
GROUP BY z
"""

BARRIOS_SQL = """
SELECT b.id::text,
       b.nombre,
       COALESCE(NULLIF(b.comuna,''), b.municipio) AS zona,
       ST_Y(ST_Centroid(b.geometry)) AS lat,
       ST_X(ST_Centroid(b.geometry)) AS lon
FROM raw.barrios b
{where}
ORDER BY b.id
"""

INSERT_SQL = """
INSERT INTO raw.trafico_muestras (
    punto_tipo, punto_id, nombre, zona, hora_local, dow,
    jam_avg, jam_max, speed_ratio, n_segmentos, muestreado_en
) VALUES (
    %(punto_tipo)s, %(punto_id)s, %(nombre)s, %(zona)s, %(hora_local)s, %(dow)s,
    %(jam_avg)s, %(jam_max)s, %(speed_ratio)s, %(n_seg)s, %(muestreado_en)s
)
"""


def puntos(cur, tipo: str, municipio: str | None = None) -> list[tuple]:
    """(punto_id, nombre, zona, lat, lon) para el set pedido."""
    if tipo == "zonas":
        cur.execute(ZONAS_SQL)
    else:
        where = f"WHERE upper(b.municipio) = '{municipio.upper()}'" if municipio else ""
        cur.execute(BARRIOS_SQL.format(where=where))
    return cur.fetchall()


def run(tipo: str, municipio: str | None = None, dry_run: bool = False) -> int:
    if not HERE_API_KEY:
        raise RuntimeError("falta HERE_API_KEY (env var o .env)")

    now = datetime.now(timezone.utc)
    cot = now - timedelta(hours=5)             # COT = UTC-5
    hora_local = cot.hour
    dow = cot.weekday()                        # 0=lunes .. 6=domingo

    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    cur.execute(CREATE_SQL)
    conn.commit()

    pts = puntos(cur, tipo, municipio)
    if len(pts) > MAX_PUNTOS:
        conn.close()
        raise RuntimeError(f"{len(pts)} puntos > MAX_PUNTOS={MAX_PUNTOS}, abortando por cuota")
    print(f"Muestreando {len(pts)} {tipo} | hora_local={hora_local} dow={dow}")

    rows, sin_datos = [], 0
    for pid, nombre, zona, lat, lon in pts:
        agg = aggregate(fetch_flow(lat, lon))
        if agg is None:
            sin_datos += 1
            time.sleep(REQUEST_PAUSE)
            continue
        rows.append({
            "punto_tipo": tipo[:-1],  # 'zonas'->'zona', 'barrios'->'barrio'
            "punto_id": str(pid), "nombre": nombre, "zona": zona,
            "hora_local": hora_local, "dow": dow, "muestreado_en": now, **agg,
        })
        time.sleep(REQUEST_PAUSE)

    if dry_run:
        print(f"[dry-run] {len(rows)} muestras (no escritas). Sin datos: {sin_datos}")
        conn.close()
        return len(rows)

    if rows:
        psycopg2.extras.execute_batch(cur, INSERT_SQL, rows, page_size=200)
        conn.commit()
    conn.close()
    print(f"Insertadas {len(rows)} muestras | sin datos: {sin_datos}")
    return len(rows)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--set", dest="conjunto", choices=("zonas", "barrios"), required=True)
    p.add_argument("--municipio", help="filtrar barrios a un municipio (solo --set barrios)")
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()
    run(args.conjunto, municipio=args.municipio, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
