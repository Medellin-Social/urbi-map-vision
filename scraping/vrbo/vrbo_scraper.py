"""
VRBO scraper for Valle de Aburrá — writes to raw.listings_premium.

Strategy:
  - curl_cffi Session with chrome124 impersonation (bypasses Akamai TLS fingerprint check)
  - Warm up session via homepage → get Akamai cookies
  - POST to VRBO GraphQL endpoint /serp/g with session cookies
  - Parse data.propertySearch.propertySearchListings
  - Price: nightly USD × 30 → monthly COP equivalent
  - Coords from API response (no HTML scraping)
  - Barrio: PostGIS ST_Contains → fuzzy fallback

Anti-bot:
  - curl_cffi chrome124 impersonation → proper TLS fingerprint
  - 10s delay between pages
  - Session reuse (keeps Akamai cookies warm)
  - Proxy support: set VRBO_PROXY env var (residential proxy recommended for high volume)
    e.g. VRBO_PROXY=http://user:pass@host:port

Blocked? IP rate-limited? Wait 1-2h and retry. For sustained scraping, use a
residential proxy: VRBO_PROXY=http://user:pass@proxyhost:port

Run:
  python scraping/vrbo/vrbo_scraper.py [--dry-run] [--debug] [--max-pages N] \
    [--only "Medellín,Envigado"]
"""

import argparse
import json
import os
import re
import sys
import time
import uuid
from pathlib import Path
from typing import Optional

try:
    from curl_cffi import requests as cffi_requests
except ImportError:
    print("ERROR: curl_cffi not installed. Run: pip install curl_cffi")
    sys.exit(1)

sys.path.insert(0, str(Path(__file__).parent))
from config import (
    USD_TO_COP,
    get_conn,
    ensure_table,
    load_barrios,
    match_barrio,
    barrio_from_coords,
    make_dedup_hash,
    upsert_listing,
)

FUENTE = "vrbo"
BASE_URL = "https://www.vrbo.com"
GRAPHQL_URL = "https://www.vrbo.com/graphql"
PAGE_DELAY = 10       # seconds between page loads (Akamai is rate-sensitive)
MAX_PAGES = 5         # pages per municipality (≈50 listings/page)
PAGE_SIZE = 50

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

# (display_name, vrbo_destination_keyword, region_hint, municipio_hint)
# Keywords match VRBO's autocomplete — used to resolve region IDs
SEARCH_LOCATIONS = [
    ("Medellín",     "Medellín, Colombia",        None,   "MEDELLIN"),
    ("El Poblado",   "El Poblado, Medellín",       None,   "MEDELLIN"),
    ("Laureles",     "Laureles, Medellín",          None,   "MEDELLIN"),
    ("Envigado",     "Envigado, Colombia",          None,   "ENVIGADO"),
    ("Sabaneta",     "Sabaneta, Colombia",          None,   "SABANETA"),
    ("Itagüí",       "Itagüí, Colombia",            None,   "ITAGUI"),
    ("Bello",        "Bello, Colombia",             None,   "BELLO"),
    ("La Estrella",  "La Estrella, Colombia",       None,   "LA ESTRELLA"),
    ("Copacabana",   "Copacabana, Colombia",        None,   "COPACABANA"),
    ("Caldas",       "Caldas, Antioquia, Colombia", None,   "CALDAS"),
]

# VRBO unit type → tipo_inmueble
_UNIT_TYPE_MAP = {
    "CONDO_OR_APARTMENT": "apartamento",
    "APARTMENT":          "apartamento",
    "CONDO":              "apartamento",
    "HOUSE":              "casa",
    "VILLA":              "casa",
    "CABIN":              "cabaña",
    "COTTAGE":            "cabaña",
    "TOWNHOUSE":          "casa",
    "STUDIO":             "apartamento",
    "LOFT":               "apartamento",
    "ENTIRE_PLACE":       "apartamento",
}

_DEBUG = False
_PROXY = os.getenv("VRBO_PROXY", None)


def _dbg(msg: str) -> None:
    if _DEBUG:
        print(f"  [DBG] {msg}")


def _make_context() -> dict:
    return {
        "siteId": 9001001,
        "locale": "en_US",
        "eapid": 1,
        "currency": "USD",
        "device": {"type": "DESKTOP"},
        "identity": {"authState": "ANONYMOUS", "duaid": str(uuid.uuid4())},
        "privacyTrackingState": "CAN_TRACK",
        "tpid": 9001,
    }


