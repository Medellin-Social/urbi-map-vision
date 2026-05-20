"""
Enrich barrio_id for nomadbarrio listings that have barrio_id=NULL.

Visits each listing's detail page, extracts the subtitle (which usually
contains the specific neighborhood: "Spectacular Loma los Benedictinos Apt"),
then re-runs match_barrio() with the correct municipio_hint.

Usage:
    python enrich_barrio_ids.py               # all unmatched nomadbarrio
    python enrich_barrio_ids.py --dry-run
    python enrich_barrio_ids.py --municipio ENVIGADO
"""
import argparse
import re
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
from config import get_conn, load_barrios, match_barrio

UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
DELAY = 2.5


# municipio for each NomadBarrio search term (same as nomadbarrio_scraper)
_BARRIO_MUNICIPIO: dict[str, str] = {
    "envigado":   "ENVIGADO",
    "sabaneta":   "SABANETA",
    "itagüí":     "ITAGUI",
    "itagui":     "ITAGUI",
    "bello":      "BELLO",
    "la estrella":"LA ESTRELLA",
}


def _municipio_from_barrio_raw(barrio_raw: str) -> str:
    """Derive municipio hint from barrio_raw prefix."""
    first = barrio_raw.strip().split()[0].lower() if barrio_raw else ""
    return _BARRIO_MUNICIPIO.get(first, "MEDELLIN")


def _extract_subtitle(page) -> str:
    """Extract the listing subtitle (h2) which usually has the barrio name."""
    for sel in ["h2", "h3", "[class*='subtitle']", "[class*='title']"]:
        try:
            el = page.query_selector(sel)
            if el:
                text = el.inner_text().strip()
                if text and len(text) > 5:
                    return text
        except Exception:
            pass
    return ""


def enrich(dry_run: bool = False, municipio_filter: str = "") -> int:
    conn = get_conn()
    barrios = load_barrios(conn)

    # Fetch all unmatched nomadbarrio listings
    with conn.cursor() as cur:
        if municipio_filter:
            cur.execute("""
                SELECT id, url, barrio_raw
                FROM raw.listings_renta_media
                WHERE fuente = 'nomadbarrio'
                  AND barrio_id IS NULL
                  AND barrio_raw ILIKE %s
                ORDER BY id
            """, (f"%{municipio_filter.lower()}%",))
        else:
            cur.execute("""
                SELECT id, url, barrio_raw
                FROM raw.listings_renta_media
                WHERE fuente = 'nomadbarrio'
                  AND barrio_id IS NULL
                ORDER BY id
            """)
        rows = cur.fetchall()

    print(f"  Unmatched listings to enrich: {len(rows)}")
    if not rows:
        return 0

    updated = 0

    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        ctx = browser.new_context(
            user_agent=UA,
            locale="es-CO",
            viewport={"width": 1280, "height": 900},
        )
        page = ctx.new_page()

        for listing_id, url, barrio_raw in rows:
            municipio_hint = _municipio_from_barrio_raw(barrio_raw or "")
            print(f"  [{listing_id}] {url[-60:]} [{municipio_hint}]")

            try:
                page.goto(url, wait_until="domcontentloaded", timeout=25000)
                time.sleep(3)
            except Exception as e:
                print(f"    load error: {e}")
                continue

            subtitle = _extract_subtitle(page)
            if not subtitle:
                print(f"    no subtitle found")
                continue

            print(f"    subtitle: {subtitle[:70]}")

            # Try matching subtitle with municipio hint
            barrio_id = match_barrio(subtitle, barrios, municipio_hint=municipio_hint)

            # Fallback: try URL slug tokens
            if not barrio_id:
                slug = re.sub(r"-\d{4}$", "", url.split("/listing/")[-1].split("?")[0])
                slug_text = slug.replace("-", " ")
                barrio_id = match_barrio(slug_text, barrios, municipio_hint=municipio_hint)
                if barrio_id:
                    print(f"    matched via URL slug")

            if not barrio_id:
                print(f"    no match")
                continue

            # Find matched barrio name for logging
            matched = next((b for b in barrios if b["id"] == barrio_id), {})
            print(f"    → {matched.get('nombre')} ({matched.get('municipio')})")

            if not dry_run:
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE raw.listings_renta_media SET barrio_id=%s, barrio_raw=%s WHERE id=%s",
                        (barrio_id, subtitle[:200], listing_id),
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
    ap.add_argument("--municipio", default="", help="Filter by municipio keyword (e.g. ENVIGADO)")
    args = ap.parse_args()
    enrich(dry_run=args.dry_run, municipio_filter=args.municipio)
