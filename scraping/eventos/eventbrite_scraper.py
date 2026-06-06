"""
Eventbrite scraper — web scraping via requests + BeautifulSoup.

Public search API was removed in 2020. Extracts JSON-LD (application/ld+json)
and window.__SERVER_DATA__ embedded in HTML.

Usage:
  python scraping/eventos/eventbrite_scraper.py --test
"""
import argparse
import json
import re
import sys
import time
from pathlib import Path
from typing import Any

import requests
from bs4 import BeautifulSoup

sys.path.insert(0, str(Path(__file__).parent))

FUENTE = "eventbrite"

CATEGORIAS = [
    "music",
    "business",
    "food-and-drink",
    "community",
    "arts",
    "sports-and-fitness",
    "health",
    "science-and-tech",
    "travel-and-outdoor",
    "charity-and-causes",
]

BASE_URL = "https://www.eventbrite.com/d/colombia--medell%C3%ADn/{categoria}/"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "es-CO,es;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
}

_SERVER_DATA_RE = re.compile(r'window\.__SERVER_DATA__\s*=\s*(\{.+?\})(?:;|\s*</script>)', re.DOTALL)
_NEXT_DATA_RE = re.compile(r'<script[^>]+id="__NEXT_DATA__"[^>]*>(.+?)</script>', re.DOTALL)

_DESC_SELECTORS = [
    {"name": "div", "attrs": {"data-testid": "structured-content-rich-text"}},
    {"name": "div", "class_": "structured-content-rich-text"},
    {"name": "div", "class_": "eds-text--left"},
    {"name": "section", "class_": "event-description"},
    {"name": "div", "class_": "event-description"},
]


def _fetch_detail(url: str) -> dict:
    """Fetch event detail page and extract description + foto_url."""
    result: dict = {"descripcion": "", "foto_url": None}
    if not url:
        return result
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        if r.status_code != 200:
            return result
        soup = BeautifulSoup(r.content, "html.parser")
        # JSON-LD — most reliable for both description and image
        for script in soup.find_all("script", type="application/ld+json"):
            try:
                data = json.loads(script.string or "")
                items = data if isinstance(data, list) else [data]
                for item in items:
                    if item.get("@type") == "Event":
                        if not result["descripcion"] and item.get("description"):
                            result["descripcion"] = item["description"][:2000]
                        if not result["foto_url"]:
                            img = item.get("image")
                            if isinstance(img, list):
                                result["foto_url"] = img[0] if img else None
                            elif isinstance(img, str):
                                result["foto_url"] = img
                        if result["descripcion"] and result["foto_url"]:
                            return result
            except Exception:
                pass
        # DOM fallback for description
        if not result["descripcion"]:
            for sel in _DESC_SELECTORS:
                klass = sel.pop("class_", None)
                kwargs = {**sel}
                if klass:
                    kwargs["class_"] = klass
                el = soup.find(**kwargs)
                if el:
                    result["descripcion"] = el.get_text(separator=" ", strip=True)[:2000]
                    break
        # OG image fallback
        if not result["foto_url"]:
            og = soup.find("meta", property="og:image")
            if og:
                result["foto_url"] = og.get("content")
        # Make relative URLs absolute and unwrap Next.js image proxy
        if result["foto_url"]:
            fu = result["foto_url"]
            if fu.startswith("/"):
                fu = "https://www.eventbrite.com" + fu
            # Unwrap Next.js proxy: /e/_next/image?url=<encoded>&...
            import urllib.parse as _up
            if "_next/image" in fu:
                qs = _up.urlparse(fu).query
                inner = _up.parse_qs(qs).get("url", [""])[0]
                if inner:
                    fu = _up.unquote(inner)
            result["foto_url"] = fu
    except Exception:
        pass
    return result


def _extract_jsonld(soup: BeautifulSoup) -> list[dict]:
    eventos = []
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
            if isinstance(data, list):
                eventos.extend(
                    item for item in data if isinstance(item, dict)
                    and item.get("@type") == "Event"
                )
            elif isinstance(data, dict) and data.get("@type") == "Event":
                eventos.append(data)
        except Exception:
            pass
    return eventos


def _extract_server_data(html: str) -> list[dict]:
    m = _SERVER_DATA_RE.search(html)
    if not m:
        return []
    try:
        data = json.loads(m.group(1))
        # Navigate to search_data.events.results
        results = (
            data.get("search_data", {})
            .get("events", {})
            .get("results", [])
        )
        return results if isinstance(results, list) else []
    except Exception:
        return []


def normalizar_jsonld(raw: dict, categoria: str) -> dict | None:
    loc = raw.get("location") or {}
    # VirtualLocation → descartar
    loc_type = loc.get("@type", "")
    if "Virtual" in loc_type or "Online" in loc_type:
        return None
    venue_name = (loc.get("name") or "").lower()
    if venue_name in ("online", "online event", "virtual"):
        return None

    geo = loc.get("geo") or {}
    org = raw.get("organizer") or {}
    offers = raw.get("offers") or {}
    if isinstance(offers, list):
        offers = offers[0] if offers else {}

    precio = 0.0
    try:
        precio = float(offers.get("price", 0) or 0)
    except (TypeError, ValueError):
        pass

    gratuito = raw.get("isAccessibleForFree", precio == 0)

    return {
        "fuente": FUENTE,
        "fuente_id": raw.get("identifier") or raw.get("url", "").split("-")[-1],
        "titulo": raw.get("name", ""),
        "descripcion": (raw.get("description") or "")[:2000],
        "foto_url": raw.get("image") or None,
        "url_externo": raw.get("url", ""),
        "fecha_inicio": raw.get("startDate"),
        "fecha_fin": raw.get("endDate"),
        "gratuito": bool(gratuito),
        "precio": precio,
        "organizador": org.get("name", "") if isinstance(org, dict) else str(org),
        "lat": float(geo["latitude"]) if geo.get("latitude") else None,
        "lon": float(geo["longitude"]) if geo.get("longitude") else None,
        "categoria_raw": categoria,
    }


