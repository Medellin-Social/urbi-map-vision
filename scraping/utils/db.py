"""
Utilidades de conexión y escritura a PostgreSQL para scrapers.
"""

import logging
import os
from contextlib import contextmanager
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent.parent / ".env")

log = logging.getLogger(__name__)


def get_db_url() -> str:
    url = os.getenv("DATABASE_URL")
    if url:
        return url
    return (
        f"postgresql://{os.getenv('POSTGRES_USER')}:{os.getenv('POSTGRES_PASSWORD')}"
        f"@{os.getenv('POSTGRES_HOST', 'localhost')}:{os.getenv('POSTGRES_PORT', '5432')}"
        f"/{os.getenv('POSTGRES_DB')}"
    )


@contextmanager
def get_connection():
    conn = psycopg2.connect(get_db_url())
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def bulk_insert(table: str, rows: list[dict], on_conflict: str = "") -> int:
    """Insert list of dicts into table. Returns count inserted."""
    if not rows:
        return 0
    cols = list(rows[0].keys())
    placeholders = ",".join([f"%({c})s" for c in cols])
    col_list = ",".join(cols)
    sql = f"INSERT INTO {table} ({col_list}) VALUES ({placeholders}) {on_conflict}"

    with get_connection() as conn:
        with conn.cursor() as cur:
            psycopg2.extras.execute_batch(cur, sql, rows, page_size=100)
            return cur.rowcount
