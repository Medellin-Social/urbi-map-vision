"""
Booking.com monthly stays scraper — Medellín

Requires checkin/checkout dates for prices to appear.
Price shown as total for 30 nights in COP (dot-thousands: "7.278.240").
Card has area_m2, bedrooms, bathrooms in availability-rate-wrapper.

Anti-bot measures:
- webdriver flag disabled
- Realistic UA + locale
- 6s page delays
- Cookie consent handled
- CAPTCHA detection → graceful stop
"""
import re
import sys
import time
from datetime import date, timedelta
from pathlib import Path
from typing import Optional

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

FUENTE = "booking_mensual"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
PAGE_DELAY = 6

# Use next full calendar month as stay window
_next = (date.today().replace(day=1) + timedelta(days=32)).replace(day=1)
CHECKIN = _next.strftime("%Y-%m-%d")
CHECKOUT = (_next + timedelta(days=30)).strftime("%Y-%m-%d")

SEARCH_URL = (
    "https://www.booking.com/searchresults.html"
    "?ss=Medellin%2C+Colombia"
    "&lang=es-co"
    f"&checkin={CHECKIN}"
    f"&checkout={CHECKOUT}"
    "&nflt=pri_min_nights%3D28"
    "&selected_currency=COP"
    "&rows=25"
)


def _parse_cop_dot_thousands(text: str) -> int:
    """Parse COP price from Booking's dot-thousands format: '7.278.240' → 7278240."""
    text = text.replace("\xa0", "").strip()
    # Pattern: digits with dots as thousands separators
    m = re.search(r"([\d.]{5,})", text)
    if not m:
        return 0
    raw = m.group(1)
    # "7.278.240" — dots are thousands separators
    cleaned = raw.replace(".", "")
    try:
        val = int(cleaned)
        # Sanity: monthly COP rent 200k–100M
        return val if 200_000 <= val <= 100_000_000 else 0
    except ValueError:
        return 0


def _accept_cookies(page) -> None:
    for sel in [
        "[data-testid='accept-button']",
        "button[id*='accept']",
        "#onetrust-accept-btn-handler",
    ]:
        try:
            btn = page.query_selector(sel)
            if btn and btn.is_visible():
                btn.click()
                time.sleep(1)
                return
        except Exception:
            pass


def _is_captcha(page) -> bool:
    return bool(
        page.query_selector("[class*='captcha'], #cf-challenge-running, .g-recaptcha")
    )


def _parse_card(card, barrios: list[dict]) -> Optional[dict]:
    """Parse one Booking.com property-card div."""
    try:
        # --- title ---
        title = ""
        title_el = card.find(attrs={"data-testid": "title"})
        if title_el:
            title = title_el.get_text(strip=True)
        if not title:
            return None

        # --- price: total for 30 nights (COP) ---
        # In availability-rate-wrapper: "30 noches, 2 adultosCOP 12.336.000COP 7.278.240Pre..."
        # Take the LAST COP amount (discounted price)
        price_mes_cop = 0
        rate_el = card.find(attrs={"data-testid": "availability-rate-wrapper"})
        if rate_el:
            rate_text = rate_el.get_text(separator=" ", strip=True)
            # Find all COP amounts
            amounts = re.findall(r"COP[\s\xa0]*([\d.]+)", rate_text)
            if amounts:
                # Use last amount (discounted) if multiple, else first
                for raw in reversed(amounts):
                    val = _parse_cop_dot_thousands(raw)
                    if val:
                        price_mes_cop = val
                        break

        if not price_mes_cop:
            # Fallback: any price-testid
            for sel in [
                {"data-testid": "price-and-discounts-price"},
                {"data-testid": "price"},
            ]:
                el = card.find(attrs=sel)
                if el:
                    price_mes_cop = _parse_cop_dot_thousands(el.get_text())
                    if price_mes_cop:
                        break

        if not price_mes_cop:
            return None

        price_mes_usd = round(price_mes_cop / USD_TO_COP, 2)

        # --- barrio ---
        barrio_raw = ""
        addr_el = card.find(attrs={"data-testid": "address-link"})
        if addr_el:
            barrio_raw = addr_el.get_text(strip=True)

        # --- rooms/area from unit configuration ---
        beds = None
        baths = None
        area = None
        unit_el = card.find(attrs={"data-testid": "property-card-unit-configuration"})
        if unit_el:
            unit_text = unit_el.get_text(separator=" ", strip=True)
            m_beds = re.search(r"(\d+)\s*dormitorio", unit_text, re.I)
            if m_beds:
                beds = int(m_beds.group(1))
            m_baths = re.search(r"(\d+)\s*baño", unit_text, re.I)
            if m_baths:
                baths = float(m_baths.group(1))
            m_area = re.search(r"(\d+)\s*m[²2]", unit_text, re.I)
            if m_area:
                area = float(m_area.group(1))

        # Also check recommended-units for area if not found
        if area is None:
            avail_el = card.find(attrs={"data-testid": "availability-single"})
            if avail_el:
                avail_text = avail_el.get_text(separator=" ", strip=True)
                m = re.search(r"(\d+)\s*m[²2]", avail_text, re.I)
                if m:
                    area = float(m.group(1))

        # --- URL ---
        url = ""
        link = card.find("a", attrs={"data-testid": "title-link"})
        if not link:
            link = card.find("a", href=re.compile(r"/hotel/"))
        if link:
            href = link.get("href", "")
            url = href if href.startswith("http") else "https://www.booking.com" + href
            url = url.split("?")[0]  # strip tracking params

        if not url:
            return None

        # Property type hint
        tipo = ""
        body_text = card.get_text(separator=" ", strip=True).lower()
        for word, label in [
            ("apartamento", "[Aparto]"),
            ("apartment", "[Aparto]"),
            ("estudio", "[Estudio]"),
            ("studio", "[Estudio]"),
            ("casa", "[Casa]"),
            ("villa", "[Casa]"),
        ]:
            if word in body_text:
                tipo = label
                break

        titulo_full = f"{tipo} {title}".strip()[:500]

        return {
            "fuente": FUENTE,
            "titulo": titulo_full,
            "precio_mes_cop": price_mes_cop,
            "precio_mes_usd": price_mes_usd,
            "area_m2": area,
            "habitaciones": beds,
            "banos": baths,
            "barrio_raw": barrio_raw[:200] or None,
            "barrio_id": match_barrio(barrio_raw, barrios),
            "amoblado": True,
            "incluye_servicios": None,
            "min_noches": 28,
            "url": url[:500],
            "lat": None,
            "lon": None,
            "dedup_hash": make_dedup_hash(FUENTE, url),
        }
    except Exception as e:
        print(f"    Card parse error: {e}")
        return None


