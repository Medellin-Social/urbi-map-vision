"""
rematesjudiciales.click scraper — Valle de Aburrá.

Confirmed working URL patterns (2026-05-15 recon):
  Hub:      /antioquia/              (~8 items, all categories)
  Casas:    /casas/antioquia/
  Fincas:   /fincas/antioquia-fin/
  Medellín: /tag/remates-judiciales-medellin/
  General:  /apartamentos/?page=N   (filter by municipio)
  Items:    /apartamentos/antioquia-apto/{slug}/  (individual OK)

Title format:  "{Tipo} en {Municipio} Antioquia, base licitación ${price} – {date}"
Barrio visible in snippet on individual item pages.

Run:
  python scraper.py                # all sources
  python scraper.py --dry-run      # print found items, no save
  python scraper.py --limit 5      # max pages per category
"""

import argparse
import json
import re
import time
from datetime import datetime
from pathlib import Path

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://rematesjudiciales.click"
BASE_URL_2 = "https://www.turematejudicial.com"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "es-CO,es;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": "https://rematesjudiciales.click/",
}

SESSION = requests.Session()
SESSION.headers.update(HEADERS)

DELAY = 2.5  # seconds between requests

TARGET_MUNICIPIOS = {
    "medellín": "Medellín",
    "medellin": "Medellín",
    "bello": "Bello",
    "itagüí": "Itagüí",
    "itagui": "Itagüí",
    "itaguí": "Itagüí",
    "envigado": "Envigado",
    "sabaneta": "Sabaneta",
    "la estrella": "La Estrella",
    "la-estrella": "La Estrella",
}

# Category seeds to crawl
CATEGORY_SEEDS = [
    "/antioquia/",
    "/casas/antioquia/",
    "/fincas/antioquia-fin/",
    "/tag/remates-judiciales-medellin/",
]

# General categories — paginate and filter by municipio in title
GENERAL_CATEGORIES = [
    "/apartamentos/",
    "/lotes/",
    "/locales-comerciales/",
]

TIPO_PATTERNS = [
    (r"\bapartamento\b", "apartamento"),
    (r"\bcasa\b", "casa"),
    (r"\blote\b", "lote"),
    (r"\blocal\b", "local"),
    (r"\bparqueadero\b", "parqueadero"),
    (r"\bfinca\b", "finca"),
    (r"\bpredio\b", "predio"),
    (r"\bbodega\b", "bodega"),
    (r"\binmueble\b", "inmueble"),
]

MESES = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4,
    "mayo": 5, "junio": 6, "julio": 7, "agosto": 8,
    "septiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12,
}

RAW_DIR = Path(__file__).parent.parent / "data" / "raw"
RAW_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT = RAW_DIR / "remates_antioquia.json"


def get(url: str) -> BeautifulSoup | None:
    try:
        r = SESSION.get(url, timeout=15)
        if r.status_code == 404:
            return None
        r.raise_for_status()
        return BeautifulSoup(r.text, "html.parser")
    except Exception as e:
        print(f"  ERROR fetching {url}: {e}")
        return None


def parse_precio(text: str) -> int | None:
    # HTML: "$351.496.460" or "$351,496,460"
    m = re.search(r"\$\s*([\d\.,]+)", text.replace("\xa0", ""))
    if m:
        raw = m.group(1).replace(".", "").replace(",", "")
        try:
            v = int(raw)
            if v > 1_000_000:  # sanity: must be at least 1M COP
                return v
        except ValueError:
            pass
    # URL slug: "base-licitacion-351-496-460-04-de-junio-de-2026"
    m2 = re.search(r"base-licitacion-([\d]+-[\d]+-[\d]+)-\d{2}-de-", text)
    if m2:
        raw = m2.group(1).replace("-", "")
        try:
            v = int(raw)
            if v > 1_000_000:
                return v
        except ValueError:
            pass
    return None