def _build_payload(destination: str, page: int = 0, cursor: Optional[str] = None) -> dict:
    """Build VRBO GraphQL search payload. Destination = free-text city name."""
    start_idx = page * PAGE_SIZE
    criteria = {
        "primary": {
            "dateRange": None,
            "destination": {"regionName": destination},
            "rooms": [{"adults": 1, "children": []}],
        },
        "secondary": {
            "counts": [
                {"id": "resultsStartingIndex", "value": start_idx},
                {"id": "resultsSize", "value": PAGE_SIZE},
            ],
            "filters": [],
            "sorts": [{"id": "RECOMMENDED", "value": "RECOMMENDED"}],
        },
    }
    if cursor:
        criteria["secondary"]["cursor"] = cursor

    return {
        "operationName": "PropertySearch",
        "variables": {
            "context": _make_context(),
            "criteria": criteria,
            "needsMap": False,
        },
        # Minimal query — only fields we need
        "query": """
query PropertySearch($context: ContextInput!, $criteria: PropertySearchCriteriaInput!, $needsMap: Boolean!) {
  propertySearch(context: $context, criteria: $criteria) {
    propertySearchListings {
      ... on PropertySearchListing {
        id
        listing {
          id
          name
          headline
          teaser
          unitsSummary { unitType }
          space { area { amount unitOfMeasure } }
          roomTypes { type count }
          bathrooms { full half }
          listingAmenities { id category { id name } }
        }
        priceSection {
          pricePeriods {
            price { amount currency }
            period
          }
        }
        location {
          coordinates { latitude longitude }
          neighborhoodName
        }
      }
    }
    paging { hasMorePages nextPageCursor }
  }
}
""",
    }


def _safe_get(obj: dict, *keys, default=None):
    cur = obj
    for k in keys:
        if not isinstance(cur, dict):
            return default
        cur = cur.get(k, default)
        if cur is None:
            return default
    return cur


def _parse_price_usd(data: dict) -> Optional[float]:
    """Try multiple known VRBO response shapes for nightly price."""
    price_section = data.get("priceSection") or {}
    for key in ("pricePeriods", "priceDetails", "displayPrices"):
        for item in price_section.get(key) or []:
            amt = _safe_get(item, "price", "amount")
            if amt and float(amt) > 0:
                return float(amt)
    # Top-level
    amt = _safe_get(data, "averagePrice", "amount")
    if amt and float(amt) > 0:
        return float(amt)
    return None


def _parse_listing(raw: dict, barrios: list[dict], municipio_hint: str, conn) -> Optional[dict]:
    try:
        listing = raw.get("listing") or {}

        prop_id = (listing.get("id") or raw.get("id") or "").split(".")[0]
        if not prop_id:
            return None
        url = f"{BASE_URL}/{prop_id}"

        nightly_usd = _parse_price_usd(raw) or _parse_price_usd(listing)
        if not nightly_usd or nightly_usd <= 0:
            _dbg(f"no price: {prop_id}")
            return None

        monthly_usd = nightly_usd * 30
        monthly_cop = round(monthly_usd * USD_TO_COP)
        if not (200_000 <= monthly_cop <= 500_000_000):
            _dbg(f"price OOR: {monthly_cop:,} COP")
            return None

        unit_type = (
            _safe_get(listing, "unitsSummary", "unitType") or ""
        ).upper()
        tipo_inmueble = _UNIT_TYPE_MAP.get(unit_type, "apartamento")

        habitaciones = None
        for rt in listing.get("roomTypes") or []:
            if isinstance(rt, dict) and rt.get("type") == "BEDROOM":
                habitaciones = int(rt.get("count") or 0) or None
                break
        if habitaciones is None:
            beds = listing.get("beds") or listing.get("bedrooms")
            habitaciones = int(beds) if beds else None

        banos = None
        bath_obj = listing.get("bathrooms") or {}
        if isinstance(bath_obj, dict):
            full = float(bath_obj.get("full") or 0)
            half = float(bath_obj.get("half") or 0)
            banos = full + half * 0.5 or None
        elif isinstance(bath_obj, (int, float)):
            banos = float(bath_obj) or None

        area_m2 = None
        area_obj = _safe_get(listing, "space", "area") or {}
        if isinstance(area_obj, dict):
            amount = area_obj.get("amount")
            unit = (area_obj.get("unitOfMeasure") or "").upper()
            if amount:
                if "FEET" in unit or "SQFT" in unit:
                    area_m2 = round(float(amount) * 0.0929, 1)
                else:
                    area_m2 = round(float(amount), 1)

        titulo = (listing.get("name") or listing.get("headline") or "")[:500]
        descripcion = (listing.get("teaser") or listing.get("headline") or "").strip() or None

        # Amenidades from listingAmenities[].category.name
        amenidades = []
        for a in (listing.get("listingAmenities") or []):
            name = _safe_get(a, "category", "name")
            if name and name not in amenidades:
                amenidades.append(name)

        lat, lon = None, None
        coords = (
            _safe_get(raw, "location", "coordinates")
            or _safe_get(listing, "location", "coordinates")
            or {}
        )
        if isinstance(coords, dict):
            lat_v = coords.get("latitude") or coords.get("lat")
            lon_v = coords.get("longitude") or coords.get("lng") or coords.get("lon")
            if lat_v is not None and lon_v is not None:
                lat, lon = float(lat_v), float(lon_v)

        # Valle de Aburrá bbox
        if lat is not None and lon is not None:
            if not (5.95 <= lat <= 6.55 and -75.85 <= lon <= -75.30):
                _dbg(f"outside bbox: {lat:.4f},{lon:.4f}")
                return None

        neighborhood = _safe_get(raw, "location", "neighborhoodName") or ""
        barrio_raw_val = neighborhood or titulo or ""

        barrio_id = None
        if lat is not None and lon is not None:
            barrio_id = barrio_from_coords(conn, lat, lon)
        if not barrio_id:
            barrio_id = match_barrio(barrio_raw_val, barrios, municipio_hint=municipio_hint)

        return {
            "fuente":            FUENTE,
            "tipo_operacion":    "arriendo",
            "tipo_inmueble":     tipo_inmueble,
            "titulo":            titulo or None,
            "descripcion":       descripcion,
            "amenidades":        amenidades if amenidades else None,
            "precio_cop":        monthly_cop,
            "precio_usd":        round(monthly_usd, 2),
            "area_m2":           area_m2,
            "habitaciones":      habitaciones,
            "banos":             banos,
            "barrio_raw":        barrio_raw_val[:200] or None,
            "barrio_id":         barrio_id,
            "url":               url[:500],
            "lat":               lat,
            "lon":               lon,
            "fecha_publicacion": None,
            "dedup_hash":        make_dedup_hash(FUENTE, url),
        }
    except Exception as e:
        print(f"    Parse error: {e}")
        return None


