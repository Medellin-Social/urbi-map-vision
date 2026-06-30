"""stg_listings_unificado — antiguedad + amenidades (poblado desde raw vía cache.py)

Revision ID: 0042
Revises: 0041
Create Date: 2026-06-29

Mismo patrón que amoblado (0040): columnas en stg pobladas por el rebuild de
cache._REFRESH_STG_LISTINGS desde cada fuente raw. Pass-through crudo:
- antiguedad: texto de la fuente (metrocuadrado usa el enum de la UI; fincaraiz
  códigos numéricos; resto NULL). Normalización se decide al cablear el filtro.
- amenidades: array de labels de la fuente (vocabulario por fuente, sin normalizar).
"""
from alembic import op

revision = "0042"
down_revision = "0041"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE staging.stg_listings_unificado ADD COLUMN IF NOT EXISTS antiguedad text")
    op.execute("ALTER TABLE staging.stg_listings_unificado ADD COLUMN IF NOT EXISTS amenidades text[]")


def downgrade() -> None:
    op.execute("ALTER TABLE staging.stg_listings_unificado DROP COLUMN IF EXISTS amenidades")
    op.execute("ALTER TABLE staging.stg_listings_unificado DROP COLUMN IF EXISTS antiguedad")
