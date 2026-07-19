"""
tuboleta.com scraper — Playwright + parseo de cards del DOM.

Sitio migrado a Drupal (2026). La búsqueda expone un GET filtrable:
  /es/resultados-de-busqueda?ciudades=12030&categorias=All   (12030 = Medellín)
Se pagina con &page=N y se parsean las cards <article> (links /es/eventos/<slug>).
Fechas como texto plano sin año ("Desde 16 Jul Jue Hasta 20 Jul Lun").

Usage:
  python scraping/eventos/tuboleta_scraper.py --test
"""
import argparse
import asyncio
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

FUENTE = "tuboleta"
BASE_URL = "https://www.tuboleta.com"
CIUDAD_MEDELLIN_TID = "12030"  # term id del filtro "ciudades" para Medellín
SEARCH_URL = (
    f"{BASE_URL}/es/resultados-de-busqueda"
    f"?ciudades={CIUDAD_MEDELLIN_TID}&categorias=All"
)
MAX_PAGINAS = 10

_MESES = {
    "ene": 1, "feb": 2, "mar": 3, "abr": 4, "may": 5, "jun": 6,
    "jul": 7, "ago": 8, "sep": 9, "oct": 10, "nov": 11, "dic": 12,
}


def _parse_fechas(lines: list[str]) -> tuple[str | None, str | None]:
    """Extrae fechas de las líneas de la card: 'Desde 16 Jul Jue Hasta 20 Jul Lun'.

    Sin año en el sitio: se asume año actual, o el siguiente solo si la fecha
    quedó >60 días en el pasado (eventos en curso son de este año).
    """
    hoy = date.today()
    fechas: list[str] = []
    for i, ln in enumerate(lines[:-1]):
        if ln.isdigit() and 1 <= int(ln) <= 31:
            mes = _MESES.get(lines[i + 1][:3].lower())
            if mes:
                anio = hoy.year
                try:
                    delta = (hoy - date(anio, mes, int(ln))).days
                except ValueError:
                    continue
                if delta > 60:
                    anio += 1
                fechas.append(f"{anio}-{mes:02d}-{int(ln):02d}")
        if len(fechas) == 2:
            break
    inicio = fechas[0] if fechas else None
    fin = fechas[1] if len(fechas) > 1 else None
    return inicio, fin


def _parse_card(card: dict, vistos: set[str]) -> dict | None:
    url = (card.get("url") or "").split("?")[0]
    slug = url.rstrip("/").split("/")[-1]
    if not slug or slug in vistos:
        return None
    lines = [l.strip() for l in (card.get("texto") or "").splitlines() if l.strip()]
    if not lines:
        return None
    titulo = lines[0].strip("'‘’\"")
    # línea de ciudad: primera que contenga "medell"; venue = lo que hay entre
    # título y ciudad (algunas cards no traen venue)
    ciudad_idx = next((i for i, l in enumerate(lines) if "medell" in l.lower()), None)
    venue = lines[1] if ciudad_idx is not None and ciudad_idx > 1 else ""
    fecha_inicio, fecha_fin = _parse_fechas(lines)
    if not titulo or not fecha_inicio:
        return None
    vistos.add(slug)
    return {
        "fuente": FUENTE,
        "fuente_id": slug,
        "titulo": titulo,
        "descripcion": "",
        "foto_url": card.get("imagen"),
        "url_externo": url,
        "fecha_inicio": fecha_inicio,
        "fecha_fin": fecha_fin,
        "gratuito": False,
        "precio": 0.0,
        "organizador": venue,
        "lat": None,
        "lon": None,
        "direccion": f"{venue}, Medellín" if venue else "Medellín",
        "categoria_raw": "",
    }


async def _scrape_async() -> list[dict]:
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        print("[tuboleta] playwright not installed")
        return []

    vistos: set[str] = set()
    eventos: list[dict] = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(
            user_agent=(
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            )
        )
        try:
            for num in range(MAX_PAGINAS):
                await page.goto(
                    f"{SEARCH_URL}&page={num}",
                    wait_until="domcontentloaded",
                    timeout=60000,
                )
                await page.wait_for_timeout(5000)
                cards = await page.evaluate("""
                    () => Array.from(document.querySelectorAll('a[href*="/es/eventos/"]'))
                        .map(a => {
                            const art = a.closest('article');
                            return {
                                url: a.href,
                                imagen: art?.querySelector('img')?.src || null,
                                texto: (art || a).innerText,
                            };
                        })
                """)
                nuevos = 0
                for card in (cards or []):
                    ev = _parse_card(card, vistos)
                    if ev:
                        eventos.append(ev)
                        nuevos += 1
                if not cards or nuevos == 0:
                    break
        except Exception as exc:
            print(f"[tuboleta] error: {exc}")
        finally:
            await browser.close()

    return eventos


def run(test: bool = False) -> list[dict]:
    eventos = asyncio.run(_scrape_async())
    if test:
        print(f"[tuboleta] {len(eventos)} eventos encontrados")
        for e in eventos[:5]:
            print(f"  - {e['titulo']} | {e['fecha_inicio']} | {e['organizador']}")
    return eventos


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--test", action="store_true")
    args = parser.parse_args()
    resultados = run(test=True)
    print(f"\nTotal: {len(resultados)} eventos Tuboleta")
