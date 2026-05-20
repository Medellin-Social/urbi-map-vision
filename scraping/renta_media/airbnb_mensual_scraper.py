"""
Airbnb monthly stays scraper — Valle de Aburrá

Strategy:
  - Search Airbnb with flexible_trip_lengths[]=one_month per neighborhood/municipality
  - Cards expose COP prices directly (already monthly)
  - Take discounted price (last $ amount on card) if two shown, else only price
  - 18 listings per page; paginate via items_offset
  - Barrio matched from listing-card-title + listing-card-name

Price pattern: "$4,419,000 COP" → take last amount for monthly total.
"""
import re
import sys
import time
from pathlib import Path
from urllib.parse import quote

from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
from config import (
    USD_TO_COP,
    get_conn,
    ensure_table,
    load_barrios,
    match_barrio,
    make_dedup_hash,
    upsert_listing,
)

FUENTE = "airbnb_mensual"
BASE_URL = "https://www.airbnb.com"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
PAGE_DELAY = 6
MAX_PAGES = 5  # 18 per page → max 90 per search

# (display_name, airbnb_search_slug, municipio_hint)
SEARCH_LOCATIONS = [
    ("El Poblado",   "El-Poblado--Medell%C3%ADn--Antioquia--Colombia",   "MEDELLIN"),
    ("Laureles",     "Laureles--Medell%C3%ADn--Antioquia--Colombia",      "MEDELLIN"),
    ("Belén",        "Bel%C3%A9n--Medell%C3%ADn--Antioquia--Colombia",    "MEDELLIN"),
    ("Buenos Aires", "Buenos-Aires--Medell%C3%ADn--Antioquia--Colombia",  "MEDELLIN"),
    ("Castropol",    "Castropol--Medell%C3%ADn--Antioquia--Colombia",     "MEDELLIN"),
    ("Envigado",     "Envigado--Antioquia--Colombia",                     "ENVIGADO"),
    ("Sabaneta",     "Sabaneta--Antioquia--Colombia",                     "SABANETA"),
    ("Itagüí",       "Itagüí--Antioquia--Colombia",                       "ITAGUI"),
    ("Bello",        "Bello--Antioquia--Colombia",                        "BELLO"),
    ("La Estrella",  "La-Estrella--Antioquia--Colombia",                  "LA ESTRELLA"),
    ("Medellín",     "Medell%C3%ADn--Antioquia--Colombia",                "MEDELLIN"),
]


def _make_url(slug: str, offset: int = 0) -> str:
    return (
        f"{BASE_URL}/s/{slug}/homes"
        "?tab_id=home_tab"
        "&refinement_paths%5B%5D=%2Fhomes"
        "&flexible_trip_lengths%5B%5D=one_month"
        "&price_filter_input_type=0"
        "&date_picker_type=flexible_dates"
        "&source=structured_destinations_query"
        "&search_type=autocomplete_click"
        "&adults=1"
        f"&items_offset={offset}"
    )


def _parse_cop(text: str) -> int:
    """Extract COP monthly price. Takes last $X,XXX,XXX amount (discounted)."""
    amounts = re.findall(r'\$([\d,]+)\s*COP', text)
    if not amounts:
        # fallback: any large $ amount
        amounts = re.findall(r'\$([\d,]+)', text)
    for raw in reversed(amounts):
        val = int(raw.replace(",", ""))
        if 500_000 <= val <= 100_000_000:
            return val
    return 0


