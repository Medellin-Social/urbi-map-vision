"""
Computa el PERFIL de tráfico estático desde raw.trafico_muestras y lo escribe
en analytics.barrios_trafico_perfil. Correr al final de una campaña de muestreo
(scripts/trafico_muestrear.py), luego apagar el muestreo.

Produce, por barrio:
  nivel_trafico    bajo | medio | alto   (tercil de jam_avg entre barrios)
  jam_prom         jamFactor promedio del barrio (0-10)
  pico_am/pm       ventana pico heredada de la ZONA del barrio (horas COT)

La ventana pico se detecta a nivel zona (muestreo horario, solo días hábiles):
la hora del máximo jam en cada mitad del día, expandida a las horas contiguas
que siguen congestionadas. Si no hay pico claro (curva plana) → NULL.

Uso:
  python scripts/compute_trafico_perfil.py
  python scripts/compute_trafico_perfil.py --self-check   # test detección offline
"""

import argparse
import os
import sys
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")
DB_URL = os.getenv("DATABASE_URL", "postgresql://urbidata:urbidata007@localhost:5433/urbidata")

# Detección de ventana pico
AMP_MIN = 0.5      # amplitud mínima (jam) para considerar que hay pico real
FACTOR = 0.6       # umbral = baseline + FACTOR*(pico - baseline)

CREATE_SQL = """
CREATE TABLE IF NOT EXISTS analytics.barrios_trafico_perfil (
    barrio_id        integer PRIMARY KEY,
    nombre_barrio    text,
    zona             text,
    nivel_trafico    text,           -- bajo | medio | alto
    jam_prom         numeric(4,2),
    speed_ratio_prom numeric(4,3),
    pico_am_inicio   smallint,
    pico_am_fin      smallint,
    pico_pm_inicio   smallint,
    pico_pm_fin      smallint,
    n_muestras       integer,
    calculado_en     timestamptz DEFAULT now()
);
"""

# Promedio por (zona, hora) solo días hábiles (dow 0-4) → curva diaria de la zona.
ZONA_HORA_SQL = """
SELECT zona, hora_local, AVG(jam_avg)::float AS jam
FROM raw.trafico_muestras
WHERE punto_tipo = 'zona' AND dow BETWEEN 0 AND 4 AND jam_avg IS NOT NULL
GROUP BY zona, hora_local
"""

# Promedio por barrio (días hábiles) → intensidad.
BARRIO_SQL = """
SELECT punto_id::int AS barrio_id, MAX(nombre) AS nombre, MAX(zona) AS zona,
       AVG(jam_avg)::float AS jam_prom,
       AVG(speed_ratio)::float AS ratio_prom,
       COUNT(*) AS n
FROM raw.trafico_muestras
WHERE punto_tipo = 'barrio' AND dow BETWEEN 0 AND 4 AND jam_avg IS NOT NULL
GROUP BY punto_id
"""

UPSERT_SQL = """
INSERT INTO analytics.barrios_trafico_perfil (
    barrio_id, nombre_barrio, zona, nivel_trafico, jam_prom, speed_ratio_prom,
    pico_am_inicio, pico_am_fin, pico_pm_inicio, pico_pm_fin, n_muestras, calculado_en
) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, now())
ON CONFLICT (barrio_id) DO UPDATE SET
    nombre_barrio=EXCLUDED.nombre_barrio, zona=EXCLUDED.zona,
    nivel_trafico=EXCLUDED.nivel_trafico, jam_prom=EXCLUDED.jam_prom,
    speed_ratio_prom=EXCLUDED.speed_ratio_prom,
    pico_am_inicio=EXCLUDED.pico_am_inicio, pico_am_fin=EXCLUDED.pico_am_fin,
    pico_pm_inicio=EXCLUDED.pico_pm_inicio, pico_pm_fin=EXCLUDED.pico_pm_fin,
    n_muestras=EXCLUDED.n_muestras, calculado_en=now()
"""


