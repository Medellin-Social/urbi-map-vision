"""expand raw.listings_premium and raw.listings_renta_media to match local schema

Backfilling real scraped data (fincaraiz/premium/renta_media) from local to
prod, same approach as 0071's metrocuadrado sync. Both tables are real
(non-stub) in prod but predate several columns local has since grown.
pg_restore's data-only COPY names columns explicitly, so any column present
locally but missing in prod aborts the whole COPY. Bring both up to local's
column set.

Revision ID: 0072
Revises: 0071
"""
from alembic import op

revision = "0072"
down_revision = "0071"
branch_labels = None
depends_on = None

_PREMIUM_COLUMNS = [
    ("titulo", "character varying"),
    ("parqueaderos", "integer"),
    ("piso", "integer"),
    ("estrato", "integer"),
    ("municipio", "character varying"),
    ("agente_nombre", "character varying"),
    ("agente_telefono", "character varying"),
    ("agente_email", "character varying"),
    ("agencia", "character varying"),
    ("fecha_publicacion", "date"),
]

_RENTA_MEDIA_COLUMNS = [
    ("precio_mes_usd", "numeric(10,2)"),
    ("raw_data", "jsonb"),
    ("titulo", "character varying"),
    ("incluye_servicios", "boolean"),
    ("min_noches", "integer"),
]


def upgrade() -> None:
    for name, coltype in _PREMIUM_COLUMNS:
        op.execute(f"ALTER TABLE raw.listings_premium ADD COLUMN IF NOT EXISTS {name} {coltype};")
    for name, coltype in _RENTA_MEDIA_COLUMNS:
        op.execute(f"ALTER TABLE raw.listings_renta_media ADD COLUMN IF NOT EXISTS {name} {coltype};")


def downgrade() -> None:
    for name, _ in _PREMIUM_COLUMNS:
        op.execute(f"ALTER TABLE raw.listings_premium DROP COLUMN IF EXISTS {name};")
    for name, _ in _RENTA_MEDIA_COLUMNS:
        op.execute(f"ALTER TABLE raw.listings_renta_media DROP COLUMN IF EXISTS {name};")
