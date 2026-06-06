"""
medellin.travel scraper — WP REST API (3 post types) + individual page detail.

Strategy:
  1. GET /wp-json/wp/v2/{caleventos,eventos-deportivos,fiestas-y-eventos}?_embed=1
     → collect URLs + featured_media photo (where available)
  2. For each URL: GET individual page → parse Elementor for Fecha/Lugar/Precio
  3. Skip past events (fecha_inicio < today)

eventos-deportivos has real wp-content photos via _embedded['wp:featuredmedia'].
caleventos and fiestas-y-eventos rarely have photos — use og:description for desc.

Usage:
  python scraping/eventos/medellin_travel_scraper.py --test
"""
import argparse
import re
import sys
import time
from datetime import date, datetime
from pathlib import Path

import requests
from bs4 import BeautifulSoup

sys.path.insert(0, str(Path(__file__).parent))

FUENTE = "medellin_travel"
BASE_DOMAIN = "https://www.medellin.travel"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "es-CO,es;q=0.9,en;q=0.8",
}

_ENDPOINTS = [
    "caleventos",
    "eventos-deportivos",
    "fiestas-y-eventos",
]

_MONTH_ES = {
    "enero": "January", "febrero": "February", "marzo": "March",
    "abril": "April", "mayo": "May", "junio": "June",
    "julio": "July", "agosto": "August", "septiembre": "September",
    "octubre": "October", "noviembre": "November", "diciembre": "December",
}


def _parse_fecha_es(text: str) -> str | None:
    text = text.strip().lower()
    for es, en in _MONTH_ES.items():
        text = text.replace(es, en)
    try:
        return datetime.strptime(text, "%B %d, %Y").strftime("%Y-%m-%d")
    except ValueError:
        return None


def _get_all_links() -> list[tuple[str, str, str | None]]:
    """Returns list of (url, title, foto_url_from_api)."""
    seen_urls: set[str] = set()
    links: list[tuple[str, str, str | None]] = []

    for endpoint in _ENDPOINTS:
        page = 1
        api_url = f"{BASE_DOMAIN}/wp-json/wp/v2/{endpoint}"
        while True:
            try:
                r = requests.get(
                    api_url,
                    params={"per_page": 100, "page": page, "_embed": 1},
                    headers=HEADERS,
                    timeout=15,
                )
                if r.status_code in (400, 404):
                    break
                if r.status_code != 200:
                    print(f"[medellin_travel] {endpoint} HTTP {r.status_code} pág {page}")
                    break
                items = r.json()
                if not items:
                    break
                for item in items:
                    url = item.get("link", "")
                    if not url or url in seen_urls:
                        continue
                    seen_urls.add(url)
                    title = item.get("title", {}).get("rendered", "")
                    # Extract featured image from _embedded
                    foto_url: str | None = None
                    emb = item.get("_embedded") or {}
                    feat = emb.get("wp:featuredmedia") or []
                    if feat and isinstance(feat, list):
                        src = feat[0].get("source_url", "")
                        if src and "logo" not in src.lower() and "cropped" not in src.lower():
                            foto_url = src
                    links.append((url, title, foto_url))

                total_pages = int(r.headers.get("X-WP-TotalPages", 1))
                if page >= total_pages:
                    break
                page += 1
                time.sleep(0.3)
            except Exception as exc:
                print(f"[medellin_travel] {endpoint} API error: {exc}")
                break

    return links


