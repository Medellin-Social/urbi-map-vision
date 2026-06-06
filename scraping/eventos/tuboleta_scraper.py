"""
tuboleta.com scraper — Playwright + API intercept.

tuboleta.com is React-rendered. Intercepts XHR calls to internal API.
Covers categories: conciertos, teatro, deportes, festivales, familiar, experiencias.

Usage:
  python scraping/eventos/tuboleta_scraper.py --test
"""
import argparse
import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

FUENTE = "tuboleta"
BASE_URL = "https://www.tuboleta.com"

CATEGORIAS = [
    "conciertos",
    "teatro",
    "deportes",
    "festivales",
    "familiar",
    "experiencias",
    "museos",
    "foros",
]

CATEGORIA_MAP = {
    "conciertos": "Concierto",
    "teatro": "Teatro",
    "deportes": "Deporte",
    "festivales": "Festival",
    "familiar": "Infantil",
    "experiencias": "SocialEvent",
    "museos": "ExhibitionEvent",
    "foros": "EducationEvent",
}

_CIUDAD_MEDELLIN_KEYWORDS = (
    "medellín", "medellin", "antioquia", "laureles", "poblado",
    "envigado", "bello", "itagüí", "itagui", "sabaneta",
)


def _es_medellin(raw: dict) -> bool:
    ciudad = (raw.get("ciudad") or raw.get("city") or "").lower()
    venue = (raw.get("lugarNombre") or raw.get("venue") or "").lower()
    return any(kw in ciudad + venue for kw in _CIUDAD_MEDELLIN_KEYWORDS)


def normalizar_tuboleta(raw: dict, categoria_slug: str = "") -> dict | None:
    fuente_id = str(raw.get("idEvento") or raw.get("id") or raw.get("eventId") or "")
    titulo = raw.get("nombreEvento") or raw.get("name") or raw.get("title") or ""
    if not fuente_id or not titulo:
        return None

    # Filter to Medellín only
    if not _es_medellin(raw):
        return None

    fecha_inicio = (
        raw.get("fechaInicio") or raw.get("startDate")
        or raw.get("fecha") or raw.get("date") or ""
    )
    fecha_fin = raw.get("fechaFin") or raw.get("endDate") or ""

    precio = 0.0
    try:
        precio = float(raw.get("precioMinimo") or raw.get("minPrice") or raw.get("price") or 0)
    except (TypeError, ValueError):
        pass
    gratuito = precio == 0

    venue = raw.get("lugarNombre") or raw.get("venue") or ""
    lat = raw.get("latitud") or raw.get("lat")
    lon = raw.get("longitud") or raw.get("lon")

    foto = raw.get("imagenUrl") or raw.get("image") or raw.get("imageUrl") or ""

    slug = raw.get("slug") or raw.get("url") or fuente_id
    url_externo = f"{BASE_URL}/es/evento/{slug}" if not slug.startswith("http") else slug

    cat_raw = CATEGORIA_MAP.get(categoria_slug, raw.get("categoria") or raw.get("category") or "")

    return {
        "fuente": FUENTE,
        "fuente_id": fuente_id,
        "titulo": titulo,
        "descripcion": (raw.get("descripcion") or raw.get("description") or "")[:2000],
        "foto_url": foto or None,
        "url_externo": url_externo,
        "fecha_inicio": fecha_inicio,
        "fecha_fin": fecha_fin,
        "gratuito": gratuito,
        "precio": precio,
        "organizador": raw.get("organizador") or venue,
        "lat": float(lat) if lat else None,
        "lon": float(lon) if lon else None,
        "direccion": venue,
        "categoria_raw": cat_raw,
    }