def normalizar_server_event(raw: dict, categoria: str) -> dict | None:
    """Normalize event from window.__SERVER_DATA__ results format."""
    if raw.get("isVirtual") or raw.get("is_online"):
        return None
    primary_venue = raw.get("primary_venue") or {}
    venue_name = (primary_venue.get("name") or "").lower()
    if venue_name in ("online", "online event", "virtual"):
        return None
    address = primary_venue.get("address") or {}
    lat = address.get("latitude")
    lon = address.get("longitude")

    precio = 0.0
    try:
        cost = raw.get("converted_donation_settings") or raw.get("ticket_availability") or {}
        min_price = cost.get("minimum_ticket_price") or {}
        precio = float(min_price.get("major_value", 0) or 0)
    except (TypeError, ValueError):
        pass

    return {
        "fuente": FUENTE,
        "fuente_id": str(raw.get("id", "")),
        "titulo": raw.get("name", {}).get("text", "") if isinstance(raw.get("name"), dict) else raw.get("name", ""),
        "descripcion": (raw.get("description") or {}).get("text", "")[:2000] if isinstance(raw.get("description"), dict) else "",
        "foto_url": (raw.get("logo") or {}).get("url") if isinstance(raw.get("logo"), dict) else None,
        "url_externo": raw.get("url", ""),
        "fecha_inicio": (raw.get("start") or {}).get("utc") if isinstance(raw.get("start"), dict) else raw.get("start_date"),
        "fecha_fin": (raw.get("end") or {}).get("utc") if isinstance(raw.get("end"), dict) else raw.get("end_date"),
        "gratuito": raw.get("is_free", precio == 0),
        "precio": precio,
        "organizador": "",
        "lat": float(lat) if lat else None,
        "lon": float(lon) if lon else None,
        "categoria_raw": categoria,
    }


def scrape_categoria(categoria: str) -> list[dict]:
    url = BASE_URL.format(categoria=categoria)
    try:
        r = requests.get(url, headers=HEADERS, timeout=20)
        if r.status_code != 200:
            print(f"[eventbrite] HTTP {r.status_code} para {categoria}")
            return []
    except Exception as exc:
        print(f"[eventbrite] request error {categoria}: {exc}")
        return []

    soup = BeautifulSoup(r.content, "html.parser")
    eventos: list[dict] = []

    # Priority: JSON-LD (most structured)
    jsonld = _extract_jsonld(soup)
    if jsonld:
        eventos = [normalizar_jsonld(e, categoria) for e in jsonld]
    else:
        # Fallback: window.__SERVER_DATA__
        server_events = _extract_server_data(r.text)
        eventos = [normalizar_server_event(e, categoria) for e in server_events]

    return [e for e in eventos if e is not None and e["fuente_id"] and e["titulo"]]


def run(test: bool = False) -> list[dict]:
    seen_ids: set[str] = set()
    todos: list[dict] = []

    for cat in CATEGORIAS:
        items = scrape_categoria(cat)
        for item in items:
            if item["fuente_id"] not in seen_ids:
                seen_ids.add(item["fuente_id"])
                todos.append(item)
        if not test:
            time.sleep(1.5)

    # Enriquecer desde página de detalle: descripción + foto
    sin_detalle = [e for e in todos if not e.get("descripcion") or not e.get("foto_url")]
    if sin_detalle:
        print(f"[eventbrite] enriqueciendo {len(sin_detalle)} eventos (desc+foto)...")
        for i, evento in enumerate(sin_detalle):
            detail = _fetch_detail(evento.get("url_externo", ""))
            if detail["descripcion"] and not evento.get("descripcion"):
                evento["descripcion"] = detail["descripcion"]
            if detail["foto_url"] and not evento.get("foto_url"):
                evento["foto_url"] = detail["foto_url"]
            time.sleep(0.5 if test else 1.0)
            if (i + 1) % 10 == 0:
                print(f"[eventbrite]   {i+1}/{len(sin_detalle)} eventos")

    if test:
        con_desc  = sum(1 for e in todos if e.get("descripcion"))
        con_foto  = sum(1 for e in todos if e.get("foto_url"))
        print(f"[eventbrite] {len(todos)} eventos | {con_desc} con descripción | {con_foto} con foto")
        for e in todos[:3]:
            print(f"  - {e['titulo']} | foto={'✓' if e.get('foto_url') else '✗'} | desc={len(e.get('descripcion',''))} chars")

    return todos


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--test", action="store_true")
    parser.add_argument("--ciudad", default="medellin")
    args = parser.parse_args()
    resultados = run(test=True)
    print(f"\nTotal: {len(resultados)} eventos Eventbrite")
