"""
DAG: scrape_listings — extrae listings de Fincaraiz y Metrocuadrado cada 3 días.

Modo incremental: solo procesa los listings publicados en los últimos 4 días
(ventana de 4 días para cubrir el gap entre ejecuciones de 3 días + margen).

Schedule: cada 3 días a las 3:00 AM COT (08:00 UTC)
Tasks:
    t1 — scrape Fincaraiz  (--since-days 4, todos los municipios)
    t2 — load Fincaraiz a DB
    t3 — scrape Metrocuadrado (--since-days 4, all_valle)
    t4 — refresh analytics cache (enrich_barrios_stats)
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

    t4 = PythonOperator(
        task_id="refresh_analytics",
        python_callable=refresh_analytics,
        execution_timeout=timedelta(minutes=20),
    )

    # fincaraiz: scrape → load → analytics
    # metrocuadrado: scrape → analytics
    # analytics waits for both loaders
    t1 >> t2 >> t4
    t3 >> t4
