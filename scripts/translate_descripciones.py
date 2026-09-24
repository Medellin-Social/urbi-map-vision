"""Batch offline: traduce descripciones es->en y las guarda en
raw.descripcion_traduccion (keyed por url). Idempotente e incremental —
solo toca filas nuevas o cuya descripción fuente cambió (src_hash).

Fuentes = las 3 tablas cuya descripción sirve el detalle
(COALESCE lm/lf/lp.descripcion en listings.py): metrocuadrado, fincaraiz, premium.

Corre en el cron (Dockerfile.cron). Traductor = Opus-MT/CTranslate2 offline
(scripts/traductor.py), cero costo por llamada.

Uso:  python scripts/translate_descripciones.py [--limit 200] [--max 100000]
"""
import argparse
import os
import sys

import psycopg2
import psycopg2.extras

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from traductor import translate_pairs  # noqa: E402

DB_URL = os.environ.get("DATABASE_URL", "postgresql://social:urbidata007@localhost:5433/social")
SOURCES = ("listings_metrocuadrado", "listings_fincaraiz", "listings_premium")

# md5(descripcion) se calcula en SQL tanto para filtrar como para guardar → el
# hash almacenado y el de comparación siempre coinciden (no mezclar con hashlib).
SELECT_PENDING = """
    SELECT s.url, s.descripcion, md5(s.descripcion) AS h
    FROM raw.{tbl} s
    LEFT JOIN raw.descripcion_traduccion dt ON dt.url = s.url
    WHERE s.descripcion IS NOT NULL
      AND length(btrim(s.descripcion)) >= 20
      AND (dt.url IS NULL OR dt.src_hash IS DISTINCT FROM md5(s.descripcion))
    LIMIT %s
"""

UPSERT = """
    INSERT INTO raw.descripcion_traduccion (url, src_lang, descripcion_trad, src_hash)
    VALUES %s
    ON CONFLICT (url) DO UPDATE
      SET src_lang         = EXCLUDED.src_lang,
          descripcion_trad = EXCLUDED.descripcion_trad,
          src_hash         = EXCLUDED.src_hash,
          updated_at       = NOW()
"""


def run(limit: int, max_rows: int) -> None:
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    total = 0
    try:
        for tbl in SOURCES:
            while total < max_rows:
                with conn.cursor() as cur:
                    cur.execute(SELECT_PENDING.format(tbl=tbl), (min(limit, max_rows - total),))
                    rows = cur.fetchall()
                if not rows:
                    break
                urls = [r[0] for r in rows]
                descs = [r[1] for r in rows]
                hashes = [r[2] for r in rows]
                pairs = translate_pairs(descs)  # [(trad_al_opuesto, src_lang), ...]
                values = [(u, src, trad, h) for u, (trad, src), h in zip(urls, pairs, hashes)]
                with conn.cursor() as cur:
                    psycopg2.extras.execute_values(cur, UPSERT, values)
                conn.commit()  # commit por lote: progreso persiste, sin locks largos
                total += len(rows)
                print(f"[{tbl}] +{len(rows)} (total {total})", flush=True)
        print(f"OK: {total} descripciones traducidas", flush=True)
    finally:
        conn.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=200, help="filas por lote")
    ap.add_argument("--max", type=int, default=200_000, help="tope total por corrida")
    a = ap.parse_args()
    run(a.limit, a.max)
