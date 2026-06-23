"""
Airbnb monthly stays scraper — Valle de Aburrá  (v2)

Strategy:
  - Search Airbnb with flexible_trip_lengths[]=one_month per neighborhood
  - Intercept /api/v3/ JSON responses from search page to get coords directly
    (replaces the fragile base64 demandStayListing regex from v1)
  - For each listing, optionally visit the detail page and intercept
    StaysPdpSections to extract: description, photos, area_m2, amenidades
  - Price still parsed from card HTML (most reliable COP source)
  - Barrio assigned via PostGIS ST_Contains (coords from API) or fuzzy match

New vs v1:
  - Removed: _COORD_PATTERN regex, _extract_coords_from_html()
  - Added:   _capture_api_responses(), _coords_from_api(), _detail_from_api()
  - Added:   --detail-limit flag, --save-raw flag

Run:
  python scraping/renta_media/airbnb_mensual_scraper.py --dry-run --max-pages 1
  python scraping/renta_media/airbnb_mensual_scraper.py --detail-limit 5 --dry-run
  python scraping/renta_media/airbnb_mensual_scraper.py --max-pages 2 --detail-limit 20
"""
import json
import re
import sys
import time
from pathlib import Path
from typing import Optional

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
    update_listing_detail,
)

FUENTE = "airbnb_mensual"
BASE_URL = "https://www.airbnb.com"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
PAGE_DELAY = 7        # seconds after page load before reading content
DETAIL_DELAY = 5      # seconds after detail page load
MAX_PAGES = 5         # search pages per location (18 listings/page → max 90)

# Valle de Aburrá bounding box for coord sanity check
LAT_MIN, LAT_MAX = 5.95, 6.55
LNG_MIN, LNG_MAX = -75.85, -75.30

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

_AIRBNB_API_RE = re.compile(r"airbnb\.com(?:\.co)?/api/v3/")


# ---------------------------------------------------------------------------
# Coord helpers
# ---------------------------------------------------------------------------

