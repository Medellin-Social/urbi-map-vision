"""
Lu.ma scraper — Playwright + __NEXT_DATA__ + API intercept.

Lu.ma renders with Next.js. Event data lives in:
  1. <script id="__NEXT_DATA__"> in the HTML
  2. XHR calls to /api/event/get-feed (intercepted)

Usage:
  python scraping/eventos/luma_scraper.py --test
"""
import argparse
import asyncio
import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).parent))

FUENTE = "luma"

CATEGORIAS = ["tech", "wellness", "business", "social", "arts", "sports"]

BASE_URL = "https://lu.ma/medellin"


_VIRTUAL_URL_PATTERNS = ("zoom.us", "meet.google", "teams.microsoft", "webex", "webinar")


def normalizar_luma(raw: dict) -> dict | None:
    # Lu.ma list entries nest actual event data under "event" key
    entry = raw
    event = raw.get("event") or raw

    # location_type: "offline" | "online" | "link"
    location_type = event.get("location_type", "")
    if location_type in ("online", "link"):
        return None

    # Fallback: virtual_info with no geo → online
    if not location_type:
        url_slug = (event.get("url") or "").lower()
        desc = (event.get("description") or "").lower()
        if any(p in url_slug or p in desc for p in _VIRTUAL_URL_PATTERNS):
            return None

    # Extract address from geo_address_info (lat/lon not exposed in list view)
    geo_info = event.get("geo_address_info") or {}
    localized = geo_info.get("localized", {})
    loc_es = localized.get("es-419") or localized.get(next(iter(localized), ""), {})
    direccion = (
        loc_es.get("short_address")
        or geo_info.get("short_address")
        or geo_info.get("full_address")
        or geo_info.get("address")
        or ""
    )

    ticket_info = entry.get("ticket_info") or event.get("ticket_info") or {}
    hosts = entry.get("hosts") or event.get("hosts") or []
    organizador = hosts[0].get("name", "") if hosts else ""

    USD_TO_COP = 4100
    precio = 0.0
    gratuito = ticket_info.get("is_free", True)
    if not gratuito:
        try:
            precio_usd = float(ticket_info.get("price") or 0)
            currency = (ticket_info.get("currency") or "USD").upper()
            precio = precio_usd * USD_TO_COP if currency == "USD" else precio_usd
        except (TypeError, ValueError):
            pass
    gratuito = gratuito or precio == 0

    url_slug = event.get("url") or event.get("api_id", "")
    url_externo = f"https://lu.ma/{url_slug}" if url_slug else ""
    cover = (
        event.get("cover_url")
        or event.get("cover_image")
        or event.get("header_image")
        or event.get("image")
        or event.get("image_url")
        or (entry.get("event") or {}).get("cover_url")
        or None
    )

    return {
        "fuente": FUENTE,
        "fuente_id": entry.get("api_id") or event.get("api_id") or event.get("id", ""),
        "titulo": event.get("name", ""),
        "descripcion": (event.get("description") or "")[:2000],
        "foto_url": cover,
        "url_externo": url_externo,
        "fecha_inicio": entry.get("start_at") or event.get("start_at"),
        "fecha_fin": event.get("end_at"),
        "gratuito": bool(gratuito),
        "precio": precio,
        "organizador": organizador,
        "lat": event.get("geo_latitude") or event.get("latitude"),
        "lon": event.get("geo_longitude") or event.get("longitude"),
        "direccion": direccion,
        "categoria_raw": (event.get("tags") or [None])[0] if event.get("tags") else "",
    }


def _parse_next_data(next_data: dict) -> list[dict]:
    if not next_data:
        return []
    props = next_data.get("props") or {}
    page_props = props.get("pageProps") or {}

    # Lu.ma city/discover page: props.pageProps.initialData.data.events
    initial_data = page_props.get("initialData") or {}
    data = initial_data.get("data") or {}

    entries = (
        data.get("events")
        or data.get("entries")
        or page_props.get("entries")
        or page_props.get("events")
        or page_props.get("feed", {}).get("entries", [])
        or []
    )
    eventos = []
    for entry in entries:
        try:
            normalized = normalizar_luma(entry)
            if normalized is not None and normalized["fuente_id"] and normalized["titulo"]:
                eventos.append(normalized)
        except Exception as exc:
            print(f"[luma] parse error: {exc}")
    return eventos


async def scrape_async() -> list[dict]:
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        print("[luma] playwright not installed")
        return []

    todos: list[dict] = []
    captured_api: list[dict] = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            )
        )
        page = await context.new_page()

        async def handle_response(response):
            url = response.url
            if "lu.ma" in url and any(
                k in url for k in ["get-feed", "get-events", "event/list"]
            ):
                try:
                    data = await response.json()
                    if isinstance(data, dict):
                        entries = (
                            data.get("entries")
                            or data.get("events")
                            or data.get("results")
                            or []
                        )
                        for e in entries:
                            n = normalizar_luma(e)
                            if n is not None and n["fuente_id"] and n["titulo"]:
                                captured_api.append(n)
                except Exception:
                    pass

        page.on("response", handle_response)

        # Scrape base city page + each category
        urls_to_scrape = [BASE_URL] + [
            f"{BASE_URL}?category={cat}" for cat in CATEGORIAS
        ]

        seen_ids: set[str] = set()

        for url in urls_to_scrape:
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=60000)
                await page.wait_for_timeout(2000)

                next_data = await page.evaluate("""
                    () => {
                        const el = document.getElementById('__NEXT_DATA__');
                        return el ? JSON.parse(el.textContent) : null;
                    }
                """)

                for evento in _parse_next_data(next_data or {}):
                    if evento["fuente_id"] not in seen_ids:
                        seen_ids.add(evento["fuente_id"])
                        todos.append(evento)

            except Exception as exc:
                print(f"[luma] error en {url}: {exc}")

        await browser.close()

    # Merge API-intercepted events (may have more detail)
    for evento in captured_api:
        if evento["fuente_id"] not in seen_ids:
            seen_ids.add(evento["fuente_id"])
            todos.append(evento)

    return todos


def run(test: bool = False) -> list[dict]:
    eventos = asyncio.run(scrape_async())

    if test:
        print(f"[luma] {len(eventos)} eventos encontrados")
        for e in eventos[:3]:
            print(f"  - {e['titulo']} | {e['fecha_inicio']} | {e['categoria_raw']}")

    return eventos


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--test", action="store_true")
    parser.add_argument("--ciudad", default="medellin")
    args = parser.parse_args()
    resultados = run(test=True)
    print(f"\nTotal: {len(resultados)} eventos Lu.ma")
