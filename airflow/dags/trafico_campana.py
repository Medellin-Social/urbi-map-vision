"""
DAGs de CAMPAÑA de caracterización de tráfico (HERE Flow, sin GCP).
Corren ~2 semanas, luego se computa el perfil y se PAUSAN (no son permanentes).

Presupuesto free tier HERE (~1000 req/día — verificar en portal):
  zonas   25 req/hora × 17h  ≈ 425 req/día
  barrios 610 req por corrida, 1 franja/día (rota por día de semana)
En días que se cruzan zonas+barrios suma ~1035. Si tu cuota es 1000 justos,
baja las horas de zonas (ej. cada 2h) — ver schedule abajo.
# ponytail: horas hardcodeadas COT→UTC(+5); si cambia la cuota, ajustar crons.

Al terminar la campaña:
  python scripts/compute_trafico_perfil.py   → analytics.barrios_trafico_perfil
  luego pausar estos DAGs en la UI de Airflow.
"""
from datetime import datetime, timedelta

from airflow import DAG
from airflow.operators.python import PythonOperator

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from scripts.trafico_muestrear import run as muestrear

default_args = {
    "owner": "social",
    "retries": 1,
    "retry_delay": timedelta(minutes=3),
    "email_on_failure": False,
}
COMMON = dict(
    default_args=default_args,
    start_date=datetime(2026, 1, 1),
    catchup=False,
    tags=["trafico", "campana"],
)

# Fase A: ventana pico por zona. Horario 5am-9pm COT (10:00-02:00 UTC).
with DAG(
    dag_id="trafico_campana_zonas",
    description="Muestreo horario por zona (detecta ventana pico)",
    schedule_interval="0 10-23,0-2 * * *",
    **COMMON,
) as dag_zonas:
    PythonOperator(task_id="muestrear_zonas", python_callable=muestrear, op_args=["zonas"])

# Fase B: intensidad por barrio. 1 franja/día, rotada por día de semana para
# cubrir am/pm/valle sin pasar de ~610 req/día.
BARRIO_SCHEDULES = {
    "am":    "0 12 * * 1,4",   # 7am COT lun/jue
    "pm":    "0 23 * * 2,5",   # 6pm COT mar/vie
    "valle": "0 20 * * 3,6",   # 3pm COT mié/sáb
}
for franja, cron in BARRIO_SCHEDULES.items():
    with DAG(
        dag_id=f"trafico_campana_barrios_{franja}",
        description=f"Muestreo barrios franja {franja}",
        schedule_interval=cron,
        **COMMON,
    ) as d:
        PythonOperator(task_id="muestrear_barrios", python_callable=muestrear, op_args=["barrios"])
        globals()[f"dag_barrios_{franja}"] = d
