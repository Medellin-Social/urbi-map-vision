"""
Flatio scraper — flatio.com/s/{City} for all Valle de Aburrá municipalities

- JS-rendered (React)
- Price: EUR/night × 30 = EUR/month → × EUR_TO_COP
- Listing cards show price but NOT area/beds/baths
- Detail pages have area_m2, bedrooms, bathrooms
"""
import json
import re
import sys
import time
from datetime import date, timedelta
from pathlib import Path
from typing import Optional

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
from config import (
    EUR_TO_COP,
    USD_TO_COP,
    get_conn,
    ensure_table,
    load_barrios,
    match_barrio,
    make_dedup_hash,
    upsert_listing,
)

FUENTE = "flatio"
BASE_URL = "https://www.flatio.com"
UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

# Use next full calendar month as stay window
_next = (date.today().replace(day=1) + timedelta(days=32)).replace(day=1)
DATE_FROM = _next.strftime("%Y-%m-%d")
DATE_TO = (_next + timedelta(days=30)).strftime("%Y-%m-%d")

# Valle de Aburrá municipalities: (display_name, flatio_slug, url_filter_slug)
SEARCH_CITIES = [
    ("Medellín",   "Medellin",  "medellin"),
    ("Envigado",   "Envigado",  "envigado"),
    ("Itagüí",     "Itagui",    "itagui"),
    ("Sabaneta",   "Sabaneta",  "sabaneta"),
    ("Bello",      "Bello",     "bello"),
    ("La Estrella","La-Estrella","estrella"),
]

DELAY = 2.0  # seconds between detail page visits


def _get_listing_urls(page, search_url: str, city_slug: str) -> list[str]:
    """Extract unique /rent/ listing URLs from one city search page."""
    page.goto(search_url, wait_until="domcontentloaded", timeout=30000)
    time.sleep(6)

    slug = city_slug.lower()
    hrefs = page.eval_on_selector_all(
        "a[href]",
        f"""els => [...new Set(
            els
            .map(e => e.href)
            .filter(h => h.includes('/rent/') && h.toLowerCase().includes('{slug}'))
        )]""",
    )
    return hrefs


def _try_next_data(page) -> Optional[dict]:
    """Extract __NEXT_DATA__ JSON from current page if present."""
    el = page.query_selector("#__NEXT_DATA__")
    if not el:
        return None
    try:
        return json.loads(el.inner_text())
    except Exception:
        return None


def _parse_from_next_data(nd: dict, canonical_url: str, barrios: list[dict]) -> Optional[dict]:
    """
    Navigate Flatio's __NEXT_DATA__ for listing fields.
    Flatio stores listing in props.pageProps.listing (or .offer / .property).
    """
    try:
        props = nd.get("props", {}).get("pageProps", {})

        raw = None
        for key in ("listing", "offer", "property", "apartment"):
            raw = props.get(key)
            if raw:
                break

        if not raw:
            # Some Flatio pages nest under a different key; try first dict value
            for v in props.values():
                if isinstance(v, dict) and ("price" in v or "title" in v):
                    raw = v
                    break

        if not raw:
            return None

        # --- price ---
        price_eur_night = 0.0
        for k in ("price", "pricePerNight", "price_per_night", "nightlyPrice"):
            val = raw.get(k)
            if val:
                if isinstance(val, dict):
                    val = val.get("amount") or val.get("value") or 0
                try:
                    price_eur_night = float(val)
                    break
                except (ValueError, TypeError):
                    pass
        if not price_eur_night:
            return None

        price_mes_eur = price_eur_night * 30
        price_mes_cop = int(price_mes_eur * EUR_TO_COP)
        price_mes_usd = round(price_mes_eur * EUR_TO_COP / USD_TO_COP, 2)

        # --- title ---
        title = str(
            raw.get("title") or raw.get("name") or raw.get("headline") or ""
        )

        # --- barrio ---
        loc = raw.get("location") or raw.get("address") or {}
        if isinstance(loc, str):
            barrio_raw = loc
        else:
            barrio_raw = str(
                loc.get("district") or loc.get("neighborhood") or
                loc.get("area") or loc.get("city_area") or
                loc.get("zone") or ""
            )

        # --- details ---
        area = None
        for k in ("size", "area", "m2", "squareMeters"):
            v = raw.get(k)
            if v:
                try:
                    area = float(v)
                    break
                except (ValueError, TypeError):
                    pass

        beds = None
        for k in ("bedrooms", "rooms", "bedroom_count"):
            v = raw.get(k)
            if v:
                try:
                    beds = int(v)
                    break
                except (ValueError, TypeError):
                    pass

        baths = None
        for k in ("bathrooms", "bathroom_count", "baths"):
            v = raw.get(k)
            if v:
                try:
                    baths = float(v)
                    break
                except (ValueError, TypeError):
                    pass

        utilities = bool(
            raw.get("utilities_included") or raw.get("bills_included") or
            raw.get("allUtilities") or raw.get("all_utilities")
        )

        min_nights = 30
        for k in ("min_nights", "minimum_stay", "minNights"):
            v = raw.get(k)
            if v:
                try:
                    min_nights = int(v)
                    break
                except (ValueError, TypeError):
                    pass

        lat = None
        lon = None
        for k in ("lat", "latitude"):
            v = raw.get(k)
            if v:
                try:
                    lat = float(v) or None
                    break
                except (ValueError, TypeError):
                    pass
        for k in ("lng", "lon", "longitude"):
            v = raw.get(k)
            if v:
                try:
                    lon = float(v) or None
                    break
                except (ValueError, TypeError):
                    pass

        return {
            "fuente": FUENTE,
            "titulo": title[:500] or None,
            "precio_mes_cop": price_mes_cop,
            "precio_mes_usd": price_mes_usd,
            "area_m2": area,
            "habitaciones": beds,
            "banos": baths,
            "barrio_raw": barrio_raw[:200] or None,
            "barrio_id": match_barrio(barrio_raw, barrios),
            "amoblado": True,
            "incluye_servicios": utilities,
            "min_noches": min_nights,
            "url": canonical_url,
            "lat": lat,
            "lon": lon,
            "dedup_hash": make_dedup_hash(FUENTE, canonical_url),
        }
    except Exception as e:
        print(f"    __NEXT_DATA__ parse error: {e}")
        return None


