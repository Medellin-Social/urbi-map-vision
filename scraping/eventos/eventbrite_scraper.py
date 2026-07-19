"""
Eventbrite scraper — Playwright + API interception.

Strategy:
  1. Load each search URL with Playwright (headless Chromium)
  2. Intercept /api/v3/destination/events/ responses automatically fired by the page
     → returns full event objects with image.url, venue lat/lon, ticket_availability
  3. Paginate via ?page=N within the same browser context
  4. Deduplicate by event ID, filter Valle de Aburrá + presencial events

All 19 events/page come with photo URLs from the API — no detail page needed.

Usage:
  python scraping/eventos/eventbrite_scraper.py [--test]
"""
import argparse
import asyncio
import json
import re
import sys
import time
import urllib.parse
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).parent))

FUENTE = "eventbrite"

EVENTBRITE_URLS = [
    # Medellín general
    "https://www.eventbrite.co/d/colombia--medell%C3%ADn/all-events/",
    "https://www.eventbrite.co/d/colombia--antioquia/all-events/",
    # Medellín por categoría
    "https://www.eventbrite.co/d/colombia--medell%C3%ADn/free--events/",
    "https://www.eventbrite.co/d/colombia--medell%C3%ADn/music--events/",
    "https://www.eventbrite.co/d/colombia--medell%C3%ADn/food-and-drink--events/",
    "https://www.eventbrite.co/d/colombia--medell%C3%ADn/health--events/",
    "https://www.eventbrite.co/d/colombia--medell%C3%ADn/arts--events/",
    "https://www.eventbrite.co/d/colombia--medell%C3%ADn/community--events/",
    "https://www.eventbrite.co/d/colombia--medell%C3%ADn/sports--events/",
    "https://www.eventbrite.co/d/colombia--medell%C3%ADn/nightlife--events/",
    # Municipios Valle de Aburrá
    "https://www.eventbrite.co/d/colombia--envigado/all-events/",
    "https://www.eventbrite.co/d/colombia--sabaneta/all-events/",
    "https://www.eventbrite.co/d/colombia--itagui/all-events/",
    "https://www.eventbrite.co/d/colombia--bello/all-events/",
    "https://www.eventbrite.co/d/colombia--la-estrella/all-events/",
    "https://www.eventbrite.co/d/colombia--caldas/all-events/",
]

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "es-CO,es;q=0.9,en;q=0.8",
}

BBOX_VALLE = {
    "lat_min": 5.9, "lat_max": 6.5,
    "lon_min": -75.8, "lon_max": -75.3,
}

_MUNICIPIOS_VALLE = {
    "medellín", "medellin", "envigado", "sabaneta",
    "itagüí", "itagui", "bello", "la estrella",
    "copacabana", "caldas", "girardota", "barbosa",
    "antioquia",
}


# ─── Image URL helpers ────────────────────────────────────────────────────────

def _decode_evbuc_url(raw_url: str) -> str:
    """Unwrap proxy URLs like https://img.evbuc.com/https%3A%2F%2Fcdn.evbuc.com/..."""
    if not raw_url:
        return raw_url
    if "img.evbuc.com/" in raw_url:
        encoded = raw_url.split("img.evbuc.com/", 1)[-1]
        decoded = urllib.parse.unquote(encoded)
        if decoded.startswith("http"):
            return decoded
    return raw_url


def _decode_next_image_url(url: str) -> str:
    """Unwrap Next.js image optimizer: /e/_next/image?url=https%3A%2F%2F..."""
    if "_next/image" not in url:
        return url
    match = re.search(r"url=([^&]+)", url)
    if match:
        decoded = urllib.parse.unquote(urllib.parse.unquote(match.group(1)))
        if decoded.startswith("http"):
            return decoded
    return url


def _extract_foto(raw: dict) -> Optional[str]:
    """Extract best-quality image URL from event dict."""
    img = raw.get("image")
    if isinstance(img, dict):
        url = (
            img.get("url")
            or (img.get("original") or {}).get("url")
            or img.get("edge_color_url")
        )
        if url:
            return _decode_evbuc_url(url)
    if isinstance(img, str) and img:
        return _decode_evbuc_url(img)
    # Fallback fields
    for fld in ("logo_url", "image_url", "thumbnail"):
        v = raw.get(fld)
        if v and isinstance(v, str):
            return _decode_evbuc_url(v)
    logo = raw.get("logo")
    if isinstance(logo, dict):
        url = logo.get("url") or (logo.get("original") or {}).get("url")
        if url:
            return _decode_evbuc_url(url)
    return None