def detectar_ventanas(por_hora: dict[int, float]) -> tuple:
    """Dado {hora: jam_promedio} de una zona, retorna
    (am_ini, am_fin, pm_ini, pm_fin). None si no hay pico claro en esa mitad.
    Pico = hora del máximo + horas contiguas por encima del umbral."""
    if not por_hora:
        return (None, None, None, None)
    baseline = min(por_hora.values())

    def ventana(horas) -> tuple:
        sub = {h: por_hora[h] for h in horas if h in por_hora}
        if not sub:
            return (None, None)
        hmax = max(sub, key=sub.get)
        amp = sub[hmax] - baseline
        if amp < AMP_MIN:               # curva plana → sin pico
            return (None, None)
        thr = baseline + FACTOR * amp
        ini = fin = hmax
        while (ini - 1) in sub and sub[ini - 1] >= thr:
            ini -= 1
        while (fin + 1) in sub and sub[fin + 1] >= thr:
            fin += 1
        return (ini, fin)

    return ventana(range(5, 12)) + ventana(range(12, 22))  # AM 5-11, PM 12-21


def nivel_por_tercil(valores: list[float]) -> callable:
    """Retorna fn(jam)->nivel usando terciles de la distribución observada.
    Calibra al dataset real en vez de umbrales mágicos."""
    if not valores:
        return lambda _: "medio"
    s = sorted(valores)
    t1 = s[len(s) // 3]
    t2 = s[2 * len(s) // 3]
    return lambda j: "bajo" if j <= t1 else ("alto" if j > t2 else "medio")


def self_check():
    # Mañana pico 7-8, tarde pico 18, resto bajo
    curva = {5: 1.0, 6: 1.5, 7: 4.0, 8: 3.8, 9: 2.0, 10: 1.2, 11: 1.0,
             12: 1.0, 13: 1.1, 17: 2.5, 18: 4.2, 19: 3.9, 20: 1.5}
    am_i, am_f, pm_i, pm_f = detectar_ventanas(curva)
    assert (am_i, am_f) == (7, 8), (am_i, am_f)
    assert (pm_i, pm_f) == (18, 19), (pm_i, pm_f)
    # Curva plana → sin pico
    plana = {h: 1.0 for h in range(5, 22)}
    assert detectar_ventanas(plana) == (None, None, None, None)
    # Terciles
    nivel = nivel_por_tercil([1, 2, 3, 4, 5, 6])  # t1=3, t2=5
    assert nivel(1) == "bajo" and nivel(6) == "alto" and nivel(4) == "medio"
    print("self-check OK")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--self-check", action="store_true")
    args = p.parse_args()
    if args.self_check:
        self_check()
        return

    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    cur.execute(CREATE_SQL)
    conn.commit()

    # 1) ventanas pico por zona
    cur.execute(ZONA_HORA_SQL)
    curvas: dict[str, dict[int, float]] = {}
    for zona, hora, jam in cur.fetchall():
        curvas.setdefault(zona, {})[int(hora)] = jam
    ventanas = {z: detectar_ventanas(c) for z, c in curvas.items()}
    print(f"Zonas con curva: {len(ventanas)}")

    # 2) intensidad por barrio
    cur.execute(BARRIO_SQL)
    barrios = cur.fetchall()
    if not barrios:
        print("Sin muestras de barrios. Corre la campaña primero.")
        conn.close()
        return
    nivel = nivel_por_tercil([b[3] for b in barrios])

    rows = []
    for barrio_id, nombre, zona, jam_prom, ratio_prom, n in barrios:
        am_i, am_f, pm_i, pm_f = ventanas.get(zona, (None, None, None, None))
        rows.append((
            barrio_id, nombre, zona, nivel(jam_prom), round(jam_prom, 2),
            round(ratio_prom, 3) if ratio_prom is not None else None,
            am_i, am_f, pm_i, pm_f, n,
        ))
    cur.executemany(UPSERT_SQL, rows)
    conn.commit()
    conn.close()
    print(f"Perfil escrito: {len(rows)} barrios")


if __name__ == "__main__":
    main()
