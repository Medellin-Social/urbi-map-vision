"""
Fincaraiz.com.co scraper for Valle de Aburrá.

Findings from reverse-engineering:
  - Correct URL: /venta/apartamentos/{slug}/antioquia  (or /arriendo/...)
  - Pagination: ?page=N  (NOT ?pagina=N)
  - Data in: __NEXT_DATA__ → props.pageProps.fetchResult.searchFast.data
  - Pagination info: paginatorInfo.{currentPage, lastPage, total, hasMorePages}
  - Listing fields: latitude, longitude, price.amount, m2Built/m2apto/m2,
                    stratum, locations.location_main.{name, slug, location_type},
                    operation_type_id (1=venta, 2=arriendo)

Run:
  python scrape_fincaraiz.py                       # all municipalities
  python scrape_fincaraiz.py --slug medellin        # one municipality
  python scrape_fincaraiz.py --slug medellin --tipo venta
  python scrape_fincaraiz.py --max-pages 5          # limit pages per combo
"""

import argparse
import json
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

from config import MUNICIPIOS, MUNICIPIOS_BY_SLUG, TIPOSNEGOCIOS

RAW_DIR = Path(__file__).parent / "data" / "raw"
RAW_DIR.mkdir(parents=True, exist_ok=True)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "es-CO,es;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": "https://www.fincaraiz.com.co/",
}

SESSION = requests.Session()
SESSION.headers.update(HEADERS)

# Pages per (slug, tipo) combo. 482 pages × 21 listings = 10,120 for Medellín venta.
# 20 pages × 21 = 420 listings — enough for median stats per barrio.
DEFAULT_MAX_PAGES = 20
DELAY = 1.8  # seconds between requests (respectful crawling)

# URL patterns (confirmed working)
# tipo "venta" → /venta/apartamentos/{slug}/antioquia
# tipo "arriendo" → /arriendo/apartamentos/{slug}/antioquia
BASE_URL = "https://www.fincaraiz.com.co/{tipo}/apartamentos/{slug}/antioquia"

# Valle de Aburrá bounding box (for filtering out-of-area listings)
LAT_MIN, LAT_MAX = 5.95, 6.55
LNG_MIN, LNG_MAX = -75.85, -75.30


def in_valle_aburra(lat, lng) -> bool:
    try:
        return LAT_MIN <= float(lat) <= LAT_MAX and LNG_MIN <= float(lng) <= LNG_MAX
    except (TypeError, ValueError):
        return False


def fetch_html(url: str) -> str | None:
    try:
        r = SESSION.get(url, timeout=25, allow_redirects=True)
        r.raise_for_status()
        return r.text
    except Exception as e:
        print(f"  ERROR fetching {url}: {e}")
        return None


def extract_next_data(html: str) -> dict | None:
    soup = BeautifulSoup(html, "lxml")
    tag = soup.find("script", id="__NEXT_DATA__")
    if not tag:
        return None
    try:
        return json.loads(tag.string)
    except json.JSONDecodeError:
        return None


def parse_search_fast(next_data: dict) -> tuple[list[dict], dict]:
    """Extract (listings_raw, paginatorInfo) from __NEXT_DATA__."""
    try:
        sf = next_data["props"]["pageProps"]["fetchResult"]["searchFast"]
        return sf.get("data", []), sf.get("paginatorInfo", {})
    except (KeyError, TypeError):
        return [], {}


def get_area(raw: dict) -> float:
    """Get best area estimate from listing. m2Built > m2apto > m2."""
    for key in ("m2Built", "m2apto", "m2"):
        val = raw.get(key)
        if val and float(val) > 0:
            return float(val)
    return 0.0


