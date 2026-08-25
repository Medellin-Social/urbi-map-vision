"""
AirROI fetch por barrios + dbt (barrios_airbnb_real, score_corto_plazo).
Puerto de airflow/dags/airbnb_semanal.py.

Run: python scripts/run_airbnb_semanal.py
"""
import subprocess
import sys
import time
from pathlib import Path

SCRIPTS_DIR = Path(__file__).parent


def fetch_airroi() -> bool:
    print("[airbnb_semanal] START fetch_airroi_barrios", flush=True)
    t0 = time.time()
    try:
        from scraping.airbnb.airroi_client import AirROIClient, ensure_table, save_records

        ensure_table()
        client = AirROIClient()
        records = client.run()
        if not records:
            raise ValueError("AirROI devolvió 0 registros — verificar API key y créditos.")
        saved = save_records(records)
        print(f"[airbnb_semanal] OK    fetch_airroi_barrios — {saved} barrios ({time.time()-t0:.1f}s)", flush=True)
        return True
    except Exception as exc:
        print(f"[airbnb_semanal] FAIL  fetch_airroi_barrios: {exc}", flush=True)
        return False


def dbt(label: str, select: list[str]) -> bool:
    print(f"[airbnb_semanal] START {label}", flush=True)
    t0 = time.time()
    result = subprocess.run(
        [sys.executable, str(SCRIPTS_DIR / "dbt_run.py"), "run", "--select", *select],
    )
    ok = result.returncode == 0
    print(f"[airbnb_semanal] {'OK' if ok else 'FAIL'}    {label} ({time.time()-t0:.1f}s)", flush=True)
    return ok


def main() -> int:
    failed: list[str] = []
    if not fetch_airroi():
        failed.append("fetch_airroi_barrios")
    if not dbt("dbt_barrios_airbnb_real", ["barrios_airbnb_real"]):
        failed.append("dbt_barrios_airbnb_real")
    if not dbt("dbt_score_corto_consolidado", ["score_corto_plazo", "barrios_score_consolidado"]):
        failed.append("dbt_score_corto_consolidado")

    if failed:
        print(f"[airbnb_semanal] DONE con fallas: {failed}", file=sys.stderr, flush=True)
        return 1
    print("[airbnb_semanal] DONE — todos los pasos OK", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
