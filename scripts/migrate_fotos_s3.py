"""
Migración one-time: descarga fotos de Google Places → S3 → actualiza BD.

Después de ejecutar, foto_url en public.tiendas apunta a S3.
Ninguna petición futura va a googleapis.com.

Requisitos en .env:
  DATABASE_URL
  AWS_ACCESS_KEY_ID
  AWS_SECRET_ACCESS_KEY
  AWS_REGION        (default: us-east-1)
  S3_BUCKET
  S3_PUBLIC_URL     (base pública del bucket, ej: https://cdn.medellin.social)

Uso:
  python scripts/migrate_fotos_s3.py
  python scripts/migrate_fotos_s3.py --dry-run      # solo muestra qué haría
  python scripts/migrate_fotos_s3.py --limit 100    # migrar solo N filas
  python scripts/migrate_fotos_s3.py --batch 50     # tamaño de commit batch
"""

from __future__ import annotations

import argparse
import os
import sys
import time
import uuid
from pathlib import Path

import boto3
import psycopg2
import psycopg2.extras
import requests
from botocore.exceptions import BotoCoreError, ClientError
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

DB_URL      = os.environ["DATABASE_URL"]
BUCKET      = os.getenv("S3_BUCKET", "")
REGION      = os.getenv("AWS_REGION", "us-east-1")
PUBLIC_URL  = os.getenv("S3_PUBLIC_URL", "")
FOLDER      = "tiendas/fotos"
SLEEP_MS    = 150   # ms entre descargas — evitar rate-limit de Google


def s3_client():
    return boto3.client("s3", region_name=REGION)


def upload_to_s3(data: bytes, content_type: str) -> str:
    ext = ".jpg" if "jpeg" in content_type else ".webp" if "webp" in content_type else ".jpg"
    key = f"{FOLDER}/{uuid.uuid4().hex}{ext}"
    s3_client().put_object(
        Bucket=BUCKET,
        Key=key,
        Body=data,
        ContentType=content_type,
        ACL="public-read",
    )
    base = PUBLIC_URL or f"https://{BUCKET}.s3.amazonaws.com"
    return f"{base}/{key}"


def download_image(url: str, timeout: int = 10) -> tuple[bytes, str]:
    """Returns (bytes, content_type). Raises on error."""
    r = requests.get(url, timeout=timeout, allow_redirects=True)
    r.raise_for_status()
    ct = r.headers.get("content-type", "image/jpeg").split(";")[0].strip()
    return r.content, ct


def main(dry_run: bool, limit: int | None, batch: int) -> None:
    if not BUCKET and not dry_run:
        print("ERROR: S3_BUCKET no configurado. Agrega al .env o usa --dry-run.")
        sys.exit(1)

    conn = psycopg2.connect(DB_URL)
    cur  = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    # Solo filas que todavía apuntan a Google (reanudable)
    query = """
        SELECT id, nombre, foto_url
        FROM public.tiendas
        WHERE foto_url LIKE '%%googleapis%%'
        ORDER BY id
    """
    if limit:
        query += f" LIMIT {limit}"

    cur.execute(query)
    rows = cur.fetchall()
    total = len(rows)
    print(f"Filas a migrar: {total}")

    ok = 0
    fail = 0
    batch_updates: list[tuple[str, int]] = []

    for i, row in enumerate(rows, 1):
        tid, nombre, google_url = row["id"], row["nombre"], row["foto_url"]
        print(f"[{i}/{total}] id={tid} {nombre[:40]}", end=" ... ", flush=True)

        if dry_run:
            print("DRY-RUN skip")
            continue

        try:
            data, ct = download_image(google_url)
            s3_url   = upload_to_s3(data, ct)
            batch_updates.append((s3_url, tid))
            ok += 1
            print(f"OK → {s3_url[:60]}")
        except Exception as exc:
            fail += 1
            print(f"FAIL: {exc}")

        # Commit batch
        if len(batch_updates) >= batch:
            _flush(conn, batch_updates)
            batch_updates.clear()

        time.sleep(SLEEP_MS / 1000)

    # Flush restantes
    if batch_updates:
        _flush(conn, batch_updates)

    conn.close()
    print(f"\nListo. OK={ok} FAIL={fail} TOTAL={total}")


def _flush(conn, updates: list[tuple[str, int]]) -> None:
    cur = conn.cursor()
    cur.executemany(
        "UPDATE public.tiendas SET foto_url = %s, updated_at = NOW() WHERE id = %s",
        updates,
    )
    conn.commit()
    print(f"  → {len(updates)} filas guardadas en BD")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migra fotos de Google → S3")
    parser.add_argument("--dry-run", action="store_true", help="Solo lista, no descarga")
    parser.add_argument("--limit",   type=int, default=None, help="Máximo de filas a procesar")
    parser.add_argument("--batch",   type=int, default=50,   help="Tamaño del batch de commit (default: 50)")
    args = parser.parse_args()
    main(dry_run=args.dry_run, limit=args.limit, batch=args.batch)