def _parse_from_dom(page, canonical_url: str, barrios: list[dict]) -> Optional[dict]:
    """Fallback DOM extraction from rendered Flatio detail page."""
    try:
        body_text = page.inner_text("body")
        # Normalize non-breaking spaces to regular spaces
        body_norm = body_text.replace("\xa0", " ")

        # Primary: look for "avg. €NNN / 30 days" — the real monthly rent rate
        # Pattern on page: "€1,101 avg. €826 / 30 days"
        monthly_prices = re.findall(
            r"avg\.\s*€\s*([\d,\s]+)\s*/\s*30\s*days?",
            body_norm,
            re.I,
        )
        price_mes_eur = 0.0
        if monthly_prices:
            # Take first match = selected-dates pricing window
            vals = []
            for raw in monthly_prices:
                try:
                    vals.append(float(raw.replace(",", "").replace(" ", "")))
                except ValueError:
                    pass
            if vals:
                price_mes_eur = vals[0]

        # Fallback: total price for selected stay (large number before €)
        if not price_mes_eur:
            # Pattern: "2 453 €" or "2453€" (thousands sep = space or nbsp)
            totals = re.findall(r"(\d[\d\s,]{2,6})\s*€", body_norm)
            for raw in totals:
                try:
                    val = float(raw.replace(" ", "").replace(",", ""))
                    # Monthly EUR: 200–20000 range
                    if 200 <= val <= 20000:
                        price_mes_eur = val
                        break
                except ValueError:
                    pass

        if not price_mes_eur:
            return None

        # Title — first h1
        title = ""
        h1 = page.query_selector("h1")
        if h1:
            title = h1.inner_text().strip()

        # Area
        area = None
        m = re.search(r"(\d+)\s*m[²2²]", body_text)
        if m:
            area = float(m.group(1))

        # Bedrooms
        beds = None
        m = re.search(r"(\d+)\s*(?:bedroom|habitaci|cuarto|room|BR)\b", body_text, re.I)
        if m:
            beds = int(m.group(1))

        # Bathrooms
        baths = None
        m = re.search(r"(\d+(?:\.\d+)?)\s*(?:bathroom|baño|bath)\b", body_text, re.I)
        if m:
            baths = float(m.group(1))

        # Barrio — try H1 title first (most reliable: "Laureles Penthouse", "Poblado Penthouse")
        barrio_raw = ""
        _BARRIO_KEYWORDS = [
            "Laureles", "Poblado", "El Poblado", "Envigado", "Sabaneta",
            "Belén", "Belen", "Estadio", "Calasanz", "Conquistadores",
            "Floresta", "Robledo", "Aranjuez", "Manrique", "Buenos Aires",
            "Guayabal", "Itagüí", "Itagui", "Castilla", "Doce de Octubre",
            "La America", "América", "San Javier", "Santa Cruz",
            "Villa Hermosa", "Milla de Oro", "Gold Mile",
        ]
        if title:
            for kw in _BARRIO_KEYWORDS:
                if re.search(r"\b" + re.escape(kw) + r"\b", title, re.I):
                    barrio_raw = kw
                    break

        # Fallback: regex on body text (no \s to avoid newline bleed into amenity lists)
        if not barrio_raw:
            _REJECT_PREFIXES = ("Bogotá", "Bogota", "Cali", "Barranquilla", "Medellín", "Medellin", "Colombia")
            for pattern in [
                r"([A-ZÁÉÍÓÚ][A-Za-záéíóúñÑ ]{2,30})\s*,\s*Medell[ií]n",
                r"(?:in|en)\s+([A-ZÁÉÍÓÚ][A-Za-záéíóúñÑ ]{3,25})\s*[,·]",
            ]:
                m = re.search(pattern, body_text)
                if m:
                    candidate = m.group(1).strip()
                    if not any(candidate.startswith(r) for r in _REJECT_PREFIXES) and len(candidate) < 35:
                        barrio_raw = candidate
                        break

        utilities = bool(
            re.search(r"utilities\s+included|all\s+utilities|servicios\s+incluidos", body_text, re.I)
        )

        return {
            "fuente": FUENTE,
            "titulo": title[:500] or None,
            "precio_mes_cop": int(price_mes_eur * EUR_TO_COP),
            "precio_mes_usd": round(price_mes_eur * EUR_TO_COP / USD_TO_COP, 2),
            "area_m2": area,
            "habitaciones": beds,
            "banos": baths,
            "barrio_raw": barrio_raw[:200] or None,
            "barrio_id": match_barrio(barrio_raw, barrios),
            "amoblado": True,
            "incluye_servicios": utilities,
            "min_noches": 30,
            "url": canonical_url,
            "lat": None,
            "lon": None,
            "dedup_hash": make_dedup_hash(FUENTE, canonical_url),
        }
    except Exception as e:
        print(f"    DOM parse error: {e}")
        return None