def parse_fecha(text: str) -> str | None:
    # HTML: "04 de junio de 2026"
    m = re.search(
        r"(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})", text, re.IGNORECASE
    )
    if m:
        day, mes_str, year = m.groups()
        mes = MESES.get(mes_str.lower())
        if mes:
            return f"{year}-{mes:02d}-{int(day):02d}"
    # HTML: "04/06/2026"
    m2 = re.search(r"(\d{2})/(\d{2})/(\d{4})", text)
    if m2:
        day, mon, year = m2.groups()
        return f"{year}-{mon}-{day}"
    # URL slug: "04-de-junio-de-2026"
    m3 = re.search(
        r"(\d{1,2})-de-(\w+)-de-(\d{4})", text, re.IGNORECASE
    )
    if m3:
        day, mes_str, year = m3.groups()
        mes = MESES.get(mes_str.lower())
        if mes:
            return f"{year}-{mes:02d}-{int(day):02d}"
    return None


def detect_tipo(text: str) -> str:
    tl = text.lower()
    for pattern, tipo in TIPO_PATTERNS:
        if re.search(pattern, tl):
            return tipo
    return "inmueble"


def detect_municipio(text: str) -> str | None:
    tl = text.lower()
    # "pueblo bello" (César) and "norcasia caldas" (dpto) must not match
    if "pueblo-bello" in tl or "pueblo bello" in tl:
        return None
    if "norcasia" in tl:
        return None
    # "caldas" only valid when "antioquia" also present (else dpto Caldas)
    if "caldas" in tl and "antioquia" not in tl:
        return None
    # "bello" only valid when "antioquia" or bello-specific context present
    if re.search(r"\bbello\b", tl) and "antioquia" not in tl:
        # allow if it's clearly the municipio (not part of another word)
        # slug like "/bello/" or "en-bello-antioquia" — if no antioquia, skip
        return None
    for key, val in TARGET_MUNICIPIOS.items():
        if key in tl:
            return val
    return None


def detect_barrio(text: str) -> str | None:
    """Extract barrio from snippet — 'barrio X', 'sector X', 'ubicado en X'."""
    m = re.search(
        r"(?:barrio|sector|ubicado en el barrio|ubicado en)\s+([A-ZÁÉÍÓÚÑ][^,.\n]{2,30})",
        text, re.IGNORECASE
    )
    if m:
        return m.group(1).strip()
    return None


def parse_item_page(url: str) -> dict | None:
    """Visit individual item page for extra barrio data."""
    soup = get(url)
    if not soup:
        return None
    time.sleep(DELAY)

    # Title
    h1 = soup.find("h1")
    title = h1.get_text(strip=True) if h1 else ""

    # Description snippet (first paragraph — usually not gated)
    description = ""
    for tag in soup.find_all(["p", "div"], limit=20):
        txt = tag.get_text(strip=True)
        if len(txt) > 40:
            description = txt
            break

    full_text = f"{title} {description}"
    barrio = detect_barrio(full_text)
    municipio = detect_municipio(full_text)
    tipo = detect_tipo(full_text)
    precio = parse_precio(full_text)
    fecha = parse_fecha(full_text)

    return {
        "titulo": title or None,
        "barrio": barrio,
        "municipio": municipio,
        "tipo_inmueble": tipo,
        "precio_base_cop": precio,
        "fecha_remate": fecha,
        "url": url,
    }


def collect_links_from_page(soup: BeautifulSoup) -> list[str]:
    """Collect all item links from a listing page."""
    links = []
    for a in soup.find_all("a", href=True):
        href = a["href"]
        # Item URLs have long slugs (price + date encoded)
        if (
            href.startswith("https://rematesjudiciales.click/")
            and re.search(r"base-licitacion", href)
        ):
            links.append(href)
        elif (
            href.startswith("/")
            and re.search(r"base-licitacion", href)
        ):
            links.append(BASE_URL + href)
    return list(dict.fromkeys(links))  # deduplicate preserving order


def scrape_listing_page(path: str, max_pages: int) -> list[str]:
    """Scrape a listing page + its pagination. Returns item URLs."""
    item_urls: list[str] = []
    for page in range(1, max_pages + 1):
        if page == 1:
            url = BASE_URL + path
        else:
            url = BASE_URL + path.rstrip("/") + f"/page/{page}/"
        print(f"  Listing: {url}")
        soup = get(url)
        if not soup:
            break
        links = collect_links_from_page(soup)
        if not links:
            break
        item_urls.extend(links)
        time.sleep(DELAY)
    return list(dict.fromkeys(item_urls))