def barrio_from_coords(conn, lat: float, lon: float) -> Optional[int]:
    """PostGIS point-in-polygon lookup against raw.barrios."""
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id FROM raw.barrios
                WHERE ST_Contains(geometry, ST_SetSRID(ST_Point(%s, %s), 4326))
                LIMIT 1
                """,
                (lon, lat),
            )
            row = cur.fetchone()
            return row[0] if row else None
    except Exception:
        return None


def _in_valle(lat, lon) -> bool:
    try:
        return LAT_MIN <= float(lat) <= LAT_MAX and LNG_MIN <= float(lon) <= LNG_MAX
    except (TypeError, ValueError):
        return False


# ---------------------------------------------------------------------------
# Deep recursive JSON search
# ---------------------------------------------------------------------------

def _search_deep(data, key: str, max_depth: int = 10, _d: int = 0) -> list:
    """Return all non-None values for `key` anywhere in nested JSON."""
    if _d > max_depth or not isinstance(data, (dict, list)):
        return []
    results = []
    if isinstance(data, dict):
        val = data.get(key)
        if val is not None:
            results.append(val)
        for v in data.values():
            results.extend(_search_deep(v, key, max_depth, _d + 1))
    elif isinstance(data, list):
        for item in data:
            results.extend(_search_deep(item, key, max_depth, _d + 1))
    return results


# ---------------------------------------------------------------------------
# Network interception
# ---------------------------------------------------------------------------

def _capture_api_responses(page, url: str, wait_secs: int = PAGE_DELAY) -> list[dict]:
    """
    Navigate to `url` and capture all /api/v3/ JSON responses.
    Returns list of {"url": ..., "data": <parsed JSON>}.
    Logs a warning if 0 API responses captured (Airbnb may have changed structure).
    """
    captured: list[dict] = []

    def on_response(response):
        if response.status == 200 and _AIRBNB_API_RE.search(response.url):
            try:
                body = response.json()
                captured.append({"url": response.url, "data": body})
            except Exception:
                pass

    page.on("response", on_response)
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=35000)
        time.sleep(wait_secs)
    except Exception as e:
        print(f"  [WARN] page load error: {e}")
    finally:
        page.remove_listener("response", on_response)

    if not captured:
        print(
            "  [WARN] 0 /api/v3/ responses captured — Airbnb may have changed "
            "endpoint or bot detection triggered. Coords will be unavailable."
        )
    else:
        print(f"  [INFO] captured {len(captured)} API responses")

    return captured


# ---------------------------------------------------------------------------
# Extract coords from search page API responses
# ---------------------------------------------------------------------------

def _coords_from_api(responses: list[dict]) -> dict[str, tuple[float, float]]:
    """
    Parse {room_id: (lat, lon)} from StaysSearch / ExploreSearch API responses.

    Airbnb's GraphQL response nests listing objects at varying depths.
    We use recursive search for "listing" dicts that contain both id and lat/lng.
    Returns only coords that fall within Valle de Aburrá bbox.
    """
    coords: dict[str, tuple[float, float]] = {}

    for resp in responses:
        data = resp.get("data", {})

        # Find all "listing" objects anywhere in the response
        listing_objs = _search_deep(data, "listing", max_depth=12)
        for listing in listing_objs:
            if not isinstance(listing, dict):
                continue
            room_id = str(listing.get("id") or listing.get("listingId") or "")
            if not room_id:
                continue

            lat = listing.get("lat") or listing.get("latitude")
            lon = (
                listing.get("lng")
                or listing.get("lon")
                or listing.get("longitude")
            )

            if lat is not None and lon is not None:
                try:
                    lat_f, lon_f = float(lat), float(lon)
                    if _in_valle(lat_f, lon_f):
                        coords[room_id] = (lat_f, lon_f)
                except (TypeError, ValueError):
                    pass

    return coords


# ---------------------------------------------------------------------------
# Extract coords from HTML (DemandStayListing blocks — Hyperloop era)
# ---------------------------------------------------------------------------

def _extract_coords_from_html(html: str) -> dict[str, tuple[float, float]]:
    """
    Parse {room_id: (lat, lon)} from DemandStayListing GraphQL objects embedded
    in the page HTML. Airbnb encodes room IDs as base64("DemandStayListing:{id}").
    Fallback when /api/v3/ interception returns nothing (redirect to .com.co or
    StaysSearch not firing in headless mode).
    """
    import base64
    coords: dict[str, tuple[float, float]] = {}

    _DEMANDLISTING_RE = re.compile(
        r'"DemandStayListing","id":"([^"]+)".{0,400}?"latitude"\s*:\s*([-\d.]+)'
        r'.{0,50}?"longitude"\s*:\s*([-\d.]+)',
        re.DOTALL,
    )
    for m in _DEMANDLISTING_RE.finditer(html):
        b64_id, lat_s, lon_s = m.group(1), m.group(2), m.group(3)
        try:
            decoded = base64.b64decode(b64_id).decode()
            # "DemandStayListing:14566994420195379401"
            room_id = decoded.split(":")[-1]
            lat_f, lon_f = float(lat_s), float(lon_s)
            if _in_valle(lat_f, lon_f):
                coords[room_id] = (lat_f, lon_f)
        except Exception:
            pass

    return coords


# ---------------------------------------------------------------------------
# Extract rich detail from detail page HTML (Schema.org + niobeClientData)
# ---------------------------------------------------------------------------

def _extract_detail_from_html(html: str) -> dict:
    """
    Extract description, photos, lat/lon, amenidades from Airbnb detail page HTML.
    Uses two embedded sources:
      1. Schema.org <script type="application/ld+json"> VacationRental — description, images, coords
      2. <script type="application/json"> niobeClientData — AmenityItem list
    """
    result = {
        "descripcion": None, "fotos": None, "lat": None, "lon": None,
        "area_m2": None, "habitaciones": None, "banos": None, "amenidades": None,
    }

    # --- Source 1: Schema.org VacationRental ---
    schema_re = re.compile(r'<script[^>]+type="application/ld\+json"[^>]*>(.+?)</script>', re.DOTALL)
    for m in schema_re.finditer(html):
        try:
            data = json.loads(m.group(1))
        except json.JSONDecodeError:
            continue
        if data.get("@type") != "VacationRental":
            continue
        result["descripcion"] = data.get("description") or None
        images = data.get("image") or []
        if isinstance(images, str):
            images = [images]
        fotos = [img for img in images if isinstance(img, str) and img.startswith("http")][:12]
        result["fotos"] = fotos or None
        try:
            result["lat"] = float(data["latitude"]) if "latitude" in data else None
            result["lon"] = float(data["longitude"]) if "longitude" in data else None
        except (TypeError, ValueError):
            pass
        # Area heuristic from description ("30 m2", "50m²")
        if result["descripcion"]:
            area_m = re.search(r'(\d{2,3})\s*m[²2]', result["descripcion"], re.IGNORECASE)
            if area_m:
                val = int(area_m.group(1))
                if 10 <= val <= 800:
                    result["area_m2"] = float(val)
        break

    # --- Source 2: niobeClientData → amenities ---
    json_re = re.compile(r'<script[^>]+type="application/json"[^>]*>(.+?)</script>', re.DOTALL)
    for m in json_re.finditer(html):
        raw = m.group(1)
        if "niobeClientData" not in raw:
            continue
        try:
            niobe = json.loads(raw)
        except json.JSONDecodeError:
            dec = json.JSONDecoder()
            try:
                niobe, _ = dec.raw_decode(raw)
            except Exception:
                continue
        amenidades = []
        amenity_re_inner = re.compile(
            r'"AmenityItem"[^}]*"available"\s*:\s*true[^}]*"title"\s*:\s*"([^"]+)"'
        )
        for title in amenity_re_inner.findall(raw):
            amenidades.append(title)
        if amenidades:
            result["amenidades"] = list(dict.fromkeys(amenidades))[:30]
        break

    return result


# ---------------------------------------------------------------------------
# Extract rich detail from listing detail page API responses
# ---------------------------------------------------------------------------

def _detail_from_api(responses: list[dict]) -> dict:
    """
    Parse description, photos, area, amenidades from StaysPdpSections responses.

    Returns dict with keys: lat, lon, descripcion, fotos, area_m2,
                            habitaciones, banos, amenidades
    All keys are present; values may be None.

    Logs captured response operation names if fields not found, to aid debugging.
    """
    result: dict = {
        "lat":          None,
        "lon":          None,
        "descripcion":  None,
        "fotos":        None,
        "area_m2":      None,
        "habitaciones": None,
        "banos":        None,
        "amenidades":   None,
    }

    if not responses:
        return result

    ops = [r["url"].split("/")[-1].split("?")[0] for r in responses]
    print(f"    [DBG] operations captured: {ops[:10]}")

    all_data: list[dict] = [r.get("data", {}) for r in responses]

    # --- Coords ---
    for data in all_data:
        lats = [v for v in _search_deep(data, "lat") if isinstance(v, (int, float))]
        lons = [v for v in _search_deep(data, "lng") if isinstance(v, (int, float))]
        # also try "longitude" key variant
        if not lons:
            lons = [v for v in _search_deep(data, "longitude") if isinstance(v, (int, float))]
        for lat, lon in zip(lats, lons):
            if _in_valle(lat, lon):
                result["lat"] = float(lat)
                result["lon"] = float(lon)
                break
        if result["lat"]:
            break

    # --- Description ---
    for data in all_data:
        descs = _search_deep(data, "description", max_depth=12)
        for d in descs:
            if isinstance(d, str) and len(d) > 50:
                result["descripcion"] = d[:3000]
                break
            elif isinstance(d, dict):
                # Airbnb sometimes wraps: {"htmlText": "...", "translatedText": "..."}
                for sub_key in ("htmlText", "translatedText", "text", "value"):
                    text = d.get(sub_key, "")
                    if isinstance(text, str) and len(text) > 50:
                        result["descripcion"] = text[:3000]
                        break
            if result["descripcion"]:
                break
        if result["descripcion"]:
            break

    # --- Photos ---
    for data in all_data:
        # "baseUrl" is how Airbnb returns photo CDN URLs in PdpPhotoTourSection
        base_urls = [
            u for u in _search_deep(data, "baseUrl", max_depth=12)
            if isinstance(u, str) and "muscache.com" in u
        ]
        if base_urls:
            result["fotos"] = base_urls[:12]
            break
        # fallback: "picture" key
        pictures = [
            p for p in _search_deep(data, "picture", max_depth=12)
            if isinstance(p, str) and p.startswith("http")
        ]
        if pictures:
            result["fotos"] = pictures[:12]
            break

    # --- Bedrooms ---
    for data in all_data:
        bed_vals = _search_deep(data, "bedrooms", max_depth=10)
        for v in bed_vals:
            try:
                vi = int(v)
                if 0 <= vi <= 20:
                    result["habitaciones"] = vi
                    break
            except (TypeError, ValueError):
                pass
        if result["habitaciones"] is not None:
            break

    # --- Bathrooms ---
    for data in all_data:
        bath_vals = _search_deep(data, "bathrooms", max_depth=10)
        for v in bath_vals:
            try:
                vf = float(v)
                if 0 < vf <= 20:
                    result["banos"] = vf
                    break
            except (TypeError, ValueError):
                pass
        if result["banos"] is not None:
            break

    # --- Area ---
    for data in all_data:
        # "squareFeet" — convert to m²
        sqft_vals = _search_deep(data, "squareFeet", max_depth=10)
        for v in sqft_vals:
            try:
                vf = float(v)
                if 100 < vf < 10000:
                    result["area_m2"] = round(vf * 0.0929, 1)
                    break
            except (TypeError, ValueError):
                pass
        if result["area_m2"]:
            break

        # "roomSize" or similar in m² (value typically 20–500)
        if not result["area_m2"]:
            for key in ("roomSize", "size", "area", "squareMeters"):
                vals = _search_deep(data, key, max_depth=10)
                for v in vals:
                    try:
                        vf = float(v)
                        if 15 < vf < 600:
                            result["area_m2"] = round(vf, 1)
                            break
                    except (TypeError, ValueError):
                        pass
                if result["area_m2"]:
                    break

    # --- Amenidades ---
    for data in all_data:
        # Airbnb amenity sections have objects with "title" key
        # Filter for strings that look like amenity names (not listing titles)
        titles = [
            t for t in _search_deep(data, "title", max_depth=12)
            if isinstance(t, str) and 3 < len(t) < 60
        ]
        # Heuristic: look for batches of short strings in the same nested object
        # Better: look for "amenities" key which usually contains [{title: "..."}]
        amenity_lists = _search_deep(data, "amenities", max_depth=10)
        amenidades = []
        for alist in amenity_lists:
            if isinstance(alist, list):
                for item in alist:
                    if isinstance(item, dict):
                        name = item.get("title") or item.get("name") or item.get("label")
                        if name and isinstance(name, str) and len(name) < 80:
                            amenidades.append(name)
                    elif isinstance(item, str) and len(item) < 80:
                        amenidades.append(item)
        if amenidades:
            result["amenidades"] = list(dict.fromkeys(amenidades))[:30]  # dedup, max 30
            break

    # Debug: report what was found
    found = [k for k, v in result.items() if v is not None]
    missing = [k for k, v in result.items() if v is None]
    if missing:
        print(f"    [DBG] detail found: {found} | missing: {missing}")

    return result


# ---------------------------------------------------------------------------
# URL helpers
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Price parser
# ---------------------------------------------------------------------------

def _parse_cop(text: str) -> int:
    amounts = re.findall(r'\$([\d,]+)\s*COP', text)
    if not amounts:
        amounts = re.findall(r'\$([\d,]+)', text)
    for raw in reversed(amounts):
        val = int(raw.replace(",", ""))
        if 500_000 <= val <= 100_000_000:
            return val
    return 0


# ---------------------------------------------------------------------------
# Card parser (HTML — unchanged from v1)
# ---------------------------------------------------------------------------

def _parse_card(
    card,
    barrios: list[dict],
    municipio_hint: str,
    coords_map: dict[str, tuple[float, float]],
    conn,
) -> Optional[dict]:
    try:
        link = card.find("a", href=re.compile(r"/rooms/"))
        if not link:
            return None
        href = link.get("href", "")
        room_m = re.search(r"/rooms/(\d+)", href)
        if not room_m:
            return None
        room_id = room_m.group(1)
        url = f"{BASE_URL}/rooms/{room_id}"

        text = card.get_text(separator="|", strip=True)
        price_cop = _parse_cop(text)
        if not price_cop:
            return None

        title_el = card.find(attrs={"data-testid": "listing-card-name"})
        title = title_el.get_text(strip=True) if title_el else ""
        loc_el = card.find(attrs={"data-testid": "listing-card-title"})
        location = loc_el.get_text(strip=True) if loc_el else ""
        barrio_raw = title or location

        beds = None
        m_beds = re.search(r"(\d+)\s*habitaci[oó]n", text, re.I)
        if m_beds:
            beds = int(m_beds.group(1))
        elif re.search(r"estudio|studio", text, re.I):
            beds = 0

        baths = None
        m_baths = re.search(r"(\d+)\s*ba[ñn]o", text, re.I)
        if m_baths:
            baths = float(m_baths.group(1))

        lat, lon = None, None
        barrio_id = None

        # Use coords from intercepted API (replaces fragile regex)
        if room_id in coords_map:
            lat, lon = coords_map[room_id]
            barrio_id = barrio_from_coords(conn, lat, lon)

        if not barrio_id:
            barrio_id = match_barrio(barrio_raw, barrios, municipio_hint=municipio_hint)

        return {
            "fuente":           FUENTE,
            "titulo":           f"{title} | {location}"[:500] if title else location[:500],
            "precio_mes_cop":   price_cop,
            "precio_mes_usd":   round(price_cop / USD_TO_COP, 2),
            "area_m2":          None,
            "habitaciones":     beds,
            "banos":            baths,
            "barrio_raw":       barrio_raw[:200] or None,
            "barrio_id":        barrio_id,
            "amoblado":         True,
            "incluye_servicios": None,
            "min_noches":       28,
            "url":              url[:500],
            "lat":              lat,
            "lon":              lon,
            "dedup_hash":       make_dedup_hash(FUENTE, url),
        }
    except Exception as e:
        print(f"    Card parse error: {e}")
        return None


def _extract_cards(
    html: str,
    barrios: list[dict],
    municipio_hint: str,
    coords_map: dict[str, tuple[float, float]],
    conn,
) -> list[dict]:
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

        card = link
        for _ in range(8):
            card = card.parent
            if not card:
                break
            if card.find(attrs={"data-testid": "price-availability-row"}):
                break

        if not card:
            continue

        listing = _parse_card(card, barrios, municipio_hint, coords_map, conn)
        if listing:
            results.append(listing)

    return results


# ---------------------------------------------------------------------------
# Main scrape
# ---------------------------------------------------------------------------

def scrape(
    dry_run: bool = False,
    max_pages: int = MAX_PAGES,
    detail_limit: int = 0,
    save_raw: bool = False,
) -> list[dict]:
    conn = get_conn()
    ensure_table(conn)
    barrios = load_barrios(conn)

    all_results: list[dict] = []
    seen_urls: set[str] = set()

    raw_dir = Path("/tmp/airbnb_raw")
    if save_raw:
        raw_dir.mkdir(parents=True, exist_ok=True)

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

        # ── PHASE 1: Search pages ──────────────────────────────────────────
        for loc_name, slug, municipio_hint in SEARCH_LOCATIONS:
            print(f"\n  [{loc_name}] [{municipio_hint}]")
            loc_total = 0

            for page_num in range(max_pages):
                offset = page_num * 18
                url = _make_url(slug, offset)

                # Intercept /api/v3/ responses to get coords from StaysSearch
                responses = _capture_api_responses(page, url, wait_secs=PAGE_DELAY)
                coords_map = _coords_from_api(responses)

                if save_raw and responses:
                    fname = raw_dir / f"search_{loc_name}_{page_num}.json"
                    fname.write_text(
                        json.dumps(responses, ensure_ascii=False, default=str),
                        encoding="utf-8",
                    )

                html = page.content()

                # Fallback: extract coords from DemandStayListing blocks in HTML
                html_coords = _extract_coords_from_html(html)
                if html_coords:
                    coords_map = {**html_coords, **coords_map}  # API wins on conflict

                cards = _extract_cards(html, barrios, municipio_hint, coords_map, conn)

                with_coords_api = len(coords_map)
                new = [c for c in cards if c["url"] not in seen_urls]
                for c in new:
                    seen_urls.add(c["url"])
                all_results.extend(new)
                loc_total += len(new)

                with_coords = sum(1 for c in new if c.get("lat"))
                with_barrio = sum(1 for c in new if c.get("barrio_id"))
                print(
                    f"    p{page_num+1}: {len(new)} new | "
                    f"api_coords={with_coords_api} | "
                    f"card_coords={with_coords} | "
                    f"barrio={with_barrio} | cumulative={len(all_results)}"
                )

                if len(cards) < 16:
                    break

                time.sleep(2)

            print(f"  → {loc_name}: {loc_total} listings")

        # ── PHASE 2: Detail pages (optional, bounded by detail_limit) ──────
        if detail_limit > 0:
            print(f"\n  ── Detail pages (limit={detail_limit}) ──")

            # Prioritise: listings without coords, then rest
            no_coords = [c for c in all_results if not c.get("lat")]
            has_coords = [c for c in all_results if c.get("lat")]
            to_detail = (no_coords + has_coords)[:detail_limit]

            detail_ok = 0
            for i, card in enumerate(to_detail):
                room_url = card["url"]
                print(f"  [{i+1}/{len(to_detail)}] {room_url}")

                responses = _capture_api_responses(page, room_url, wait_secs=DETAIL_DELAY)

                if save_raw and responses:
                    room_id = re.search(r"/rooms/(\d+)", room_url)
                    rid = room_id.group(1) if room_id else str(i)
                    fname = raw_dir / f"detail_{rid}.json"
                    fname.write_text(
                        json.dumps(responses, ensure_ascii=False, default=str),
                        encoding="utf-8",
                    )

                # Primary: HTML extraction (Schema.org + niobeClientData)
                # Secondary: API responses (fills gaps if API ever fires)
                detail = _extract_detail_from_html(page.content())
                api_detail = _detail_from_api(responses)
                for k, v in api_detail.items():
                    if v is not None and detail.get(k) is None:
                        detail[k] = v

                # Merge into card dict (in-memory, for dry-run reporting)
                if detail.get("lat") and not card.get("lat"):
                    card["lat"] = detail["lat"]
                    card["lon"] = detail["lon"]
                    if not card.get("barrio_id"):
                        card["barrio_id"] = barrio_from_coords(conn, card["lat"], card["lon"])

                for field in ("area_m2", "habitaciones", "banos"):
                    if detail.get(field) and not card.get(field):
                        card[field] = detail[field]

                card["_detail"] = detail  # carry forward for upsert below

                any_rich = any(detail.get(k) for k in ("descripcion", "fotos", "lat"))
                if any_rich:
                    detail_ok += 1

                print(
                    f"    desc={bool(detail.get('descripcion'))} "
                    f"fotos={len(detail.get('fotos') or [])} "
                    f"area={detail.get('area_m2')} "
                    f"lat={detail.get('lat')}"
                )

                time.sleep(2)

            print(f"\n  Detail success: {detail_ok}/{len(to_detail)} listings with rich data")

        browser.close()

    # ── SAVE ──────────────────────────────────────────────────────────────
    saved = 0
    detail_updated = 0
    for listing in all_results:
        detail = listing.pop("_detail", None)

        if dry_run:
            print(
                f"  DRY: {(listing.get('titulo') or '?')[:40]} | "
                f"COP {listing.get('precio_mes_cop', 0):,} | "
                f"lat={listing.get('lat')} | "
                f"area={listing.get('area_m2')} | "
                f"barrio_id={listing.get('barrio_id')}"
            )
            if detail:
                print(
                    f"       desc={bool(detail.get('descripcion'))} "
                    f"fotos={len(detail.get('fotos') or [])} "
                    f"amenidades={len(detail.get('amenidades') or [])}"
                )
        else:
            try:
                upsert_listing(conn, listing)
                saved += 1

                if detail:
                    ok = update_listing_detail(
                        conn,
                        url=listing["url"],
                        descripcion=detail.get("descripcion"),
                        fotos=detail.get("fotos"),
                        amenidades=detail.get("amenidades"),
                        lat=detail.get("lat") if not listing.get("lat") else None,
                        lon=detail.get("lon") if not listing.get("lon") else None,
                        area_m2=detail.get("area_m2"),
                        habitaciones=detail.get("habitaciones"),
                        banos=detail.get("banos"),
                    )
                    if ok:
                        detail_updated += 1
            except Exception as e:
                print(f"  DB error for {listing.get('url')}: {e}")

    conn.close()
    print(
        f"\nAirbnb mensual: {len(all_results)} parsed, "
        f"{saved} saved, {detail_updated} detail-enriched"
    )
    return all_results


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(description="Airbnb monthly stays scraper — Valle de Aburrá v2")
    ap.add_argument("--dry-run",      action="store_true", help="Parse only, no DB writes")
    ap.add_argument("--max-pages",    type=int, default=MAX_PAGES,
                    help=f"Search pages per location (default {MAX_PAGES})")
    ap.add_argument("--detail-limit", type=int, default=0,
                    help="Visit at most N listing detail pages for rich fields (default 0 = skip)")
    ap.add_argument("--save-raw",     action="store_true",
                    help="Save raw captured API JSON to /tmp/airbnb_raw/ for debugging")
    args = ap.parse_args()

    scrape(
        dry_run=args.dry_run,
        max_pages=args.max_pages,
        detail_limit=args.detail_limit,
        save_raw=args.save_raw,
    )
