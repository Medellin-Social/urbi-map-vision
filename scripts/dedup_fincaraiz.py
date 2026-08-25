"""
Borra duplicados en raw.listings_fincaraiz. El loader hace ON CONFLICT (url),
así que el mismo inmueble re-publicado con otra URL entra duplicado — este
hash agrupa por características reales del inmueble (mismo fórmula que
scripts/sql/dedup_cleanup.sql) y conserva el id más alto (más reciente).
Metrocuadrado dedupa al insertar, no necesita este paso.

Puerto de airflow/dags/scrape_listings.py (dedup_fincaraiz task).

Run: python scripts/dedup_fincaraiz.py
"""
import os
import sys

import psycopg2

_DEDUP_HASH_EXPR = """MD5(
    LOWER(TRIM(COALESCE(barrio_raw, ''))) || '|' ||
    COALESCE(tipo_inmueble, '') || '|' ||
    COALESCE(tipo_operacion, '') || '|' ||
    COALESCE(habitaciones, 0)::text || '|' ||
    COALESCE(banos, 0)::text || '|' ||
    ROUND(COALESCE(area_m2, 0))::text || '|' ||
    CASE COALESCE(tipo_operacion, '')
        WHEN 'arriendo' THEN (ROUND(COALESCE(precio, 0) / 500000)  * 500000)::text
        ELSE                 (ROUND(COALESCE(precio, 0) / 10000000) * 10000000)::text
    END
)"""


def main() -> int:
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn, conn.cursor() as cur:
            cur.execute(f"""
                DELETE FROM raw.listings_fincaraiz
                WHERE id IN (
                    SELECT id FROM (
                        SELECT id, ROW_NUMBER() OVER (
                            PARTITION BY {_DEDUP_HASH_EXPR} ORDER BY id DESC
                        ) AS rn
                        FROM raw.listings_fincaraiz
                    ) x WHERE rn > 1
                )
            """)
            print(f"[dedup_fincaraiz] {cur.rowcount} duplicados eliminados")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