def scrape(dry_run: bool = False) -> list[dict]:
    conn = get_conn()
    ensure_table(conn)
    barrios = load_barrios(conn)
    results = []

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

        # Collect listing URLs from all Valle de Aburrá cities
        all_urls: list[str] = []
        seen_urls: set[str] = set()
        for city_name, city_flatio_slug, city_filter_slug in SEARCH_CITIES:
            search_url = f"{BASE_URL}/s/{city_flatio_slug}?from={DATE_FROM}&to={DATE_TO}"
            print(f"  Searching {city_name}: {search_url}")
            try:
                city_urls = _get_listing_urls(page, search_url, city_filter_slug)
            except Exception as e:
                print(f"  Retry {city_name} (domcontentloaded): {e}")
                try:
                    page.goto(search_url, wait_until="domcontentloaded", timeout=30000)
                    time.sleep(5)
                    slug = city_filter_slug.lower()
                    city_urls = page.eval_on_selector_all(
                        "a[href]",
                        f"""els => [...new Set(
                            els.map(e => e.href)
                            .filter(h => h.includes('/rent/') && h.toLowerCase().includes('{slug}'))
                        )]""",
                    )
                except Exception as e2:
                    print(f"  ERROR {city_name}: {e2}")
                    city_urls = []
            new_urls = [u for u in city_urls if u.split("?")[0] not in seen_urls]
            seen_urls.update(u.split("?")[0] for u in new_urls)
            all_urls.extend(new_urls)
            print(f"  {city_name}: {len(city_urls)} found, {len(new_urls)} new")

        listing_urls = all_urls
        print(f"  Total unique listing URLs: {len(listing_urls)}")

        for i, url in enumerate(listing_urls):
            # Canonical URL = strip query params (dates vary)
            canonical = url.split("?")[0]
            print(f"  [{i+1}/{len(listing_urls)}] {canonical[:80]}")

            detail_url = f"{canonical}?from={DATE_FROM}&to={DATE_TO}"
            try:
                page.goto(detail_url, wait_until="domcontentloaded", timeout=30000)
                time.sleep(10)
            except Exception as e:
                print(f"    Load error: {e}")
                time.sleep(DELAY)
                continue

            nd = _try_next_data(page)
            listing = _parse_from_next_data(nd, canonical, barrios) if nd else None
            if not listing:
                listing = _parse_from_dom(page, canonical, barrios)

            if listing:
                results.append(listing)
                if dry_run:
                    print(f"    DRY: {listing.get('titulo','?')[:50]} | EUR/night×30 → COP {listing.get('precio_mes_cop',0):,} | {listing.get('barrio_raw','?')}")
                else:
                    try:
                        upsert_listing(conn, listing)
                        print(f"    → saved: {listing.get('titulo','?')[:50]} | COP {listing.get('precio_mes_cop',0):,}")
                    except Exception as e:
                        print(f"    DB error: {e}")
            else:
                print(f"    → no data extracted")

            time.sleep(DELAY)

        browser.close()

    conn.close()
    print(f"Flatio: {len(results)} listings scraped")
    return results


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    scrape(dry_run=args.dry_run)
