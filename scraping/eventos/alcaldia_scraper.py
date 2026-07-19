"""
Alcaldía de Medellín events scraper — Playwright (JS-rendered Drupal).

URL: https://www.medellin.gov.co/es/eventos/

The events calendar is rendered by JavaScript. Uses Playwright to
load the page and intercept API calls or parse the rendered DOM.

Usage:
  python scraping/eventos/alcaldia_scraper.py --test
"""
import argparse
import asyncio
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

FUENTE = "alcaldia_medellin"
BASE_URL = "https://www.medellin.gov.co"
EVENTOS_URL = f"{BASE_URL}/es/eventos/"

# año opcional: las cards suelen mostrar "12 de julio" sin año
_DATE_RE = re.compile(
    r"(\d{1,2})\s+(?:de\s+)?(\w+)(?:\s+(?:de\s+)?(\d{4}))?", re.IGNORECASE
)
_ISO_RE = re.compile(r"(\d{4})-(\d{2})-(\d{2})")
_MONTH_ES = {
    "enero": "01", "febrero": "02", "marzo": "03", "abril": "04",
    "mayo": "05", "junio": "06", "julio": "07", "agosto": "08",
    "septiembre": "09", "octubre": "10", "noviembre": "11", "diciembre": "12",
    # abreviaturas
    "ene": "01", "feb": "02", "mar": "03", "abr": "04", "may": "05",
    "jun": "06", "jul": "07", "ago": "08", "sep": "09", "sept": "09",
    "oct": "10", "nov": "11", "dic": "12",
}


def _parse_fecha_alcaldia(text: str) -> str | None:
    from datetime import date

    # 1) ISO directo (p.ej. atributo datetime de <time>)
    m = _ISO_RE.search(text)
    if m:
        return m.group(0)

    day = month_num = year = None
    for m in _DATE_RE.finditer(text.lower()):
        month_num = _MONTH_ES.get(m.group(2).lower())
        if month_num:
            day, year = m.group(1), m.group(3)
            break
    if not month_num:
        return None
    if not year:
        # sin año: actual, o siguiente si quedó >60 días en el pasado
        hoy = date.today()
        anio = hoy.year
        try:
            if (hoy - date(anio, int(month_num), int(day))).days > 60:
                anio += 1
        except ValueError:
            return None
        year = str(anio)
    return f"{year}-{month_num}-{int(day):02d}"


def normalizar_alcaldia(raw: dict) -> dict | None:
    titulo = raw.get("titulo") or raw.get("title") or raw.get("name") or ""
    if not titulo:
        return None

    fuente_id = (
        raw.get("id") or raw.get("nid")
        or raw.get("url_externo", "").rstrip("/").split("/")[-1]
        or titulo[:50]
    )

    return {
        "fuente": FUENTE,
        "fuente_id": str(fuente_id),
        "titulo": titulo,
        "descripcion": (raw.get("descripcion") or raw.get("body") or "")[:2000],
        "foto_url": raw.get("foto_url") or raw.get("image") or None,
        "url_externo": raw.get("url_externo") or "",
        "fecha_inicio": raw.get("fecha_inicio"),
        "fecha_fin": raw.get("fecha_fin"),
        "gratuito": True,
        "precio": 0.0,
        "organizador": "Alcaldía de Medellín",
        "lat": raw.get("lat"),
        "lon": raw.get("lon"),
        "direccion": raw.get("lugar") or "Medellín",
        "categoria_raw": raw.get("categoria") or "SocialEvent",
    }