def _warm_session(session: "cffi_requests.Session") -> bool:
    """GET VRBO homepage to establish Akamai session cookies."""
    try:
        r = session.get(
            BASE_URL,
            timeout=20,
            headers={
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
            },
        )
        got_page = "Bot or Not" not in r.text and r.status_code == 200
        akamai = [k for k in session.cookies.keys() if k.startswith("bm") or k == "_abck"]
        print(f"  Session warm: status={r.status_code} | bot_blocked={not got_page} | akamai_cookies={akamai}")
        return got_page
    except Exception as e:
        print(f"  Session warm failed: {e}")
        return False


def _search_page(
    session: "cffi_requests.Session",
    destination: str,
    page: int,
    cursor: Optional[str],
) -> tuple[list[dict], Optional[str], bool]:
    """
    POST GraphQL search to VRBO.
    Returns (listings, next_cursor, blocked).
    """
    payload = _build_payload(destination, page, cursor)
    try:
        r = session.post(
            GRAPHQL_URL,
            json=payload,
            timeout=30,
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Origin": BASE_URL,
                "Referer": f"{BASE_URL}/search/",
                "sec-fetch-dest": "empty",
                "sec-fetch-mode": "cors",
                "sec-fetch-site": "same-origin",
            },
        )
        _dbg(f"GraphQL status: {r.status_code}")

        if r.status_code == 429:
            retry_after = int(r.headers.get("Retry-After", 90))
            print(f"    Rate limited (429). Waiting {retry_after}s...")
            time.sleep(retry_after)
            # One retry
            r = session.post(GRAPHQL_URL, json=payload, timeout=30, headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Origin": BASE_URL,
                "Referer": f"{BASE_URL}/search/",
            })
            if r.status_code != 200:
                print(f"    Still blocked after retry ({r.status_code}). Stopping.")
                return [], None, True

        if r.status_code != 200:
            print(f"    Unexpected status: {r.status_code}")
            if _DEBUG:
                print(f"    Response: {r.text[:500]}")
            return [], None, False

        body = r.json()
        _dbg(f"Response keys: {list(body.keys())}")

        if "errors" in body:
            print(f"    GraphQL errors: {body['errors'][:2]}")

        ps = (
            _safe_get(body, "data", "propertySearch")
            or _safe_get(body, "propertySearch")
            or {}
        )
        items = ps.get("propertySearchListings") or []
        paging = ps.get("paging") or {}
        next_cursor = paging.get("nextPageCursor")
        has_more = paging.get("hasMorePages", False)

        if _DEBUG and items:
            print(f"    [DBG] Got {len(items)} items. First keys: {list(items[0].keys())}")
            if items[0].get("listing"):
                print(f"    [DBG] listing keys: {list(items[0]['listing'].keys())}")

        return items, next_cursor if has_more else None, False

    except Exception as e:
        print(f"    Request error: {e}")
        return [], None, False