def _extract_foto_from_page(og_url: str) -> Optional[str]:
    """Decode og:image from a loaded Eventbrite page (Next.js wrapper or direct)."""
    if not og_url:
        return None
    url = _decode_next_image_url(og_url)
    return _decode_evbuc_url(url) if url.startswith("http") else None


# ─── Valle de Aburrá filter ───────────────────────────────────────────────────

def _es_del_valle(lat: Optional[float], lon: Optional[float], extra_text: str = "") -> bool:
    if lat is not None and lon is not None:
        return (
            BBOX_VALLE["lat_min"] <= lat <= BBOX_VALLE["lat_max"]
            and BBOX_VALLE["lon_min"] <= lon <= BBOX_VALLE["lon_max"]
        )
    # Fallback: text search
    texto = extra_text.lower()
    return any(m in texto for m in _MUNICIPIOS_VALLE)


# ─── Normalizer ───────────────────────────────────────────────────────────────

def _normalizar(raw: dict) -> Optional[dict]:
    # Drop online / cancelled events
    if raw.get("is_online_event") or raw.get("is_cancelled"):
        return None

    venue = raw.get("primary_venue") or {}
    venue_name = (venue.get("name") or "").lower()
    if venue_name in ("online", "online event", "virtual"):
        return None

    addr = venue.get("address") or {}
    city = (addr.get("city") or "").lower()
    region = (addr.get("region") or "").lower()

    try:
        lat = float(addr["latitude"]) if addr.get("latitude") else None
        lon = float(addr["longitude"]) if addr.get("longitude") else None
    except (TypeError, ValueError):
        lat = lon = None

    extra = f"{city} {region} {raw.get('name', '')}"
    if not _es_del_valle(lat, lon, extra):
        return None

    # Photo
    foto_url = _extract_foto(raw)

    # Price — keep original currency (USD for international events)
    ta = raw.get("ticket_availability") or {}
    is_free = ta.get("is_free", True)
    precio = 0.0
    moneda = "COP"
    if not is_free:
        min_price = ta.get("minimum_ticket_price") or {}
        moneda = min_price.get("currency", "COP") or "COP"
        try:
            # major_value is a decimal string like "19.15" — only strip commas
            precio = float(str(min_price.get("major_value", "0")).replace(",", ""))
        except (TypeError, ValueError):
            precio = 0.0

    # Date — API returns start_date + start_time separately
    start_date = raw.get("start_date") or ""
    start_time = raw.get("start_time") or ""
    if start_date and start_time:
        fecha_inicio = f"{start_date}T{start_time}"
    elif start_date:
        fecha_inicio = start_date
    else:
        start_obj = raw.get("start") or {}
        fecha_inicio = start_obj.get("local") or start_obj.get("utc") or ""

    if not fecha_inicio:
        return None

    # Skip past events
    try:
        fecha_dt = datetime.fromisoformat(fecha_inicio.replace("Z", "+00:00"))
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        if fecha_dt.replace(tzinfo=None) < now:
            return None
    except (ValueError, TypeError):
        pass

    # Organizer
    org = raw.get("primary_organizer") or raw.get("organizer") or {}
    org_name = org.get("name", "") if isinstance(org, dict) else str(org)

    # Category from tags
    cat = ""
    for tag in (raw.get("tags") or []):
        if isinstance(tag, dict) and tag.get("prefix") == "EventbriteCategory":
            cat = tag.get("display_name", "")
            break

    return {
        "fuente": FUENTE,
        "fuente_id": str(raw.get("id") or raw.get("eid") or raw.get("eventbrite_event_id") or ""),
        "titulo": raw.get("name", ""),
        "descripcion": (raw.get("summary") or "")[:500],
        "foto_url": foto_url,
        "url_externo": raw.get("url", ""),
        "fecha_inicio": fecha_inicio,
        "fecha_fin": None,
        "gratuito": bool(is_free or precio == 0),
        "precio": precio,
        "moneda": moneda,
        "organizador": org_name,
        "lat": lat,
        "lon": lon,
        "direccion": addr.get("localized_address_display") or addr.get("address_1") or "",
        "categoria_raw": cat,
    }


