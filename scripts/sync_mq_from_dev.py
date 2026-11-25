"""Sincroniza los listings METROCUADRADO ACTIVOS de DEV → local.

El local está desactualizado; para que el backfill de oferente fetchee las URLs
correctas (las que DEV sirve hoy), primero traemos el set activo de DEV al local.
Es DB→DB puro, NO toca metrocuadrado.com (sin riesgo de detección).

Conexiones:
  SOURCE (DEV)   = os.environ['DATABASE_URL']  → inyectado por `railway run` (no se imprime)
  TARGET (local) = DATABASE_URL del archivo .env (localhost)
Aborta si source == target (evita pisarse a sí mismo).

Qué hace:
  1. Upsert de cada fila activa MC de DEV en local (ON CONFLICT url,tipo_operacion).
     Sólo columnas base (pre-0132: DEV aún no tiene las de oferente).
  2. Desactiva en local las MC cuya url NO esté en el set activo de DEV
     → el set activo local queda EXACTO al de DEV (backfill no gasta fetches en muertos).

Uso:
    railway run -- python -m scripts.sync_mq_from_dev            # completo
    railway run -- python -m scripts.sync_mq_from_dev --limit 50 # prueba
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

# Columnas base presentes en AMBOS envs (pre-migración 0132 en DEV).
# NO se trae barrio_id: su FK apunta a raw.barrios y los ids de DEV no coinciden con
# los locales. El backfill sólo necesita url; barrio_id queda NULL (no hace falta).
_COLS = [
    "fuente", "tipo_operacion", "tipo_inmueble", "precio", "area_m2",
    "habitaciones", "banos", "direccion_raw", "barrio_raw", "municipio_raw",
    "url", "lat", "lon", "estrato", "fecha_scraping", "activo",
    "raw_data", "fecha_publicacion", "dias_en_mercado", "dedup_hash", "fotos",
]

_SELECT_DEV = f"""
SELECT {', '.join(_COLS)} FROM raw.listings_metrocuadrado
WHERE fuente = 'metrocuadrado' AND activo = TRUE AND url IS NOT NULL
"""

_UPSERT_LOCAL = f"""
INSERT INTO raw.listings_metrocuadrado ({', '.join(_COLS)})
VALUES ({', '.join('%s' for _ in _COLS)})
ON CONFLICT (url, tipo_operacion) DO UPDATE SET
    activo         = TRUE,
    precio         = EXCLUDED.precio,
    area_m2        = EXCLUDED.area_m2,
    barrio_raw     = COALESCE(EXCLUDED.barrio_raw, raw.listings_metrocuadrado.barrio_raw),
    municipio_raw  = COALESCE(EXCLUDED.municipio_raw, raw.listings_metrocuadrado.municipio_raw),
    lat            = COALESCE(EXCLUDED.lat, raw.listings_metrocuadrado.lat),
    lon            = COALESCE(EXCLUDED.lon, raw.listings_metrocuadrado.lon),
    raw_data       = COALESCE(EXCLUDED.raw_data, raw.listings_metrocuadrado.raw_data),
    fecha_scraping = EXCLUDED.fecha_scraping
"""


def _local_url() -> str:
    """DATABASE_URL del .env local (parseado directo: railway run sobreescribe os.environ)."""
    env = Path(__file__).parent.parent / ".env"
    for line in env.read_text().splitlines():
        m = re.match(r"\s*DATABASE_URL\s*=\s*(.+)\s*$", line)
        if m:
            return m.group(1).strip().strip('"').strip("'")
    raise RuntimeError("DATABASE_URL no encontrado en .env local")


def main() -> None:
    ap = argparse.ArgumentParser(description="Sync MC activos DEV → local")
    ap.add_argument("--limit", type=int, default=None, help="prueba: solo N filas, sin desactivar")
    args = ap.parse_args()

    # DATABASE_URL de Railway usa host interno (*.railway.internal, no resuelve fuera).
    # Desde local: construir con el proxy PÚBLICO (vars del servicio postgis).
    dev_url = os.environ.get("DATABASE_PUBLIC_URL", "") or os.environ.get("DATABASE_URL", "")
    host = os.environ.get("RAILWAY_TCP_PROXY_DOMAIN")
    port = os.environ.get("RAILWAY_TCP_PROXY_PORT")
    if host and port and os.environ.get("POSTGRES_USER"):
        dev_url = (f"postgresql://{os.environ['POSTGRES_USER']}:{os.environ['POSTGRES_PASSWORD']}"
                   f"@{host}:{port}/{os.environ.get('POSTGRES_DB', 'railway')}")
    local_url = _local_url()
    if not dev_url:
        sys.exit("Sin conexión a DEV. Correr: railway run -s postgis -- python -m scripts.sync_mq_from_dev")
    if dev_url == local_url:
        sys.exit("SOURCE == TARGET: DATABASE_URL apunta al local. Falta `railway run` para inyectar el de DEV.")

    log.info("SOURCE=DEV (railway)  TARGET=local(%s)", local_url.rsplit("@", 1)[-1])
    src = psycopg2.connect(dev_url)
    dst = psycopg2.connect(local_url)
    try:
        scur = src.cursor(name="dev_mc")  # server-side cursor: no carga 100k en RAM
        scur.itersize = 2000
        scur.execute(_SELECT_DEV + (f" LIMIT {int(args.limit)}" if args.limit else ""))

        dcur = dst.cursor()
        dev_urls: list[str] = []
        batch: list[tuple] = []
        total = 0
        url_idx = _COLS.index("url")
        raw_idx = _COLS.index("raw_data")
        for row in scur:
            row = list(row)
            if row[raw_idx] is not None:  # JSONB vuelve como dict; re-envolver para insertar
                row[raw_idx] = psycopg2.extras.Json(row[raw_idx])
            batch.append(row)
            dev_urls.append(row[url_idx])
            if len(batch) >= 2000:
                psycopg2.extras.execute_batch(dcur, _UPSERT_LOCAL, batch, page_size=500)
                dst.commit()
                total += len(batch)
                log.info("upserted %s", total)
                batch = []
        if batch:
            psycopg2.extras.execute_batch(dcur, _UPSERT_LOCAL, batch, page_size=500)
            dst.commit()
            total += len(batch)
        log.info("DEV activos upserted a local: %s", total)

        if args.limit:
            log.info("modo prueba (--limit): NO se desactiva nada")
        else:
            # Desactivar local MC que ya no están activos en DEV.
            dcur.execute("CREATE TEMP TABLE _dev_active(url TEXT PRIMARY KEY) ON COMMIT DROP")
            psycopg2.extras.execute_batch(
                dcur, "INSERT INTO _dev_active(url) VALUES (%s) ON CONFLICT DO NOTHING",
                [(u,) for u in set(dev_urls)], page_size=1000)
            dcur.execute("""
                UPDATE raw.listings_metrocuadrado SET activo = FALSE
                WHERE fuente = 'metrocuadrado' AND activo = TRUE
                  AND url NOT IN (SELECT url FROM _dev_active)
            """)
            log.info("desactivados en local (no activos en DEV): %s", dcur.rowcount)
            dst.commit()

        dcur.execute("SELECT count(*) FROM raw.listings_metrocuadrado WHERE fuente='metrocuadrado' AND activo=TRUE")
        log.info("LOCAL activos MC ahora: %s", dcur.fetchone()[0])
    finally:
        src.close()
        dst.close()


if __name__ == "__main__":
    main()