async def scrape_async(test: bool = False) -> list[dict]:
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        print("[alcaldia] playwright not installed")
        return []

    eventos_raw: list[dict] = []
    captured_api: list[dict] = []

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
            if not any(x in url for x in ["event", "evento", "agenda", "api", "view"]):
                return
            try:
                data = await response.json()
                items = data if isinstance(data, list) else (
                    data.get("rows") or data.get("data") or data.get("results") or []
                )
                for item in items:
                    if isinstance(item, dict) and (item.get("title") or item.get("titulo")):
                        captured_api.append(item)
            except Exception:
                pass

        page.on("response", handle_response)

        try:
            await page.goto(EVENTOS_URL, wait_until="domcontentloaded", timeout=60000)
            await page.wait_for_timeout(5000)

            # Scroll to trigger lazy loads
            await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            await page.wait_for_timeout(2000)

            # Extract event cards from DOM
            cards_data = await page.evaluate("""
                () => {
                    const results = [];
                    const selectors = [
                        '.views-row', '.node--type-event', '.evento-item',
                        'article[class*="event"]', '[class*="evento"]',
                        '.card', '.evento'
                    ];
                    let cards = [];
                    for (const sel of selectors) {
                        cards = document.querySelectorAll(sel);
                        if (cards.length > 0) break;
                    }
                    cards.forEach(card => {
                        const title = card.querySelector('h2,h3,h4,.title,.titulo')?.textContent?.trim();
                        const timeEl = card.querySelector('time');
                        const date = timeEl?.getAttribute('datetime')
                            || (timeEl?.textContent?.trim())
                            || card.querySelector('[class*="date"],[class*="fecha"]')?.textContent?.trim()
                            || card.innerText;
                        const link = card.querySelector('a')?.href;
                        const img = card.querySelector('img')?.src;
                        const lugar = card.querySelector('[class*="lugar"],[class*="venue"]')?.textContent?.trim();
                        const desc = card.querySelector('p,[class*="desc"],[class*="body"]')?.textContent?.trim();
                        if (title) results.push({ titulo: title, fecha_raw: date, url_externo: link, foto_url: img, lugar, descripcion: desc });
                    });
                    return results;
                }
            """)

            for card in (cards_data or []):
                if card.get("titulo"):
                    fecha = _parse_fecha_alcaldia(card.get("fecha_raw") or "")
                    url = card.get("url_externo") or ""
                    if url and not url.startswith("http"):
                        url = BASE_URL + url
                    slug = url.rstrip("/").split("/")[-1] if url else card["titulo"][:30]
                    eventos_raw.append({
                        "fuente": FUENTE,
                        "fuente_id": slug,
                        "titulo": card["titulo"],
                        "descripcion": (card.get("descripcion") or "")[:2000],
                        "foto_url": card.get("foto_url"),
                        "url_externo": url,
                        "fecha_inicio": fecha,
                        "fecha_fin": None,
                        "gratuito": True,
                        "precio": 0.0,
                        "organizador": "Alcaldía de Medellín",
                        "lat": None,
                        "lon": None,
                        "direccion": card.get("lugar") or "Medellín",
                        "categoria_raw": "SocialEvent",
                    })

            # Paginate if not test mode
            if not test:
                pg = 1
                while pg <= 10:
                    try:
                        next_btn = await page.query_selector(
                            "a[title='Ir a la página siguiente'], .pager__item--next a, [rel='next']"
                        )
                        if not next_btn:
                            break
                        await next_btn.click()
                        await page.wait_for_timeout(2000)
                        more = await page.evaluate("""
                            () => {
                                const cards = document.querySelectorAll('.views-row,.node--type-event,article[class*="event"]');
                                return Array.from(cards).map(c => ({
                                    titulo: c.querySelector('h2,h3,h4')?.textContent?.trim(),
                                    fecha_raw: c.querySelector('time,[class*="date"]')?.textContent?.trim(),
                                    url_externo: c.querySelector('a')?.href,
                                }));
                            }
                        """)
                        for card in (more or []):
                            if card.get("titulo"):
                                fecha = _parse_fecha_alcaldia(card.get("fecha_raw") or "")
                                url = card.get("url_externo") or ""
                                eventos_raw.append({
                                    "fuente": FUENTE,
                                    "fuente_id": url.rstrip("/").split("/")[-1] if url else card["titulo"][:30],
                                    "titulo": card["titulo"],
                                    "descripcion": "",
                                    "foto_url": None,
                                    "url_externo": url,
                                    "fecha_inicio": fecha,
                                    "fecha_fin": None,
                                    "gratuito": True,
                                    "precio": 0.0,
                                    "organizador": "Alcaldía de Medellín",
                                    "lat": None,
                                    "lon": None,
                                    "direccion": "Medellín",
                                    "categoria_raw": "SocialEvent",
                                })
                        pg += 1
                    except Exception:
                        break

        except Exception as exc:
            print(f"[alcaldia] error: {exc}")
        finally:
            await browser.close()

    # Merge API-captured events
    for item in captured_api:
        n = normalizar_alcaldia(item)
        if n:
            eventos_raw.append(n)

    return eventos_raw


def run(test: bool = False) -> list[dict]:
    eventos = asyncio.run(scrape_async(test=test))

    # Dedup by fuente_id
    seen: set[str] = set()
    uniq = []
    for e in eventos:
        if e["fuente_id"] not in seen:
            seen.add(e["fuente_id"])
            uniq.append(e)

    if test:
        print(f"[alcaldia] {len(uniq)} eventos encontrados")
        for e in uniq[:3]:
            print(f"  - {e['titulo']} | {e['fecha_inicio']} | {e['direccion'][:40]}")

    return uniq


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--test", action="store_true")
    parser.add_argument("--ciudad", default="medellin")
    args = parser.parse_args()
    resultados = run(test=True)
    print(f"\nTotal: {len(resultados)} eventos Alcaldía")
