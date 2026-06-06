"""
Validate listing URLs and update availability state in raw tables.

Usage:
    python scripts/validate_listings_urls.py [--batch 500] [--concurrency 50]

Never deletes listings. Sets url_activa + timestamps; historical data stays intact.
Run weekly via cron or Dockerfile.cron.
"""

from __future__ import annotations

import argparse
import asyncio
import os
from datetime import datetime

import aiohttp
from sqlalchemy import create_engine, text

ACTIVE_STATUSES = {200, 301, 302}
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; UrbiBot/1.0)"}


async def _check(session: aiohttp.ClientSession, listing_uid: str, url: str, fuente: str) -> dict:
    try:
        timeout = aiohttp.ClientTimeout(total=10)
        async with session.get(url, timeout=timeout, allow_redirects=True, headers=HEADERS) as resp:
            activo = resp.status in ACTIVE_STATUSES
            return {"uid": listing_uid, "url": url, "fuente": fuente, "status": resp.status, "activo": activo}
    except Exception:
        return {"uid": listing_uid, "url": url, "fuente": fuente, "status": 0, "activo": False}


async def _validate_batch(rows: list, concurrency: int) -> list[dict]:
    sem = asyncio.Semaphore(concurrency)

    async def _bounded(session, row):
        async with sem:
            return await _check(session, row.listing_uid, row.url, row.fuente)

    connector = aiohttp.TCPConnector(limit=concurrency)
    async with aiohttp.ClientSession(connector=connector) as session:
        tasks = [_bounded(session, row) for row in rows]
        return await asyncio.gather(*tasks)


def _update_results(conn, results: list[dict]) -> None:
    now = datetime.utcnow()

    activos_fr   = [r["uid"] for r in results if r["activo"] and r["fuente"] == "fincaraiz"]
    inactivos_fr = [r["uid"] for r in results if not r["activo"] and r["fuente"] == "fincaraiz"]
    activos_mc   = [r["uid"] for r in results if r["activo"] and r["fuente"] == "metrocuadrado"]
    inactivos_mc = [r["uid"] for r in results if not r["activo"] and r["fuente"] == "metrocuadrado"]

    # fincaraiz — active
    if activos_fr:
        conn.execute(text("""
            UPDATE raw.listings_fincaraiz
            SET url_activa              = TRUE,
                url_validada_at         = :ts,
                fecha_ultima_vez_activa = :ts
            WHERE url = ANY(:ids)
        """), {"ts": now, "ids": activos_fr})

    # fincaraiz — inactive
    if inactivos_fr:
        conn.execute(text("""
            UPDATE raw.listings_fincaraiz
            SET url_activa      = FALSE,
                url_validada_at = :ts
            WHERE url = ANY(:ids)
        """), {"ts": now, "ids": inactivos_fr})

    # metrocuadrado — active
    if activos_mc:
        conn.execute(text("""
            UPDATE raw.listings_metrocuadrado
            SET url_activa              = TRUE,
                url_validada_at         = :ts,
                fecha_ultima_vez_activa = :ts
            WHERE url = ANY(:ids)
        """), {"ts": now, "ids": activos_mc})

    # metrocuadrado — inactive
    if inactivos_mc:
        conn.execute(text("""
            UPDATE raw.listings_metrocuadrado
            SET url_activa      = FALSE,
                url_validada_at = :ts
            WHERE url = ANY(:ids)
        """), {"ts": now, "ids": inactivos_mc})


async def validate_all(batch_size: int = 500, concurrency: int = 50) -> dict:
    db_url = os.environ["DATABASE_URL"]
    engine = create_engine(db_url)

    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT url AS listing_uid, url, 'fincaraiz' AS fuente
            FROM raw.listings_fincaraiz
            WHERE url IS NOT NULL AND activo = TRUE
              AND (url_validada_at IS NULL OR url_validada_at < NOW() - INTERVAL '7 days')
            UNION ALL
            SELECT url, url, 'metrocuadrado'
            FROM raw.listings_metrocuadrado
            WHERE url IS NOT NULL AND activo = TRUE
              AND (url_validada_at IS NULL OR url_validada_at < NOW() - INTERVAL '7 days')
            LIMIT :lim
        """), {"lim": batch_size}).fetchall()

    if not rows:
        print("No URLs pending validation.")
        return {"activos": 0, "inactivos": 0, "errores": 0, "total": 0}

    print(f"Validating {len(rows)} URLs (concurrency={concurrency})…")
    results = await _validate_batch(rows, concurrency)

    activos   = [r for r in results if r["activo"]]
    inactivos = [r for r in results if not r["activo"] and r["status"] != 0]
    errores   = [r for r in results if r["status"] == 0]

    with engine.begin() as conn:
        _update_results(conn, results)

    pct_activos = len(activos) / len(results) * 100 if results else 0
    print(f"  Activos  : {len(activos):>5}  ({pct_activos:.1f}%)")
    print(f"  Inactivos: {len(inactivos):>5}")
    print(f"  Timeout  : {len(errores):>5}")
    print(f"  Total    : {len(results):>5}")

    return {
        "activos": len(activos),
        "inactivos": len(inactivos),
        "errores": len(errores),
        "total": len(results),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate listing URLs")
    parser.add_argument("--batch", type=int, default=500, help="Max URLs per run")
    parser.add_argument("--concurrency", type=int, default=50, help="Parallel HTTP requests")
    args = parser.parse_args()
    asyncio.run(validate_all(batch_size=args.batch, concurrency=args.concurrency))


if __name__ == "__main__":
    main()