# ─── Playwright scraping ──────────────────────────────────────────────────────

_SERVER_DATA_RE = re.compile(
    r'window\.__SERVER_DATA__\s*=\s*(\{.+?\});',
    re.DOTALL,
)


async def _scrape_url(
    context,  # Playwright BrowserContext
    url: str,
    max_pages: int = 5,
) -> list[dict]:
    """Load one search URL, intercept destination/events API, paginate."""
    page = await context.new_page()
    captured: list[dict] = []

    async def on_response(resp):
        if "/api/v3/destination/events/" in resp.url and resp.status == 200:
            try:
                data = await resp.json()
                evts = data.get("events") or []
                if evts:
                    captured.extend(evts)
            except Exception:
                pass

    page.on("response", on_response)

    page_count = 1
    for pg in range(1, max_pages + 1):
        pg_url = url if pg == 1 else f"{url}?page={pg}"
        # Retry once on network error
        for attempt in range(2):
            try:
                await page.goto(pg_url, wait_until="domcontentloaded", timeout=60000)
                await asyncio.sleep(2)
                break
            except Exception as exc:
                if attempt == 0:
                    await asyncio.sleep(3)
                    continue
                print(f"  [eventbrite] goto error pg{pg}: {exc}")
                pg = max_pages  # break outer loop
                break

        # Read page_count once from __SERVER_DATA__
        if pg == 1:
            try:
                raw_sd = await page.evaluate(
                    "() => { const el = document.getElementById('__SERVER_DATA__'); return el ? el.textContent : null; }"
                )
                if raw_sd:
                    sd = json.loads(raw_sd)
                    page_count = int(sd.get("page_count") or 1)
            except Exception:
                pass

        if pg >= page_count:
            break

    await page.close()
    return captured


async def _run_async(urls: list[str]) -> list[dict]:
    from playwright.async_api import async_playwright

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        context = await browser.new_context(
            user_agent=HEADERS["User-Agent"],
            locale="es-CO",
            extra_http_headers={"Accept-Language": HEADERS["Accept-Language"]},
        )

        seen_ids: set[str] = set()
        all_events: list[dict] = []
        total_raw = 0

        for url in urls:
            short = url.split("eventbrite.co/d/")[-1].rstrip("/")
            print(f"[eventbrite] {short}")
            try:
                raw_events = await _scrape_url(context, url)
            except Exception as exc:
                print(f"  error: {exc}")
                raw_events = []

            new_raw = 0
            for raw in raw_events:
                ev_id = str(
                    raw.get("id") or raw.get("eid") or raw.get("eventbrite_event_id") or ""
                )
                if not ev_id or ev_id in seen_ids:
                    continue
                seen_ids.add(ev_id)
                new_raw += 1
                total_raw += 1

                ev = _normalizar(raw)
                if ev and ev["fuente_id"] and ev["titulo"]:
                    all_events.append(ev)

            print(f"  +{new_raw} únicos → {len(all_events)} total Valle")
            await asyncio.sleep(2)

        await browser.close()
        print(f"[eventbrite] {total_raw} eventos únicos brutos → {len(all_events)} Valle de Aburrá")
        return all_events


# ─── Public interface ─────────────────────────────────────────────────────────

def run(test: bool = False) -> list[dict]:
    urls = EVENTBRITE_URLS[:4] if test else EVENTBRITE_URLS
    eventos = asyncio.run(_run_async(urls))

    if test:
        con_foto   = sum(1 for e in eventos if e.get("foto_url"))
        con_coords = sum(1 for e in eventos if e.get("lat"))
        gratis     = sum(1 for e in eventos if e.get("gratuito"))
        print(f"[eventbrite] {len(eventos)} eventos | {con_foto} con foto | {con_coords} con coords | {gratis} gratis")
        for e in eventos[:5]:
            print(f"  - {e['titulo'][:50]} | foto={'✓' if e.get('foto_url') else '✗'} | {e.get('lat','?')},{e.get('lon','?')}")

    return eventos


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--test", action="store_true")
    parser.add_argument("--ciudad", default="medellin")
    args = parser.parse_args()
    resultados = run(test=True)
    print(f"\nTotal: {len(resultados)} eventos Eventbrite")
