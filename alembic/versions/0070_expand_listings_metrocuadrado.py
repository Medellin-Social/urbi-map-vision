"""expand raw.listings_metrocuadrado to full schema

Root cause of the silently-failing hourly cache refresh (api/cache.py
refresh_listings_cache, wrapped in try/except → only logs a warning, never
surfaces). _REFRESH_STG_LISTINGS's metrocuadrado branch selects id, activo,
tipo_operacion, precio, area_m2, barrio_id, dedup_hash, etc. — prod's
raw.listings_metrocuadrado is still 0063's 4-column stub (url,
fecha_primera_vez, raw_data, amenidades), so every UNION ALL branch touching
it fails to parse and the whole refresh throws, silently, every hour, since
whenever that stub was created. Combined with 0067/0068's missing tables,
staging.stg_listings_unificado has been frozen since its last successful
refresh — the site has been serving stale listings ever since.

Table stays at 0 rows (real metrocuadrado data was never synced to prod —
a known, separate gap per project memory); this migration only makes the
schema complete enough for the refresh query to stop crashing.

Revision ID: 0070
Revises: 0069
"""
from alembic import op

revision = "0070"
down_revision = "0069"
branch_labels = None
depends_on = None

_COLUMNS = [
    ("id", "integer"),
    ("fuente", "text DEFAULT 'metrocuadrado'"),
    ("tipo_operacion", "text"),
    ("tipo_inmueble", "text"),
    ("precio", "numeric"),
    ("area_m2", "numeric"),
    ("habitaciones", "integer"),
    ("banos", "integer"),
    ("direccion_raw", "text"),
    ("barrio_raw", "text"),
    ("lat", "double precision"),
    ("lon", "double precision"),
    ("estrato", "integer"),
    ("fecha_scraping", "timestamptz DEFAULT now()"),
    ("activo", "boolean DEFAULT true"),
    ("barrio_id", "integer"),
    ("fecha_publicacion", "date"),
    ("dias_en_mercado", "integer"),
    ("dedup_hash", "varchar"),
    ("geom", "geometry(Point, 4326)"),
    ("municipio_raw", "text"),
    ("estrato_real", "integer"),
    ("url_activa", "boolean"),
    ("url_validada_at", "timestamp"),
    ("fecha_ultima_vez_activa", "timestamp"),
    ("fotos", "text[]"),
    ("parqueaderos", "smallint"),
    ("piso", "smallint"),
    ("antiguedad", "text"),
    ("administracion", "numeric"),
]


def upgrade() -> None:
    for name, coltype in _COLUMNS:
        op.execute(f"ALTER TABLE raw.listings_metrocuadrado ADD COLUMN IF NOT EXISTS {name} {coltype};")


def downgrade() -> None:
    for name, _ in _COLUMNS:
        op.execute(f"ALTER TABLE raw.listings_metrocuadrado DROP COLUMN IF EXISTS {name};")
