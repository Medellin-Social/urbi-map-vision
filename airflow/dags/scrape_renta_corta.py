"""
DAG: scrape_renta_corta — Airbnb + VRBO (renta corta) cada 3 días.

Schedule: cada 3 días a las 4:00 AM COT (09:00 UTC), 1h después de
scrape_listings para no competir por CPU/memoria con esos scrapers.

Tasks (paralelas, escriben a tablas distintas):
    airbnb — scraping/renta_media/airbnb_mensual_scraper.py → raw.listings_renta_media
             --detail-limit 150: visita páginas de detalle para campos ricos
             (coords faltantes primero)
    vrbo   — scraping/vrbo/vrbo_scraper.py → raw.listings_premium
"""

import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path

from airflow import DAG
from airflow.operators.python import PythonOperator

PROJECT_DIR = Path(__file__).parent.parent.parent  # urbi-map-vision/

default_args = {
    "owner": "social",
    "retries": 1,
    "retry_delay": timedelta(minutes=15),
    "email_on_failure": False,
}


def _run(cmd: list[str]) -> None:
    result = subprocess.run(cmd, cwd=str(PROJECT_DIR), capture_output=True, text=True)
    if result.stdout:
        print(result.stdout[-4000:])
    if result.stderr:
        print(result.stderr[-2000:], file=sys.stderr)
    if result.returncode != 0:
        raise RuntimeError(f"Command failed ({result.returncode}): {' '.join(cmd)}")


def scrape_airbnb() -> None:
    _run([
        sys.executable, "scraping/renta_media/airbnb_mensual_scraper.py",
        "--detail-limit", "50",  # reduced from 150 — Playwright crashes on long runs in container
    ])


def scrape_vrbo() -> None:
    _run([sys.executable, "scraping/vrbo/vrbo_scraper.py"])


with DAG(
    dag_id="scrape_renta_corta",
    default_args=default_args,
    description="Airbnb + VRBO renta corta cada 3 días",
    schedule_interval="0 9 */3 * *",  # 4:00 AM COT = 09:00 UTC, cada 3 días
    start_date=datetime(2026, 7, 1),
    catchup=False,
    tags=["renta_corta", "airbnb", "vrbo", "scraping"],
    max_active_runs=1,
) as dag:

    t_airbnb = PythonOperator(
        task_id="scrape_airbnb",
        python_callable=scrape_airbnb,
        execution_timeout=timedelta(hours=4),
    )

    t_vrbo = PythonOperator(
        task_id="scrape_vrbo",
        python_callable=scrape_vrbo,
        execution_timeout=timedelta(hours=2),
    )
