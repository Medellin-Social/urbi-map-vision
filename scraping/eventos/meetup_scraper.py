"""
Meetup scraper — GraphQL API (Feb 2025+) with Playwright fallback.

Usage:
  python scraping/eventos/meetup_scraper.py --test
  python scraping/eventos/meetup_scraper.py           # full run

Env:
  MEETUP_TOKEN — OAuth 2.0 Bearer token from meetup.com/api/oauth/list/
                 If absent, falls back to Playwright web scraping.
"""
import argparse
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import requests

sys.path.insert(0, str(Path(__file__).parent))
from config import MEETUP_TOKEN, BARRIOS_COMUNIDAD, LAT_MEDELLIN, LON_MEDELLIN

FUENTE = "meetup"
GQL_ENDPOINT = "https://api.meetup.com/gql"
RADIUS_KM = 25

MEETUP_QUERY = """
query EventSearch($lat: Float!, $lon: Float!, $radius: Float!, $startDate: String!, $endDate: String!) {
  eventSearch(
    filter: {
      lat: $lat
      lon: $lon
      radius: $radius
      startDateRange: $startDate
      endDateRange: $endDate
      status: UPCOMING
      isOnline: false
    }
    input: { first: 100 }
  ) {
    edges {
      node {
        id
        title
        description
        dateTime
        endTime
        eventUrl
        isOnline
        isFree
        going
        featuredEventPhoto { baseUrl }
        venue { name address city lat lon }
        group {
          name
          urlname
          category { name }
        }
        tickets {
          edges {
            node { price currency }
          }
        }
      }
    }
  }
}
"""

CATEGORIA_MAP = {
    "SOCIAL": "social",
    "TECH": "tech",
    "HEALTH_WELLBEING": "bienestar",
    "SPORTS_FITNESS": "deporte",
    "ARTS_CULTURE": "cultura",
    "FOOD_DRINK": "gastronomia",
    "MUSIC": "musica",
    "BUSINESS": "networking",
    "OUTDOORS_ADVENTURE": "deporte",
    "PHOTOGRAPHY": "cultura",
    "LANGUAGE_CULTURE": "cultura",
}


def _date_range():
    now = datetime.utcnow()
    end = now + timedelta(days=60)
    return now.strftime("%Y-%m-%dT%H:%M:%S"), end.strftime("%Y-%m-%dT%H:%M:%S")


def _normalizar_node(node: dict) -> dict | None:
    if node.get("isOnline"):
        return None

    venue = node.get("venue") or {}
    group = node.get("group") or {}
    cat_raw = (group.get("category") or {}).get("name", "")
    foto = (node.get("featuredEventPhoto") or {}).get("baseUrl", "")

    precio = 0.0
    tickets = node.get("tickets", {}).get("edges", [])
    if tickets:
        first_ticket = (tickets[0].get("node") or {})
        precio = float(first_ticket.get("price") or 0)

    lat = venue.get("lat")
    lon = venue.get("lon")

    return {
        "fuente": FUENTE,
        "fuente_id": node.get("id", ""),
        "titulo": node.get("title", ""),
        "descripcion": (node.get("description") or "")[:2000],
        "foto_url": foto or None,
        "url_externo": node.get("eventUrl", ""),
        "fecha_inicio": node.get("dateTime"),
        "fecha_fin": node.get("endTime"),
        "gratuito": node.get("isFree", True),
        "precio": precio,
        "organizador": group.get("name", ""),
        "lat": float(lat) if lat else None,
        "lon": float(lon) if lon else None,
        "categoria_raw": cat_raw,
    }


def scrape_graphql(lat: float, lon: float) -> list[dict]:
    if not MEETUP_TOKEN:
        return []

    start, end = _date_range()
    headers = {
        "Authorization": f"Bearer {MEETUP_TOKEN}",
        "Content-Type": "application/json",
    }
    payload = {
        "query": MEETUP_QUERY,
        "variables": {
            "lat": lat,
            "lon": lon,
            "radius": float(RADIUS_KM),
            "startDate": start,
            "endDate": end,
        },
    }
    try:
        r = requests.post(GQL_ENDPOINT, json=payload, headers=headers, timeout=20)
        r.raise_for_status()
        data = r.json()
        edges = data.get("data", {}).get("eventSearch", {}).get("edges", [])
        return [n for e in edges if e.get("node") and (n := _normalizar_node(e["node"])) is not None]
    except Exception as exc:
        print(f"[meetup:graphql] error: {exc}")
        return []


def scrape_playwright_fallback(ciudad: str = "Medellín") -> list[dict]:
    """Playwright fallback when no OAuth token available."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("[meetup:playwright] playwright not installed — skipping fallback")
        return []

    eventos: list[dict] = []
    url = f"https://www.meetup.com/find/events/?location={ciudad}&radius=25"

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(
            user_agent=(
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            )
        )
        captured: list[dict] = []

        def handle_response(response):
            url = response.url
            # Meetup uses /gql2 (web) or api.meetup.com/gql (API)
            if ("meetup.com/gql" in url or "meetup.com/gql2" in url) and response.status == 200:
                try:
                    body = response.json()
                    payload = body if isinstance(body, dict) else {}
                    gql_data = payload.get("data") or {}
                    # Web: data.result.edges — API: data.eventSearch.edges
                    result = gql_data.get("result") or gql_data.get("eventSearch") or {}
                    edges = result.get("edges", []) if isinstance(result, dict) else []
                    for e in edges:
                        node = e.get("node")
                        if node:
                            n = _normalizar_node(node)
                            if n is not None:
                                captured.append(n)
                except Exception:
                    pass

        page.on("response", handle_response)

        try:
            page.goto(url, wait_until="networkidle", timeout=30000)
            page.wait_for_timeout(3000)
        except Exception as exc:
            print(f"[meetup:playwright] navigation error: {exc}")
        finally:
            browser.close()

        eventos = captured if captured else []

    return eventos


def run(test: bool = False) -> list[dict]:
    if not MEETUP_TOKEN:
        print("[meetup] No MEETUP_TOKEN — using Playwright fallback")
        eventos = scrape_playwright_fallback()
    else:
        # Search from each barrio hub + city center
        seen_ids: set[str] = set()
        eventos: list[dict] = []
        points = [(LAT_MEDELLIN, LON_MEDELLIN)] + [
            (b["lat"], b["lon"]) for b in BARRIOS_COMUNIDAD
        ]
        for lat, lon in points:
            for e in scrape_graphql(lat, lon):
                if e["fuente_id"] not in seen_ids:
                    seen_ids.add(e["fuente_id"])
                    eventos.append(e)

    if test:
        print(f"[meetup] {len(eventos)} eventos encontrados")
        for e in eventos[:3]:
            print(f"  - {e['titulo']} | {e['fecha_inicio']} | {e['categoria_raw']}")

    return eventos


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--test", action="store_true")
    parser.add_argument("--ciudad", default="medellin")
    args = parser.parse_args()
    resultados = run(test=True)
    print(f"\nTotal: {len(resultados)} eventos Meetup")
