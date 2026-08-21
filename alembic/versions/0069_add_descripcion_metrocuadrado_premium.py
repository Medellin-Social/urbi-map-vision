"""add descripcion column to raw.listings_metrocuadrado and raw.listings_premium

Same 500 as 0067/0068, third variant: these two tables exist in prod with
real data, but with an older/reduced schema — _LISTING_BY_ID_SQL reads
lm.descripcion and lp.descripcion (COALESCE fallback for the listing
description), and neither column exists in prod. raw.listings_metrocuadrado
in prod is still the minimal 4-column stub from 0063 (url, fecha_primera_vez,
raw_data, amenidades); raw.listings_premium in prod is the real VRBO/portal
table but missing several columns present locally (titulo, descripcion,
agente_*, municipio, fecha_publicacion) — only descripcion is needed here.

Revision ID: 0069
Revises: 0068
"""
from alembic import op

revision = "0069"
down_revision = "0068"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE raw.listings_metrocuadrado ADD COLUMN IF NOT EXISTS descripcion text;")
    op.execute("ALTER TABLE raw.listings_premium ADD COLUMN IF NOT EXISTS descripcion text;")


def downgrade() -> None:
    op.execute("ALTER TABLE raw.listings_metrocuadrado DROP COLUMN IF EXISTS descripcion;")
    op.execute("ALTER TABLE raw.listings_premium DROP COLUMN IF EXISTS descripcion;")
