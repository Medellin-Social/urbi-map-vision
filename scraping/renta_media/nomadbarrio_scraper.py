"""
NomadBarrio scraper — nomadbarrio.com/search/rent?barrio=

Platform: Bubble.io
Strategy:
  - Fetch search URL per barrio (9 barrios from schema.org)
  - Find listing containers: parent of <a href="/listing/"> link
  - Extract price COP, beds, title, URL from card text

Card text pattern:
  "{N} Bed Apartment in {Barrio} | {description} | ${COP} | (US${USD}) | Go to listing"

Price is already monthly (COP).
"""
import json
import re
import sys
import time
from pathlib import Path
from typing import Optional
from urllib.parse import quote

import requests
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

FUENTE = "nomadbarrio"
BASE_URL = "https://nomadbarrio.com"
UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

# Barrios from schema.org ItemList on /rent page
SEARCH_BARRIOS = [
    "El Poblado",
    "Laureles",
    "Envigado",
    "Sabaneta",
    "Belén",
    "Buenos Aires",
    "Calasanz",
    "Itagüí",
]
DELAY = 3.0  # seconds between barrio pages


def _get_barrios_from_schema() -> list[tuple[str, str]]:
    """Fetch barrio list from schema.org on /rent page. Returns [(name, search_url)]."""
    try:
        r = requests.get(
            f"{BASE_URL}/rent",
            headers={"User-Agent": UA},
            timeout=15,
        )
        soup = BeautifulSoup(r.text, "lxml")
        result = []
        for script in soup.find_all("script", type="application/ld+json"):
            try:
                data = json.loads(script.string)
                if data.get("@type") == "ItemList" and "Neighborhood" in str(data):
                    for item in data.get("itemListElement", []):
                        i = item.get("item", {})
                        url = i.get("url", "")
                        name = i.get("name", "")
                        if url and name and "/search/rent" in url:
                            result.append((name, url))
            except Exception:
                pass
        return result if result else [(b, f"{BASE_URL}/search/rent?barrio={quote(b)}") for b in SEARCH_BARRIOS]
    except Exception:
        return [(b, f"{BASE_URL}/search/rent?barrio={quote(b)}") for b in SEARCH_BARRIOS]


def _extract_cards_from_html(html: str, barrios: list[dict]) -> list[dict]:
    """
    Parse all listing cards from rendered HTML.
    Container: direct parent of <a href="/listing/..."> links.
    Text pattern: "{N} Bed [Apartment|House] in {Barrio} | {desc} | ${COP} | (US${USD}) | Go to listing"
    """
    soup = BeautifulSoup(html, "lxml")
    listing_links = soup.find_all("a", href=re.compile(r"/listing/"))

    results = []
    seen_urls: set[str] = set()

    for link in listing_links:
        href = link.get("href", "")
        url = href if href.startswith("http") else BASE_URL + href
        if url in seen_urls:
            continue
        seen_urls.add(url)

        # Walk up ONE level — that's the container with prices
        container = link.parent
        if not container:
            continue
        text = container.get_text(separator=" ", strip=True)

        # Price COP: "$9,300,000" (first dollar amount with 5+ digits)
        m_cop = re.search(r"\$\s*([\d,]{5,})", text)
        if not m_cop:
            continue
        price_cop = int(m_cop.group(1).replace(",", ""))

        # Sanity check: monthly COP rent should be 500k–50M
        if not (500_000 <= price_cop <= 50_000_000):
            continue

        # Price USD: "(US$2,453)"
        m_usd = re.search(r"US\$\s*([\d,]+)", text)
        price_usd = float(m_usd.group(1).replace(",", "")) if m_usd else round(price_cop / USD_TO_COP, 2)

        # Beds: "2 Bed" or "Studio"
        beds = None
        m_beds = re.search(r"(\d+)\s*Bed", text, re.I)
        if m_beds:
            beds = int(m_beds.group(1))
        elif "studio" in text.lower() or "estudio" in text.lower():
            beds = 0

        # Barrio from title: "X Bed Apartment in El Poblado"
        barrio_raw = ""
        m_barrio = re.search(r"(?:Bed|Studio)\s+(?:Apartment|House|Studio)\s+in\s+(.+?)(?:\||\$|$)", text, re.I)
        if m_barrio:
            barrio_raw = m_barrio.group(1).strip()[:100]

        # Title: everything before first "|" or "$"
        title = re.split(r"\||\$", text)[0].strip()[:200]

        results.append({
            "fuente": FUENTE,
            "titulo": title or None,
            "precio_mes_cop": price_cop,
            "precio_mes_usd": round(price_usd, 2),
            "area_m2": None,
            "habitaciones": beds,
            "banos": None,
            "barrio_raw": barrio_raw or None,
            "barrio_id": match_barrio(barrio_raw, barrios),
            "amoblado": True,
            "incluye_servicios": None,
            "min_noches": 30,
            "url": url[:500],
            "lat": None,
            "lon": None,
            "dedup_hash": make_dedup_hash(FUENTE, url),
        })

    return results


def scrape(dry_run: bool = False) -> list[dict]:
    conn = get_conn()
    ensure_table(conn)
    barrios = load_barrios(conn)

    barrio_pages = _get_barrios_from_schema()
    print(f"  Barrios to scrape: {[b[0] for b in barrio_pages]}")

    all_results: list[dict] = []
    seen_urls: set[str] = set()

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

        for barrio_name, search_url in barrio_pages:
            print(f"  → {barrio_name}: {search_url}")
            try:
                page.goto(search_url, wait_until="networkidle", timeout=45000)
                time.sleep(3)
            except Exception as e:
                print(f"    Load error: {e}")
                time.sleep(DELAY)
                continue

            html = page.content()
            cards = _extract_cards_from_html(html, barrios)

            # Deduplicate across barrios
            new_cards = [c for c in cards if c["url"] not in seen_urls]
            for c in new_cards:
                seen_urls.add(c["url"])
            all_results.extend(new_cards)

            print(f"    {len(new_cards)} listings (cumulative: {len(all_results)})")
            time.sleep(DELAY)

        browser.close()

    # Save
    saved = 0
    for listing in all_results:
        if dry_run:
            print(f"    DRY: {listing.get('titulo','?')[:50]} | COP {listing.get('precio_mes_cop',0):,} | {listing.get('barrio_raw','?')}")
        else:
            try:
                upsert_listing(conn, listing)
                saved += 1
            except Exception as e:
                print(f"    DB error: {e}")

    conn.close()
    print(f"NomadBarrio: {len(all_results)} parsed, {saved} saved")
    return all_results


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    scrape(dry_run=args.dry_run)