def scrape(
    dry_run: bool = False,
    only: Optional[list[str]] = None,
    max_pages: int = MAX_PAGES,
    debug: bool = False,
) -> list[dict]:
    global _DEBUG
    _DEBUG = debug

    conn = get_conn()
    ensure_table(conn)
    barrios = load_barrios(conn)

    locations = SEARCH_LOCATIONS
    if only:
        only_norm = [x.lower().strip() for x in only]
        locations = [loc for loc in SEARCH_LOCATIONS if loc[0].lower() in only_norm]
        if not locations:
            print(f"No locations matched {only}. Available: {[l[0] for l in SEARCH_LOCATIONS]}")
            return []

    proxy_config = {"http": _PROXY, "https": _PROXY} if _PROXY else None
    if _PROXY:
        print(f"Using proxy: {_PROXY.split('@')[-1] if '@' in _PROXY else _PROXY}")

    all_results: list[dict] = []
    seen_urls: set[str] = set()

    session = cffi_requests.Session(
        impersonate="chrome124",
        proxies=proxy_config,
        headers={"User-Agent": UA},
    )

    print("Warming up session...")
    warmed = _warm_session(session)
    if not warmed:
        print("WARNING: Bot detected on warm-up. Proceeding but likely rate-limited.")
        print("TIP: Wait 1-2h or set VRBO_PROXY=http://user:pass@host:port")

    time.sleep(3)

    for loc_name, destination, _region_id, municipio_hint in locations:
        print(f"\n  [{loc_name}] [{municipio_hint}]")
        loc_total = 0
        cursor = None

        for page_num in range(max_pages):
            items, next_cursor, blocked = _search_page(session, destination, page_num, cursor)

            if blocked:
                print(f"    Blocked on page {page_num+1}. Stopping this location.")
                break

            new_listings: list[dict] = []
            for raw_item in items:
                parsed = _parse_listing(raw_item, barrios, municipio_hint, conn)
                if parsed and parsed["url"] not in seen_urls:
                    seen_urls.add(parsed["url"])
                    new_listings.append(parsed)

            all_results.extend(new_listings)
            loc_total += len(new_listings)

            with_coords = sum(1 for l in new_listings if l.get("lat"))
            with_barrio = sum(1 for l in new_listings if l.get("barrio_id"))
            print(
                f"    p{page_num+1}: {len(items)} raw | {len(new_listings)} new "
                f"| coords={with_coords} | barrio={with_barrio} "
                f"| cumulative: {len(all_results)}"
            )

            if _DEBUG and new_listings:
                first = new_listings[0]
                print(
                    f"    [DBG] Sample: {first['titulo']!r} | "
                    f"COP {first['precio_cop']:,} | lat={first['lat']} | barrio_id={first['barrio_id']}"
                )

            cursor = next_cursor
            if not cursor or not items:
                break

            time.sleep(PAGE_DELAY)

        print(f"  → {loc_name}: {loc_total} listings")

    session.close()

    saved = 0
    for listing in all_results:
        if dry_run:
            print(
                f"  DRY: {(listing.get('titulo') or '?')[:45]!r} | "
                f"COP {listing.get('precio_cop', 0):,} | "
                f"hab={listing.get('habitaciones')} | "
                f"lat={listing.get('lat')} | barrio_id={listing.get('barrio_id')}"
            )
        else:
            try:
                upsert_listing(conn, listing)
                saved += 1
            except Exception as e:
                print(f"  DB error for {listing.get('url')}: {e}")

    conn.close()
    print(f"\nVRBO: {len(all_results)} parsed, {saved} saved to raw.listings_premium")
    return all_results


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="VRBO scraper — Valle de Aburrá")
    ap.add_argument("--dry-run", action="store_true", help="Parse only, no DB writes")
    ap.add_argument("--debug", action="store_true", help="Print raw API structure")
    ap.add_argument("--max-pages", type=int, default=MAX_PAGES)
    ap.add_argument(
        "--only",
        help="Comma-separated locations (e.g. 'Medellín,Envigado')",
    )
    args = ap.parse_args()
    only_list = [x.strip() for x in args.only.split(",")] if args.only else None
    scrape(
        dry_run=args.dry_run,
        only=only_list,
        max_pages=args.max_pages,
        debug=args.debug,
    )
