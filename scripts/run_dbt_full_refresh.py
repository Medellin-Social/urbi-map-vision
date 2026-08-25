"""
Rebuild completo de todos los modelos dbt (analytics + staging) + test suite.
Puerto de airflow/dags/dbt_full_refresh_semanal.py.

Run: python scripts/run_dbt_full_refresh.py
"""
import subprocess
import sys
import time
from pathlib import Path

SCRIPTS_DIR = Path(__file__).parent


def _dbt(label: str, args: list[str]) -> bool:
    print(f"[dbt_full_refresh] START {label}", flush=True)
    t0 = time.time()
    result = subprocess.run([sys.executable, str(SCRIPTS_DIR / "dbt_run.py"), *args])
    ok = result.returncode == 0
    print(f"[dbt_full_refresh] {'OK' if ok else 'FAIL'}    {label} ({time.time()-t0:.1f}s)", flush=True)
    return ok


def main() -> int:
    failed: list[str] = []
    if not _dbt("dbt_full_refresh", ["run", "--full-refresh"]):
        failed.append("dbt_full_refresh")
    if not _dbt("dbt_test", ["test"]):
        failed.append("dbt_test")

    if failed:
        print(f"[dbt_full_refresh] DONE con fallas: {failed}", file=sys.stderr, flush=True)
        return 1
    print("[dbt_full_refresh] DONE — todos los pasos OK", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
