"""Transfiere la atribución de oferente (ya calculada en LOCAL por el backfill)
a la DB de otro entorno (DEV/PROD), emparejando por (url, tipo_operacion).

Barato (DB→DB, NO toca metrocuadrado.com): reusa el fetch ya hecho en local en vez
de re-escrapear 80k fichas por env. Válido SÓLO si el set de urls del target solapa
con el de local (en DEV sí: local se sincronizó DE DEV). En prod, verificar solape
antes (si divergen, esto cubre poco → hace falta backfill propio).

Sólo rellena filas del TARGET con realtor_key IS NULL → NO pisa lo que el cron del env
ya capturó fresco (going-forward). UPDATE por url NO dispara el trigger BEFORE INSERT.

Conexiones:
  TARGET = env de railway (inyectado por `railway run -s postgis`): proxy público.
  SOURCE = local (DATABASE_URL del .env).
Aborta si source == target.

Uso:
    railway run -s postgis -- python -m scripts.push_mq_oferente            # DEV (o el env linkeado)
    railway run -s postgis -- python -m scripts.push_mq_oferente --limit 100 # prueba
"""
from __future__ import annotations

import argparse
import logging
import os
import re
import sys
from pathlib import Path

import psycopg2
import psycopg2.extras

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

_COLS = ["contacto_phone", "contacto_whatsapp", "company_id", "company_name",
         "oferente_bucket", "num_contactos", "realtor_key"]

_SELECT_LOCAL = f"""
SELECT url, tipo_operacion, {', '.join(_COLS)}
FROM raw.listings_metrocuadrado
WHERE fuente='metrocuadrado' AND realtor_key IS NOT NULL AND url IS NOT NULL
"""

# Carga masiva a una temp en el target y un solo UPDATE...FROM (rápido; evita 69k
# UPDATEs sueltos sobre el proxy). Sólo rellena destino vacío (no pisa cron fresco).
_CREATE_TEMP = f"""
CREATE TEMP TABLE _mq_push (
    url TEXT, tipo_operacion TEXT, {', '.join(f'{c} TEXT' for c in _COLS if c != 'num_contactos')},
    num_contactos INTEGER
) ON COMMIT DROP
"""
_UPDATE_FROM = f"""
UPDATE raw.listings_metrocuadrado t SET
    {', '.join(f'{c} = s.{c}' for c in _COLS)}
FROM _mq_push s
WHERE t.url = s.url AND t.tipo_operacion = s.tipo_operacion AND t.realtor_key IS NULL
"""


def _local_url() -> str:
    env = Path(__file__).parent.parent / ".env"
    for line in env.read_text().splitlines():
        m = re.match(r"\s*DATABASE_URL\s*=\s*(.+)\s*$", line)
        if m:
            return m.group(1).strip().strip('"').strip("'")
    raise RuntimeError("DATABASE_URL no encontrado en .env local")


def _target_url() -> str:
    url = os.environ.get("DATABASE_PUBLIC_URL", "") or os.environ.get("DATABASE_URL", "")
    host = os.environ.get("RAILWAY_TCP_PROXY_DOMAIN")
    port = os.environ.get("RAILWAY_TCP_PROXY_PORT")
    if host and port and os.environ.get("POSTGRES_USER"):
        url = (f"postgresql://{os.environ['POSTGRES_USER']}:{os.environ['POSTGRES_PASSWORD']}"
               f"@{host}:{port}/{os.environ.get('POSTGRES_DB', 'railway')}")
    return url


def main() -> None:
    ap = argparse.ArgumentParser(description="Push atribución MC local → env (DEV/PROD)")
    ap.add_argument("--limit", type=int, default=None, help="prueba: solo N filas de local")
    args = ap.parse_args()

    source = _local_url()
    target = _target_url()
    if not target:
        sys.exit("Sin conexión al target. Correr: railway run -s postgis -- python -m scripts.push_mq_oferente")
    if target == source:
        sys.exit("TARGET == SOURCE (apunta a local). Falta `railway run -s postgis` para el env remoto.")
    log.info("SOURCE=local  TARGET=%s", target.rsplit("@", 1)[-1])

    src = psycopg2.connect(source)
    dst = psycopg2.connect(target)
    try:
        scur = src.cursor()
        scur.execute(_SELECT_LOCAL + (f" LIMIT {int(args.limit)}" if args.limit else ""))
        rows = [(url, op, *vals) for url, op, *vals in scur]
        log.info("leídas de local: %s filas", len(rows))

        dcur = dst.cursor()
        dcur.execute(_CREATE_TEMP)
        psycopg2.extras.execute_values(
            dcur,
            f"INSERT INTO _mq_push (url, tipo_operacion, {', '.join(_COLS)}) VALUES %s",
            rows, page_size=5000)
        log.info("cargadas a temp del target: %s", len(rows))
        dcur.execute(_UPDATE_FROM)
        touched = dcur.rowcount
        dst.commit()  # dropea la temp (ON COMMIT DROP)
        log.info("LISTO: %s filas del target actualizadas (destino que estaba NULL)", touched)

        dcur.execute("SELECT count(*) FILTER (WHERE realtor_key IS NOT NULL), count(*) FILTER (WHERE activo) FROM raw.listings_metrocuadrado WHERE fuente='metrocuadrado'")
        d, a = dcur.fetchone()
        log.info("TARGET ahora: %s atribuidos / %s activos", d, a)
    finally:
        src.close(); dst.close()


if __name__ == "__main__":
    main()
