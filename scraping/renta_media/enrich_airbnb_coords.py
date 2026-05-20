"""
Enrich lat/lon and barrio_id for existing airbnb_mensual listings with barrio_id=NULL.

Visits each listing detail page, extracts coordinates from embedded GraphQL cache
(same demandStayListing base64 ID pattern as search pages), then does PostGIS
ST_Contains lookup to assign barrio_id.

Usage:
    python enrich_airbnb_coords.py          # all unmatched
    python enrich_airbnb_coords.py --dry-run
    python enrich_airbnb_coords.py --limit 20
"""
import argparse
import base64
import re
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
from config import get_conn, load_barrios, match_barrio
from airbnb_mensual_scraper import barrio_from_coords, _extract_coords_from_html

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
DELAY = 4.0


def _coords_from_detail_html(html: str) -> tuple[float, float] | None:
    """Extract (lat, lon) from Airbnb listing detail page."""
    # Same demandStayListing pattern as search pages
    coords_map = _extract_coords_from_html(html)
    if coords_map:
        return next(iter(coords_map.values()))

    # Fallback: bare coordinate object pattern on detail page
    m = re.search(
        r'"coordinate"\s*:\s*\{[^}]*"latitude"\s*:\s*([-\d.]+)[^}]*"longitude"\s*:\s*([-\d.]+)',
        html,
    )
    if m:
        return float(m.group(1)), float(m.group(2))

    return None


def enrich(dry_run: bool = False, limit: int = 0) -> int:
    conn = get_conn()
    barrios = load_barrios(conn)

    with conn.cursor() as cur:
        query = """
            SELECT id, url, barrio_raw
            FROM raw.listings_renta_media
            WHERE fuente = 'airbnb_mensual'
              AND barrio_id IS NULL
            ORDER BY id
        """
        if limit:
            query += f" LIMIT {limit}"
        cur.execute(query)
        rows = cur.fetchall()

    print(f"  Unmatched airbnb_mensual listings: {len(rows)}")
    if not rows:
        return 0

    updated = 0

    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage",
                  "--disable-blink-features=AutomationControlled"],
        )
        ctx = browser.new_context(
            user_agent=UA,
            locale="es-CO",
            viewport={"width": 1366, "height": 768},
            extra_http_headers={"Accept-Language": "es-CO,es;q=0.9,en;q=0.8"},
        )
        ctx.add_init_script(
            "Object.defineProperty(navigator,'webdriver',{get:()=>undefined});"
        )
        page = ctx.new_page()

        for listing_id, url, barrio_raw in rows:
            print(f"  [{listing_id}] {url[-60:]}")
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=25000)
                time.sleep(3)
            except Exception as e:
                print(f"    load error: {e}")
                continue

            html = page.content()
            coords = _coords_from_detail_html(html)

            if not coords:
                print(f"    no coords found")
                time.sleep(DELAY)
                continue

            lat, lon = coords
            print(f"    coords: lat={lat} lon={lon}")

            barrio_id = barrio_from_coords(conn, lat, lon)

            if not barrio_id:
                barrio_id = match_barrio(barrio_raw or "", barrios)

            if not barrio_id:
                print(f"    no barrio match")
                if not dry_run:
                    with conn.cursor() as cur:
                        cur.execute(
                            "UPDATE raw.listings_renta_media SET lat=%s, lon=%s WHERE id=%s",
                            (lat, lon, listing_id),
                        )
                    conn.commit()
                time.sleep(DELAY)
                continue

            # Get barrio name for logging
            matched = next((b for b in barrios if b["id"] == barrio_id), {})
            print(f"    → {matched.get('nombre')} ({matched.get('municipio')})")

            if not dry_run:
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE raw.listings_renta_media SET lat=%s, lon=%s, barrio_id=%s WHERE id=%s",
                        (lat, lon, barrio_id, listing_id),
                    )
                conn.commit()
                updated += 1
            else:
                updated += 1

            time.sleep(DELAY)

        browser.close()

    conn.close()
    print(f"\n  {'DRY' if dry_run else 'Updated'}: {updated}/{len(rows)} listings enriched")
    return updated


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=0, help="Max listings to process (0=all)")
    args = ap.parse_args()
    enrich(dry_run=args.dry_run, limit=args.limit)
