"""Backfill de contacto/agencia para listings METROCUADRADO activos.

One-shot (resumable) que llena contacto_phone/whatsapp/company_id/company_name/
realtor_key de los ~110k listings MC activos que se scrapearon con la API vieja
(sin esos campos). Cada listing tiene su `url` de ficha; la ficha trae TODO el
oferente sin enmascarar en el payload RSC. Un fetch por listing.

Por qué un script y no cron: es backfill de UNA vez. El camino recurrente
(listings nuevos) ya lo cubre el scraper SPA (captura del payload de resultados).
Ver [[project_mq_oferente_atribucion]].

Resumable: procesa WHERE realtor_key IS NULL. Cada fila procesada marca realtor_key
(dato real, o 'none' si la ficha no trae oferente) → re-correr continúa donde quedó.
Un fetch FALLIDO (red/timeout) deja la fila sin marcar → se reintenta en la próxima
pasada. No toca `activo`.

Dato personal (Ley 1581): se guarda para atribución interna, NO se expone el teléfono
en el mapa público (api/cache.py lee columnas explícitas, no estas).

Uso:
    python -m scripts.backfill_mq_oferente                 # todos los activos pendientes
    python -m scripts.backfill_mq_oferente --limit 2000    # un lote
    python -m scripts.backfill_mq_oferente --delay 0.4     # throttle entre fichas
"""
from __future__ import annotations

import argparse
import logging
import random
import re
import sys
import time
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).parent.parent))

from scraping.metrocuadrado.scraper import _company_name_from_html, _norm_phone
from scraping.utils.db import get_connection
from scraping.utils.quality import http_get

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

_NONE = "none"  # centinela: ficha procesada pero sin oferente (evita reintento infinito)

# Pool de User-Agents de navegadores reales; se rota por request para no presentar
# una huella única constante en 100k+ fetches (menos detectable).
_UA_POOL = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:123.0) Gecko/20100101 Firefox/123.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
]


def _grab(html: str, key: str) -> str | None:
    """Valor de "<key>":"..." en el payload RSC de la ficha (escapado o no)."""
    m = (re.search(r'\\"' + key + r'\\":\\"([^\\"]*)\\"', html)
         or re.search(r'"' + key + r'":"([^"]*)"', html))
    return (m.group(1).strip() if m else "") or None


def _oferente_from_ficha(html: str) -> dict:
    phone = _grab(html, "contactPhone")
    cid = _grab(html, "companyId")
    ph = _norm_phone(phone)
    realtor_key = f"co:{cid}" if cid else (f"ph:{ph}" if ph else _NONE)
    return {
        "contacto_phone": phone,
        "contacto_whatsapp": _grab(html, "whatsapp"),
        "company_id": cid,
        "company_name": _company_name_from_html(html),
        "realtor_key": realtor_key,
    }


_SELECT = """
SELECT id, url FROM raw.listings_metrocuadrado
WHERE activo = TRUE AND realtor_key IS NULL AND url IS NOT NULL
ORDER BY id
"""

_UPDATE = """
UPDATE raw.listings_metrocuadrado SET
    contacto_phone    = COALESCE(%(contacto_phone)s, contacto_phone),
    contacto_whatsapp = COALESCE(%(contacto_whatsapp)s, contacto_whatsapp),
    company_id        = COALESCE(%(company_id)s, company_id),
    company_name      = COALESCE(%(company_name)s, company_name),
    realtor_key       = %(realtor_key)s
WHERE id = %(id)s
"""


def main() -> None:
    ap = argparse.ArgumentParser(description="Backfill contacto/agencia MC (activos)")
    ap.add_argument("--limit", type=int, default=None, help="máx listings a procesar en esta pasada")
    ap.add_argument("--delay", type=float, default=1.5, help="segundos base entre fichas (+jitter igual); lento=menos detectable")
    ap.add_argument("--rest-every", type=int, default=400, help="pausa larga cada N fichas")
    ap.add_argument("--rest-secs", type=float, default=45, help="segundos de la pausa larga (+jitter)")
    ap.add_argument("--commit-every", type=int, default=200, help="commit cada N filas")
    args = ap.parse_args()

    session = requests.Session()
    session.headers.update({
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "es-CO,es;q=0.9,en;q=0.8",
        "Referer": "https://www.metrocuadrado.com/",
    })

    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT count(*) FROM raw.listings_metrocuadrado WHERE activo=TRUE AND realtor_key IS NULL AND url IS NOT NULL")
        pending = cur.fetchone()[0]
        log.info("pendientes (activos sin realtor_key): %s", pending)

        cur.execute(_SELECT + (f" LIMIT {int(args.limit)}" if args.limit else ""))
        rows = cur.fetchall()

        wcur = conn.cursor()
        done = filled = dead = failed = 0
        for lid, url in rows:
            session.headers["User-Agent"] = random.choice(_UA_POOL)  # rota huella
            resp = http_get(session, url, timeout=30)
            if resp is None:
                failed += 1  # transitorio: NO se marca, se reintenta otra pasada
                time.sleep(args.delay + random.uniform(0, args.delay))
                continue
            o = _oferente_from_ficha(resp.text)
            o["id"] = lid
            wcur.execute(_UPDATE, o)
            done += 1
            if o["realtor_key"] == _NONE:
                dead += 1
            else:
                filled += 1
            if done % args.commit_every == 0:
                conn.commit()
                log.info("procesados %s/%s (con dato %s, sin %s, fallidos %s)",
                         done, len(rows), filled, dead, failed)
            # pausa larga periódica: rompe el ritmo constante (menos detectable)
            if done % args.rest_every == 0:
                conn.commit()
                time.sleep(args.rest_secs + random.uniform(0, args.rest_secs))
            time.sleep(args.delay + random.uniform(0, args.delay))
        conn.commit()
        log.info("LISTO: procesados %s, con dato %s, sin oferente %s, fetch fallidos %s",
                 done, filled, dead, failed)


if __name__ == "__main__":
    main()
