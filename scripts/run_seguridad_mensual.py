"""
Carga datos de seguridad (raw.criminalidad) + dbt score largo plazo.
Puerto de airflow/dags/seguridad_mensual.py.

Run: python scripts/run_seguridad_mensual.py
"""
import subprocess
import sys
import time
from pathlib import Path

SCRIPTS_DIR = Path(__file__).parent


def _run(label: str, cmd: list[str]) -> bool:
    print(f"[seguridad_mensual] START {label}", flush=True)
    t0 = time.time()
    result = subprocess.run(cmd, cwd=str(SCRIPTS_DIR))
    ok = result.returncode == 0
    print(f"[seguridad_mensual] {'OK' if ok else 'FAIL'}    {label} ({time.time()-t0:.1f}s)", flush=True)
    return ok


def main() -> int:
    failed: list[str] = []
    if not _run("load_seguridad", [sys.executable, "load_seguridad.py"]):
        failed.append("load_seguridad")
    if not _run("dbt_seguridad_scores", [
        sys.executable, str(SCRIPTS_DIR / "dbt_run.py"), "run",
        "--select", "barrios_seguridad", "score_largo_plazo", "barrios_score_consolidado",
    ]):
        failed.append("dbt_seguridad_scores")

    if failed:
        print(f"[seguridad_mensual] DONE con fallas: {failed}", file=sys.stderr, flush=True)
        return 1
    print("[seguridad_mensual] DONE — todos los pasos OK", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