def _scrape_event_page(url: str, title_hint: str = "", api_foto: str | None = None) -> dict | None:
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        if r.status_code != 200:
            return None
    except Exception:
        return None

    soup = BeautifulSoup(r.content, "html.parser")

    og: dict[str, str] = {}
    for m in soup.find_all("meta"):
        prop = m.get("property", "") or m.get("name", "")
        if prop.startswith("og:") or prop in ("twitter:image",):
            og[prop] = m.get("content", "")

    titulo = (
        og.get("og:title", title_hint)
        .replace(" - Medellín.Travel | Guía Oficial - Qué Hacer en Medellín", "")
        .replace(" - Medellín Travel", "")
        .strip()
    ) or title_hint

    descripcion = og.get("og:description", "")

    # Photo priority: API featured media > twitter:image > og:image
    foto_url: str | None = api_foto
    if not foto_url:
        foto_url = og.get("twitter:image") or og.get("og:image") or None
    # Discard site logo/emoji
    if foto_url and ("s.w.org" in foto_url or "cropped-Marca" in foto_url):
        foto_url = None

    fecha_inicio = None
    fecha_fin = None
    lugar = ""
    precio = 0.0
    gratuito = True

    full_text = soup.get_text(separator=" ")

    for div in soup.find_all("div"):
        cls = " ".join(div.get("class") or [])
        if "elementor" not in cls:
            continue
        text = div.get_text(separator=" ", strip=True)
        if "Fecha:" not in text and "fecha:" not in text:
            continue

        fechas_raw = re.search(r"Fecha:\s*(.+?)(?:Lugar:|Precio:|Agregar|$)", text, re.IGNORECASE | re.DOTALL)
        if fechas_raw:
            fechas_str = fechas_raw.group(1).strip()
            parts = re.split(r"\s+-\s+", fechas_str)
            fecha_inicio = _parse_fecha_es(parts[0].strip()) if parts else None
            if len(parts) > 1:
                fecha_fin = _parse_fecha_es(parts[-1].strip())

        lugar_raw = re.search(r"Lugar:\s*(.+?)(?:Precio:|Agregar|$|\n)", text, re.IGNORECASE)
        if lugar_raw:
            lugar = lugar_raw.group(1).strip()[:200]

        precio_raw = re.search(r"Precio:\s*\$?\s*([\d\.,]+)", text, re.IGNORECASE)
        if precio_raw:
            try:
                precio_str = precio_raw.group(1).replace(".", "").replace(",", "")
                precio = float(precio_str)
                gratuito = precio == 0
            except (ValueError, TypeError):
                pass

        break

    if any(kw in full_text.lower() for kw in ("gratuito", "entrada libre", "acceso libre")):
        gratuito = True
        precio = 0.0

    if not titulo or not fecha_inicio:
        return None

    try:
        if datetime.strptime(fecha_inicio, "%Y-%m-%d").date() < date.today():
            return None
    except ValueError:
        return None

    slug = url.rstrip("/").split("/")[-1]
    fuente_id = re.sub(r"-\d+$", "", slug) or slug
    direccion_geocode = f"{lugar}, Medellín, Colombia" if lugar else ""

    return {
        "fuente": FUENTE,
        "fuente_id": fuente_id,
        "titulo": titulo,
        "descripcion": descripcion[:2000],
        "foto_url": foto_url,
        "url_externo": url,
        "fecha_inicio": fecha_inicio,
        "fecha_fin": fecha_fin,
        "gratuito": gratuito,
        "precio": precio,
        "organizador": "Medellín.Travel",
        "lat": None,
        "lon": None,
        "direccion": direccion_geocode,
        "categoria_raw": "SocialEvent",
    }


def _normalize_title(t: str) -> str:
    return re.sub(r"\s+", " ", t.lower().strip())


def run(test: bool = False) -> list[dict]:
    all_links = _get_all_links()
    print(f"[medellin_travel] {len(all_links)} eventos únicos en WP REST API")

    # Build foto lookup by normalized title from events that have API photos
    foto_by_title: dict[str, str] = {
        _normalize_title(title): foto
        for _, title, foto in all_links
        if foto
    }
    with_foto = len(foto_by_title)
    print(f"[medellin_travel] {with_foto} fotos disponibles en API (por título)")

    def _match_foto(title: str) -> str | None:
        nt = _normalize_title(title)
        if nt in foto_by_title:
            return foto_by_title[nt]
        for ft, url in foto_by_title.items():
            if ft in nt or nt in ft:
                return url
        return None

    # Only scrape caleventos URLs — they have Fecha/Lugar/Precio structure
    cal_links = [(url, title, foto) for url, title, foto in all_links
                 if "/caleventos/" in url]
    limit = 20 if test else len(cal_links)

    eventos: list[dict] = []
    for url, title, api_foto in cal_links[:limit]:
        if not api_foto:
            api_foto = _match_foto(title)
        ev = _scrape_event_page(url, title_hint=title, api_foto=api_foto)
        if ev:
            eventos.append(ev)
        time.sleep(0.4)

    if test:
        con_foto = sum(1 for e in eventos if e.get("foto_url"))
        print(f"[medellin_travel] {len(eventos)} futuros (de {limit} chequeados) | {con_foto} con foto")
        for e in sorted(eventos, key=lambda x: x["fecha_inicio"])[:5]:
            print(f"  - {e['fecha_inicio']} | {e['titulo'][:45]} | foto={'✓' if e.get('foto_url') else '✗'}")

    return eventos


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--test", action="store_true")
    parser.add_argument("--ciudad", default="medellin")
    args = parser.parse_args()
    resultados = run(test=True)
    print(f"\nTotal: {len(resultados)} eventos Medellín.Travel")