def parse_item_from_link_text(a_tag) -> dict:
    """Fast-parse from listing link text (no extra HTTP request)."""
    href = a_tag.get("href", "")
    text = a_tag.get_text(strip=True)
    # Fallback: title from parent context
    parent_text = ""
    if a_tag.parent:
        parent_text = a_tag.parent.get_text(strip=True)

    full_text = f"{text} {parent_text} {href}"

    return {
        "titulo": text[:200] if text else None,
        "barrio": detect_barrio(full_text),
        "municipio": detect_municipio(full_text),
        "tipo_inmueble": detect_tipo(full_text),
        "precio_base_cop": parse_precio(full_text),
        "fecha_remate": parse_fecha(full_text),
        "url": href if href.startswith("http") else BASE_URL + href,
    }


def scrape_turematejudicial(max_pages: int = 10) -> list[str]:
    """Scrape turematejudicial.com/antioquia for item URLs."""
    item_urls: list[str] = []
    paths = ["/antioquia/", "/antioquia/medellin/", "/antioquia/bello/",
             "/antioquia/itagui/", "/antioquia/envigado/", "/antioquia/sabaneta/"]
    for path in paths:
        for page in range(1, max_pages + 1):
            if page == 1:
                url = BASE_URL_2 + path
            else:
                url = BASE_URL_2 + path.rstrip("/") + f"/page/{page}/"
            print(f"  [turematejudicial] Listing: {url}")
            soup = get(url)
            if not soup:
                break
            links = []
            for a in soup.find_all("a", href=True):
                href = a["href"]
                full_href = href if href.startswith("http") else BASE_URL_2 + href
                # Item pages: have numeric ID or slug with enough length
                if (
                    BASE_URL_2 in full_href
                    and full_href != url
                    and len(href) > 20
                    and not any(p in href for p in ["/antioquia/", "/page/", "#", "?"])
                ):
                    links.append(full_href)
            if not links:
                break
            item_urls.extend(links)
            time.sleep(DELAY)
    return list(dict.fromkeys(item_urls))


def parse_item_turematejudicial(url: str) -> dict | None:
    """Parse a single item from turematejudicial.com."""
    soup = get(url)
    if not soup:
        return None
    time.sleep(DELAY)

    h1 = soup.find("h1")
    title = h1.get_text(strip=True) if h1 else ""

    description = ""
    for tag in soup.find_all(["p", "div", "li"], limit=30):
        txt = tag.get_text(strip=True)
        if len(txt) > 40:
            description = txt
            break

    full_text = f"{title} {description} {url}"
    barrio = detect_barrio(full_text)
    municipio = detect_municipio(full_text)
    tipo = detect_tipo(full_text)
    precio = parse_precio(full_text)
    fecha = parse_fecha(full_text)

    if not municipio:
        return None
    return {
        "titulo": title or None,
        "barrio": barrio,
        "municipio": municipio,
        "tipo_inmueble": tipo,
        "precio_base_cop": precio,
        "fecha_remate": fecha,
        "url": url,
        "fuente": "turematejudicial.com",
    }


