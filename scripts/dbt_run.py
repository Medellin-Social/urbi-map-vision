"""
Invoca dbt contra la DB de prod desde el cron de Railway.

dbt/profiles.yml (target prod) espera POSTGRES_HOST/PORT/USER/PASSWORD/DB
discretos — Railway solo inyecta DATABASE_URL. Se parsea una vez acá para
que ningún runner tenga que repetir el shim.

Usage:
  python scripts/dbt_run.py run
  python scripts/dbt_run.py run --full-refresh
  python scripts/dbt_run.py run --select score_largo_plazo barrios_score_consolidado
  python scripts/dbt_run.py test
"""
import os
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse

DBT_DIR = Path(__file__).parent.parent / "dbt"


def _set_postgres_env_from_database_url() -> None:
    if os.getenv("POSTGRES_HOST"):
        return  # ya seteado explícito (ej. local dev), no pisar
    p = urlparse(os.environ["DATABASE_URL"])
    os.environ["POSTGRES_HOST"] = p.hostname or ""
    os.environ["POSTGRES_PORT"] = str(p.port or 5432)
    os.environ["POSTGRES_USER"] = p.username or ""
    os.environ["POSTGRES_PASSWORD"] = p.password or ""
    os.environ["POSTGRES_DB"] = (p.path or "").lstrip("/")


def run_dbt(args: list[str]) -> int:
    _set_postgres_env_from_database_url()
    # "dbt" console script, no "python -m dbt" — dbt-core no expone __main__.py
    cmd = ["dbt", *args, "--target", "prod", "--profiles-dir", ".", "--project-dir", "."]
    result = subprocess.run(cmd, cwd=str(DBT_DIR))
    return result.returncode


if __name__ == "__main__":
    sys.exit(run_dbt(sys.argv[1:]))
