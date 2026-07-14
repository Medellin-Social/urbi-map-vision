"""
DAG: scrape_listings — extrae listings de Fincaraiz y Metrocuadrado cada 3 días.

Modo incremental: solo procesa los listings publicados en los últimos 4 días
(ventana de 4 días para cubrir el gap entre ejecuciones de 3 días + margen).

Schedule: cada 3 días a las 3:00 AM COT (08:00 UTC)
Tasks:
    t1 — scrape Fincaraiz  (--since-days 4, todos los municipios)
    t2 — load Fincaraiz a DB
    t2b — dedup Fincaraiz (borra duplicados por hash; metrocuadrado dedupa al insertar)
    t3 — scrape Metrocuadrado (--since-days 4, all_valle)
    t4 — refresh analytics cache (enrich_barrios_stats)
    t5 — validar URLs activas (url_activa, ventana 7 días)
"""

import os
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path

from airflow import DAG
from airflow.operators.python import PythonOperator

PROJECT_DIR = Path(__file__).parent.parent.parent  # urbi-map-vision/
SCRIPTS_DIR = PROJECT_DIR / "scripts"
URBI_DIR = Path("/home/edwlearn/urbi")

default_args = {
    "owner": "urbidata",
    "retries": 1,
    "retry_delay": timedelta(minutes=10),
    "email_on_failure": False,
}


def _run(cmd: list[str], cwd: Path) -> None:
    result = subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True)
    if result.stdout:
        print(result.stdout[-4000:])
    if result.stderr:
        print(result.stderr[-2000:], file=sys.stderr)
    if result.returncode != 0:
        raise RuntimeError(f"Command failed ({result.returncode}): {' '.join(cmd)}")


def scrape_fincaraiz() -> None:
    _run(
        [sys.executable, "scrape_fincaraiz.py", "--since-days", "4"],
        cwd=SCRIPTS_DIR,
    )


def load_fincaraiz() -> None:
    _run(
        [sys.executable, "load_medellin_fincaraiz.py"],
        cwd=SCRIPTS_DIR,
    )


def scrape_metrocuadrado() -> None:
    _run(
        [
            sys.executable, "-m", "scraping.metrocuadrado.scraper",
            "--municipios", "all_valle",
            "--max-pages", "200",
            "--since-days", "4",
        ],
        cwd=URBI_DIR,
    )


def refresh_analytics() -> None:
    _run(
        [sys.executable, "enrich_barrios_stats.py"],
        cwd=SCRIPTS_DIR,
    )


# Misma fórmula de hash que scripts/sql/dedup_cleanup.sql. El loader hace
# ON CONFLICT (url), así que el mismo inmueble re-publicado con otra URL
# entra duplicado; aquí se borra conservando el id más alto (más reciente).
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


def dedup_fincaraiz() -> None:
    import psycopg2

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
    finally:
        conn.close()


def validate_urls() -> None:
    # ponytail: batch 3000 ≈ 9k urls/semana; si el backlog activo supera eso,
    # subir batch o mover a DAG diario propio
    _run(
        [sys.executable, "validate_listings_urls.py", "--batch", "3000"],
        cwd=SCRIPTS_DIR,
    )


with DAG(
    dag_id="scrape_listings",
    default_args=default_args,
    description="Scraping incremental de Fincaraiz + Metrocuadrado cada 3 días",
    schedule_interval="0 8 */3 * *",   # 3:00 AM COT = 08:00 UTC, cada 3 días
    start_date=datetime(2026, 6, 1),
    catchup=False,
    tags=["listings", "scraping", "fincaraiz", "metrocuadrado"],
    max_active_runs=1,
) as dag:

    t1 = PythonOperator(
        task_id="scrape_fincaraiz",
        python_callable=scrape_fincaraiz,
        execution_timeout=timedelta(hours=2),
    )

    t2 = PythonOperator(
        task_id="load_fincaraiz_db",
        python_callable=load_fincaraiz,
        execution_timeout=timedelta(minutes=30),
    )

    t3 = PythonOperator(
        task_id="scrape_metrocuadrado",
        python_callable=scrape_metrocuadrado,
        execution_timeout=timedelta(hours=3),
    )

    t2b = PythonOperator(
        task_id="dedup_fincaraiz",
        python_callable=dedup_fincaraiz,
        execution_timeout=timedelta(minutes=10),
    )

    t4 = PythonOperator(
        task_id="refresh_analytics",
        python_callable=refresh_analytics,
        execution_timeout=timedelta(minutes=20),
    )

    t5 = PythonOperator(
        task_id="validate_urls",
        python_callable=validate_urls,
        execution_timeout=timedelta(hours=1),
    )

    # fincaraiz: scrape → load → dedup → analytics
    # metrocuadrado: scrape → analytics (dedupa al insertar)
    # analytics espera ambos; validación de URLs al final
    t1 >> t2 >> t2b >> t4
    t3 >> t4
    t4 >> t5