def scrape_all(max_pages: int = 10, visit_items: bool = True) -> list[dict]:
    """Main scrape loop. Returns list of remate dicts."""
    seen_urls: set[str] = set()
    results: list[dict] = []

    # Phase 1: Antioquia-specific listing pages (rematesjudiciales.click)
    print("\n== Phase 1: Antioquia listing pages ==")
    for path in CATEGORY_SEEDS:
        item_urls = scrape_listing_page(path, max_pages)
        print(f"  Found {len(item_urls)} item links in {path}")
        for url in item_urls:
            if url not in seen_urls:
                seen_urls.add(url)

    # Phase 2: General categories with pagination — filter by municipio
    print("\n== Phase 2: General categories (filter by municipio) ==")
    for path in GENERAL_CATEGORIES:
        for page in range(1, max_pages + 1):
            url = BASE_URL + path if page == 1 else BASE_URL + path.rstrip("/") + f"/page/{page}/"
            print(f"  Listing: {url}")
            soup = get(url)
            if not soup:
                break

            for a in soup.find_all("a", href=True):
                href = a["href"]
                if not re.search(r"base-licitacion", href):
                    continue
                full_href = href if href.startswith("http") else BASE_URL + href
                link_text = a.get_text(strip=True)
                full_text = f"{link_text} {href}"
                if detect_municipio(full_text) and full_href not in seen_urls:
                    seen_urls.add(full_href)

            time.sleep(DELAY)

    # Phase 3 (source 2): turematejudicial.com
    print("\n== Phase 3: turematejudicial.com ==")
    t2_urls = scrape_turematejudicial(max_pages)
    print(f"  Found {len(t2_urls)} item links from turematejudicial.com")
    new_t2 = [u for u in t2_urls if u not in seen_urls]
    seen_urls.update(new_t2)
    print(f"  ({len(new_t2)} new, not in rematesjudiciales.click)")

    print(f"\n== Total unique item URLs: {len(seen_urls)} ==")

    # Phase 4: Visit each item page (route by source domain)
    if visit_items:
        print("\n== Phase 4: Visiting item pages ==")
        for url in seen_urls:
            print(f"  Item: {url}")
            if BASE_URL_2 in url:
                item = parse_item_turematejudicial(url)
            else:
                item = parse_item_page(url)
                if item:
                    item.setdefault("fuente", "rematesjudiciales.click")
            if item and item.get("municipio"):
                results.append(item)
            elif item:
                mun = detect_municipio(url)
                if mun:
                    item["municipio"] = mun
                    results.append(item)
    else:
        # Fast mode: parse from URL slug only
        for url in seen_urls:
            mun = detect_municipio(url)
            tipo = detect_tipo(url)
            precio = parse_precio(url)
            fecha = parse_fecha(url)
            if mun:
                results.append({
                    "titulo": None,
                    "barrio": None,
                    "municipio": mun,
                    "tipo_inmueble": tipo,
                    "precio_base_cop": precio,
                    "fecha_remate": fecha,
                    "url": url,
                    "fuente": BASE_URL_2 if BASE_URL_2 in url else "rematesjudiciales.click",
                })

    # Filter to target municipios only
    results = [r for r in results if r.get("municipio")]
    print(f"\n== Valle de Aburrá remates found: {len(results)} ==")
    return results


def main():
    parser = argparse.ArgumentParser(description="Scrape rematesjudiciales.click — Antioquia")
    parser.add_argument("--dry-run", action="store_true", help="Print results, don't save")
    parser.add_argument("--limit", type=int, default=10, help="Max pages per listing")
    parser.add_argument("--fast", action="store_true", help="Skip item pages, parse from URL only")
    args = parser.parse_args()

    print(f"Starting scrape — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    results = scrape_all(max_pages=args.limit, visit_items=not args.fast)

    # Summary by municipio
    from collections import Counter
    counts = Counter(r["municipio"] for r in results)
    print("\n== Por municipio ==")
    for mun, n in sorted(counts.items()):
        print(f"  {mun}: {n}")

    if args.dry_run:
        print("\n[DRY RUN] No guardando.")
        for r in results:
            print(f"  {r['municipio']} | {r['tipo_inmueble']} | {r['precio_base_cop']} | {r['fecha_remate']} | {r['barrio']}")
        return

    # Load existing (upsert by URL)
    existing: list[dict] = []
    if OUTPUT.exists():
        with open(OUTPUT, encoding="utf-8") as f:
            existing = json.load(f)

    existing_by_url = {r["url"]: r for r in existing}
    for item in results:
        existing_by_url[item["url"]] = {
            **existing_by_url.get(item["url"], {}),
            **{k: v for k, v in item.items() if v is not None},
            "fecha_scraping": datetime.now().isoformat(),
            "estado": "activo",
        }

    final = list(existing_by_url.values())
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(final, f, ensure_ascii=False, indent=2)

    print(f"\n✓ Guardado: {OUTPUT} ({len(final)} remates totales)")


if __name__ == "__main__":
    main()