async def scrape_categoria_async(cat: str, captured: list[dict]) -> None:
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        print("[tuboleta] playwright not installed")
        return

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(
            user_agent=(
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            )
        )

        async def handle_response(response):
            url = response.url
            if response.status != 200:
                return
            ct = response.headers.get("content-type", "")
            if "json" not in ct:
                return
            if not any(x in url for x in ["api", "event", "evento", "product", "catalog"]):
                return
            try:
                data = await response.json()
                items = []
                if isinstance(data, list):
                    items = data
                elif isinstance(data, dict):
                    for key in ["events", "eventos", "data", "results", "items", "content"]:
                        val = data.get(key)
                        if isinstance(val, list):
                            items = val
                            break
                for raw in items:
                    if isinstance(raw, dict):
                        n = normalizar_tuboleta(raw, cat)
                        if n:
                            captured.append(n)
            except Exception:
                pass

        page.on("response", handle_response)

        try:
            await page.goto(
                f"{BASE_URL}/es/categorias/{cat}",
                wait_until="networkidle",
                timeout=30000,
            )
            await page.wait_for_timeout(3000)

            # Scroll to trigger lazy loading
            await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            await page.wait_for_timeout(2000)

            # Also try extracting from __NEXT_DATA__ if available
            nd = await page.evaluate("""
                () => {
                    const el = document.getElementById('__NEXT_DATA__');
                    return el ? JSON.parse(el.textContent) : null;
                }
            """)
            if nd:
                props = (nd.get("props") or {}).get("pageProps") or {}
                for key in ["events", "eventos", "data", "products", "items"]:
                    val = props.get(key)
                    if isinstance(val, list):
                        for raw in val:
                            n = normalizar_tuboleta(raw, cat)
                            if n:
                                captured.append(n)

            # DOM fallback: extract event cards
            cards = await page.evaluate("""
                () => {
                    const selectors = [
                        '[data-testid="event-card"]',
                        '.event-card', '.evento-card',
                        '[class*="EventCard"]', '[class*="event-item"]'
                    ];
                    for (const sel of selectors) {
                        const found = document.querySelectorAll(sel);
                        if (found.length > 0) {
                            return Array.from(found).map(c => ({
                                titulo: c.querySelector('h2,h3,h4,p[class*="title"]')?.textContent?.trim(),
                                url: c.querySelector('a')?.href,
                                imagen: c.querySelector('img')?.src,
                            }));
                        }
                    }
                    return [];
                }
            """)
            for card in (cards or []):
                if card.get("titulo") and card.get("url"):
                    captured.append({
                        "fuente": FUENTE,
                        "fuente_id": card["url"].rstrip("/").split("/")[-1],
                        "titulo": card["titulo"],
                        "descripcion": "",
                        "foto_url": card.get("imagen"),
                        "url_externo": card["url"],
                        "fecha_inicio": None,
                        "fecha_fin": None,
                        "gratuito": False,
                        "precio": 0.0,
                        "organizador": "",
                        "lat": None,
                        "lon": None,
                        "direccion": "Medellín",
                        "categoria_raw": CATEGORIA_MAP.get(cat, ""),
                    })
        except Exception as exc:
            print(f"[tuboleta] error en {cat}: {exc}")
        finally:
            await browser.close()


def run(test: bool = False) -> list[dict]:
    seen_ids: set[str] = set()
    todos: list[dict] = []

    cats = CATEGORIAS[:3] if test else CATEGORIAS

    for cat in cats:
        captured: list[dict] = []
        asyncio.run(scrape_categoria_async(cat, captured))
        for ev in captured:
            if ev["fuente_id"] not in seen_ids:
                seen_ids.add(ev["fuente_id"])
                todos.append(ev)
        if not test:
            time.sleep(1)

    if test:
        print(f"[tuboleta] {len(todos)} eventos encontrados")
        for e in todos[:3]:
            print(f"  - {e['titulo']} | {e['fecha_inicio']} | {e['categoria_raw']}")

    return todos


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--test", action="store_true")
    parser.add_argument("--ciudad", default="medellin")
    args = parser.parse_args()
    resultados = run(test=True)
    print(f"\nTotal: {len(resultados)} eventos Tuboleta")