def normalize_listing(raw: dict, slug: str, tipo_negocio: str) -> dict | None:
    """
    Normalize a fincaraiz listing to our schema.
    Returns None if required fields are missing or out of area.
    """
    try:
        # Coordinates
        lat = raw.get("latitude")
        lng = raw.get("longitude")
        if not in_valle_aburra(lat, lng):
            return None

        # Price
        price_obj = raw.get("price") or {}
        precio = price_obj.get("amount") or 0
        if not precio or precio <= 0:
            return None

        # Area
        area = get_area(raw)
        if area <= 0:
            # Some listings don't have area — still useful for arriendo stats
            area = 0.0

        precio_m2 = int(precio / area) if area > 0 else 0

        # Barrio from locations
        locs = raw.get("locations") or {}
        main = locs.get("location_main") or {}
        barrio = (main.get("name") or "").upper().strip()
        if not barrio:
            return None

        # Municipio — get from city field in locations
        city_info = locs.get("city")
        if isinstance(city_info, list) and city_info:
            city_info = city_info[0]
        municipio = ""
        if isinstance(city_info, dict):
            municipio = (city_info.get("name") or "").upper().strip()

        estrato = raw.get("stratum") or 0

        listing_id = raw.get("id")
        url = f"https://www.fincaraiz.com.co/ficha/{listing_id}" if listing_id else None

        return {
            "barrio": barrio,
            "municipio_slug": slug,
            "municipio": municipio,
            "precio": int(precio),
            "area": round(area, 2),
            "precio_m2": precio_m2,
            "tipo": tipo_negocio,
            "estrato": int(estrato) if estrato else 0,
            "lat": round(float(lat), 7),
            "lng": round(float(lng), 7),
            "id": listing_id,
            "url": url,
        }
    except Exception:
        return None


def scrape_municipio_tipo(slug: str, tipo: str, max_pages: int) -> list[dict]:
    """Scrape all pages for one (municipio, tipo_negocio) combination."""
    url_base = BASE_URL.format(tipo=tipo, slug=slug)
    print(f"  → {url_base} (max {max_pages} pages)")

    listings: list[dict] = []
    seen_ids: set = set()

    for page in range(1, max_pages + 1):
        url = url_base if page == 1 else f"{url_base}?page={page}"
        html = fetch_html(url)
        if not html:
            print(f"  page {page}: fetch failed")
            break

        nd = extract_next_data(html)
        if not nd:
            print(f"  page {page}: no __NEXT_DATA__")
            break

        raw_listings, pag = parse_search_fast(nd)
        if not raw_listings:
            print(f"  page {page}: 0 raw listings — stopping")
            break

        total_pages = pag.get("lastPage", max_pages)
        total_listings = pag.get("total", "?")

        page_listings = []
        for raw in raw_listings:
            lid = raw.get("id")
            if lid in seen_ids:
                continue
            seen_ids.add(lid)
            normalized = normalize_listing(raw, slug, tipo)
            if normalized:
                page_listings.append(normalized)

        listings.extend(page_listings)
        print(
            f"  page {page}/{min(max_pages, total_pages)}: "
            f"+{len(page_listings)} valid (total_raw={len(raw_listings)}, "
            f"cumulative={len(listings)}, server_total={total_listings})"
        )

        # Stop if no more pages or no new unique listings
        if not pag.get("hasMorePages") or page >= total_pages:
            print(f"  no more pages at page {page}")
            break

        time.sleep(DELAY)

    return listings


def save_raw(slug: str, tipo: str, listings: list[dict]) -> Path:
    out = RAW_DIR / f"{slug}_{tipo}.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(listings, f, ensure_ascii=False, indent=2)
    print(f"  saved {len(listings)} listings → {out.name}")
    return out


def main():
    parser = argparse.ArgumentParser(description="Scrape fincaraiz.com.co — Valle de Aburrá")
    parser.add_argument("--slug", help="Single municipio slug (e.g. medellin)")
    parser.add_argument("--tipo", choices=TIPOSNEGOCIOS, help="Only scrape this tipo")
    parser.add_argument(
        "--max-pages",
        type=int,
        default=DEFAULT_MAX_PAGES,
        help=f"Max pages per (slug, tipo) combo (default={DEFAULT_MAX_PAGES})",
    )
    args = parser.parse_args()

    slugs = [args.slug] if args.slug else [m["slug"] for m in MUNICIPIOS]
    tipos = [args.tipo] if args.tipo else TIPOSNEGOCIOS

    total_saved = 0
    for slug in slugs:
        if slug not in MUNICIPIOS_BY_SLUG:
            print(f"Unknown slug: {slug}")
            continue
        for tipo in tipos:
            print(f"\n{'='*60}")
            print(f"Scraping: {slug} / {tipo}")
            print(f"{'='*60}")
            listings = scrape_municipio_tipo(slug, tipo, args.max_pages)
            save_raw(slug, tipo, listings)
            total_saved += len(listings)
            time.sleep(DELAY * 2)

    print(f"\nDone. Total listings saved: {total_saved}")


if __name__ == "__main__":
    main()