def _extract_page_listings(page, barrios: list[dict]) -> list[dict]:
    html = page.content()
    soup = BeautifulSoup(html, "lxml")

    cards = soup.find_all("div", attrs={"data-testid": "property-card"})
    if not cards:
        cards = soup.find_all("li", attrs={"data-testid": "property-card-container"})

    print(f"    {len(cards)} property cards")
    results = []
    for card in cards:
        listing = _parse_card(card, barrios)
        if listing:
            results.append(listing)
    return results


def scrape(dry_run: bool = False, max_pages: int = 3) -> list[dict]:
    conn = get_conn()
    ensure_table(conn)
    barrios = load_barrios(conn)
    all_results: list[dict] = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-blink-features=AutomationControlled",
            ],
        )
        ctx = browser.new_context(
            user_agent=UA,
            locale="es-CO",
            viewport={"width": 1366, "height": 768},
            extra_http_headers={
                "Accept-Language": "es-CO,es;q=0.9,en;q=0.8",
            },
        )
        ctx.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"
        )
        page = ctx.new_page()

        print(f"  Loading Booking.com ({CHECKIN}→{CHECKOUT}): {SEARCH_URL[:80]}")
        try:
            page.goto(SEARCH_URL, wait_until="domcontentloaded", timeout=45000)
        except Exception as e:
            print(f"  ERROR loading Booking: {e}")
            browser.close()
            conn.close()
            return []

        time.sleep(PAGE_DELAY)
        _accept_cookies(page)
        time.sleep(2)

        if _is_captcha(page):
            print("  CAPTCHA detected — skipping Booking")
            browser.close()
            conn.close()
            return []

        for page_num in range(1, max_pages + 1):
            print(f"  Page {page_num}/{max_pages}")

            try:
                page.wait_for_selector(
                    "[data-testid='property-card']",
                    timeout=15000,
                )
            except Exception:
                print(f"  No cards on page {page_num}")
                break

            if _is_captcha(page):
                print("  CAPTCHA detected — stopping")
                break

            time.sleep(PAGE_DELAY)
            page_listings = _extract_page_listings(page, barrios)
            all_results.extend(page_listings)
            print(f"  Page {page_num}: {len(page_listings)} valid | cumulative: {len(all_results)}")

            if page_num >= max_pages:
                break

            try:
                next_btn = page.query_selector(
                    "[data-testid='pagination-next'], "
                    "button[aria-label*='iguiente'], "
                    "a[aria-label*='iguiente']"
                )
                if next_btn and next_btn.is_visible():
                    next_btn.click()
                    time.sleep(PAGE_DELAY)
                else:
                    print("  No next-page button")
                    break
            except Exception as e:
                print(f"  Pagination error: {e}")
                break

        browser.close()

    # Deduplicate by URL
    seen: set[str] = set()
    unique = [r for r in all_results if r["url"] not in seen and not seen.add(r["url"])]  # type: ignore[func-returns-value]
    print(f"  Booking deduped: {len(unique)} unique")

    saved = 0
    for listing in unique:
        if dry_run:
            print(f"    DRY: {listing.get('titulo','?')[:50]} | COP {listing.get('precio_mes_cop',0):,} | {listing.get('barrio_raw','?')}")
        else:
            try:
                upsert_listing(conn, listing)
                saved += 1
            except Exception as e:
                print(f"    DB error: {e}")

    conn.close()
    print(f"Booking: {saved} saved")
    return unique


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--max-pages", type=int, default=3)
    args = ap.parse_args()
    scrape(dry_run=args.dry_run, max_pages=args.max_pages)