def _parse_card(card, barrios: list[dict], municipio_hint: str) -> dict | None:
    try:
        # URL and room ID
        link = card.find("a", href=re.compile(r"/rooms/"))
        if not link:
            return None
        href = link.get("href", "")
        room_match = re.search(r"/rooms/(\d+)", href)
        if not room_match:
            return None
        room_id = room_match.group(1)
        url = f"{BASE_URL}/rooms/{room_id}"

        text = card.get_text(separator="|", strip=True)

        # Price (COP monthly)
        price_cop = _parse_cop(text)
        if not price_cop:
            return None

        # Title elements
        title_el = card.find(attrs={"data-testid": "listing-card-name"})
        title = title_el.get_text(strip=True) if title_el else ""

        # Location subtitle (e.g. "Apartamento en Medellín")
        loc_el = card.find(attrs={"data-testid": "listing-card-title"})
        location = loc_el.get_text(strip=True) if loc_el else ""

        # barrio_raw: try name first, then location
        barrio_raw = title or location

        # Beds
        beds = None
        m_beds = re.search(r"(\d+)\s*habitaci[oó]n", text, re.I)
        if m_beds:
            beds = int(m_beds.group(1))
        elif re.search(r"estudio|studio", text, re.I):
            beds = 0

        # Baths
        baths = None
        m_baths = re.search(r"(\d+)\s*ba[ñn]o", text, re.I)
        if m_baths:
            baths = float(m_baths.group(1))

        return {
            "fuente": FUENTE,
            "titulo": f"{title} | {location}"[:500] if title else location[:500],
            "precio_mes_cop": price_cop,
            "precio_mes_usd": round(price_cop / USD_TO_COP, 2),
            "area_m2": None,
            "habitaciones": beds,
            "banos": baths,
            "barrio_raw": barrio_raw[:200] or None,
            "barrio_id": match_barrio(barrio_raw, barrios, municipio_hint=municipio_hint),
            "amoblado": True,
            "incluye_servicios": None,
            "min_noches": 28,
            "url": url[:500],
            "lat": None,
            "lon": None,
            "dedup_hash": make_dedup_hash(FUENTE, url),
        }
    except Exception as e:
        print(f"    Card parse error: {e}")
        return None


def _extract_cards(html: str, barrios: list[dict], municipio_hint: str) -> list[dict]:
    soup = BeautifulSoup(html, "lxml")
    links = soup.find_all("a", href=re.compile(r"/rooms/"))
    seen_ids: set[str] = set()
    results = []

    for link in links:
        href = link.get("href", "")
        m = re.search(r"/rooms/(\d+)", href)
        if not m or m.group(1) in seen_ids:
            continue
        seen_ids.add(m.group(1))

        # Walk up to card container (has price-availability-row)
        card = link
        for _ in range(8):
            card = card.parent
            if not card:
                break
            if card.find(attrs={"data-testid": "price-availability-row"}):
                break

        if not card:
            continue

        listing = _parse_card(card, barrios, municipio_hint)
        if listing:
            results.append(listing)

    return results


def scrape(dry_run: bool = False) -> list[dict]:
    conn = get_conn()
    ensure_table(conn)
    barrios = load_barrios(conn)

    all_results: list[dict] = []
    seen_urls: set[str] = set()

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

        for loc_name, slug, municipio_hint in SEARCH_LOCATIONS:
            print(f"\n  [{loc_name}] [{municipio_hint}]")
            loc_total = 0

            for page_num in range(MAX_PAGES):
                offset = page_num * 18
                url = _make_url(slug, offset)

                try:
                    page.goto(url, wait_until="domcontentloaded", timeout=30000)
                    time.sleep(PAGE_DELAY)
                except Exception as e:
                    print(f"    Load error p{page_num+1}: {e}")
                    break

                html = page.content()
                cards = _extract_cards(html, barrios, municipio_hint)

                new = [c for c in cards if c["url"] not in seen_urls]
                for c in new:
                    seen_urls.add(c["url"])
                all_results.extend(new)
                loc_total += len(new)

                print(f"    p{page_num+1}: {len(new)} new | loc total: {loc_total} | cumulative: {len(all_results)}")

                if len(cards) < 16:  # last page (fewer than full 18)
                    break

                time.sleep(2)

        browser.close()

    saved = 0
    for listing in all_results:
        if dry_run:
            print(
                f"    DRY: {listing.get('titulo','?')[:50]} | "
                f"COP {listing.get('precio_mes_cop',0):,} | "
                f"{listing.get('barrio_raw','?')[:40]}"
            )
        else:
            try:
                upsert_listing(conn, listing)
                saved += 1
            except Exception as e:
                print(f"    DB error: {e}")

    conn.close()
    print(f"\nAirbnb mensual: {len(all_results)} parsed, {saved} saved")
    return all_results


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--max-pages", type=int, default=5)
    args = ap.parse_args()
    MAX_PAGES = args.max_pages
    scrape(dry_run=args.dry_run)
