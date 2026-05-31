"""
Compute and upsert analytics.barrios_oportunidades from real analytics data.

Criteria (in priority order — first match wins per barrio):
  ALTO RENDIMIENTO   yield_bruto >= 8%
  PRECIO BAJO        estado_precio IN ('OFERTA', 'POI_OFERTA')
  INVERSIÓN SEGURA   score_largo >= 70 AND liquidez_score >= 60

Barrios that don't meet any criterion → oportunidad_detectada = FALSE.

Run after analytics tables are updated:
  python scripts/compute_oportunidades.py
  python scripts/compute_oportunidades.py --dry-run
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://urbidata:urbidata007@localhost:5433/urbidata",
)

YIELD_THRESHOLD = 8.0
SCORE_LARGO_THRESHOLD = 70
LIQUIDEZ_THRESHOLD = 60

_DESCRIPTIONS = {
    "ALTO RENDIMIENTO": "Yield bruto ≥ {yield:.1f}% — por encima del promedio del mercado.",
    "PRECIO BAJO MERCADO": "Precio por m² por debajo del índice de mercado.",
    "INVERSIÓN SEGURA": "Score largo plazo alto y buena liquidez estimada.",
}

_QUERY = """
SELECT
    b.id                AS barrio_id,
    b.nombre            AS nombre_barrio,
    b.comuna,
    b.municipio,
    bm.yield_bruto      AS yield_bruto,
    bm.estado_precio,
    sc.score_largo,
    lq.liquidez_score
FROM raw.barrios b
LEFT JOIN analytics.barrios_mercado           bm ON b.id = bm.barrio_id
LEFT JOIN analytics.barrios_score_consolidado sc ON b.id = sc.barrio_id
LEFT JOIN analytics.barrios_liquidez          lq ON b.id = lq.barrio_id
"""

_INSERT = """
INSERT INTO analytics.barrios_oportunidades
    (barrio_id, nombre_barrio, comuna, municipio,
     oportunidad_detectada, tipo_oportunidad, descripcion_oportunidad,
     estado_precio, score_largo, liquidez_score, yield_bruto_pct, calculado_en)
VALUES
    (%(barrio_id)s, %(nombre_barrio)s, %(comuna)s, %(municipio)s,
     %(oportunidad_detectada)s, %(tipo_oportunidad)s, %(descripcion_oportunidad)s,
     %(estado_precio)s, %(score_largo)s, %(liquidez_score)s, %(yield_bruto_pct)s,
     NOW())
"""


def classify(row: dict) -> tuple[bool, str | None, str | None]:
    yield_bruto = row["yield_bruto"]
    estado = row["estado_precio"]
    score_largo = row["score_largo"]
    liquidez = row["liquidez_score"]

    if yield_bruto is not None and yield_bruto >= YIELD_THRESHOLD:
        desc = _DESCRIPTIONS["ALTO RENDIMIENTO"].format(**{"yield": float(yield_bruto)})
        return True, "ALTO RENDIMIENTO", desc

    if estado in ("OFERTA", "POI_OFERTA"):
        return True, "PRECIO BAJO MERCADO", _DESCRIPTIONS["PRECIO BAJO MERCADO"]

    if (score_largo is not None and score_largo >= SCORE_LARGO_THRESHOLD
            and liquidez is not None and liquidez >= LIQUIDEZ_THRESHOLD):
        return True, "INVERSIÓN SEGURA", _DESCRIPTIONS["INVERSIÓN SEGURA"]

    return False, None, None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    if not args.dry_run:
        pass  # table already exists; schema managed externally

    cur.execute(_QUERY)
    rows = cur.fetchall()
    print(f"Barrios found: {len(rows)}")

    detected = 0
    records = []
    for row in rows:
        detectada, tipo, desc = classify(dict(row))
        if detectada:
            detected += 1
        records.append({
            "barrio_id": row["barrio_id"],
            "nombre_barrio": row["nombre_barrio"],
            "comuna": row["comuna"],
            "municipio": row["municipio"],
            "oportunidad_detectada": detectada,
            "tipo_oportunidad": tipo,
            "descripcion_oportunidad": desc,
            "estado_precio": row["estado_precio"],
            "score_largo": row["score_largo"],
            "liquidez_score": row["liquidez_score"],
            "yield_bruto_pct": float(row["yield_bruto"]) if row["yield_bruto"] is not None else None,
        })

    if args.dry_run:
        for r in records:
            if r["oportunidad_detectada"]:
                print(f"  {r['nombre_barrio']} ({r['municipio']}): {r['tipo_oportunidad']}")
        print(f"\nDry-run: {detected}/{len(rows)} oportunidades detected")
        conn.close()
        return

    cur.execute("TRUNCATE TABLE analytics.barrios_oportunidades")
    psycopg2.extras.execute_batch(cur, _INSERT, records, page_size=100)
    conn.commit()
    conn.close()

    print(f"Upserted {len(records)} rows — {detected} oportunidades detected")

    by_tipo: dict[str, int] = {}
    for r in records:
        if r["oportunidad_detectada"] and r["tipo_oportunidad"]:
            by_tipo[r["tipo_oportunidad"]] = by_tipo.get(r["tipo_oportunidad"], 0) + 1
    for t, c in sorted(by_tipo.items()):
        print(f"  {t}: {c}")


if __name__ == "__main__":
    main()
