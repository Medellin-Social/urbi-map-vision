"""Add administracion column to staging.stg_listings_unificado

Revision ID: 0087
Revises: 0086
Create Date: 2026-09-20

Cuota de administración mensual (COP) — ya viene scrapeada en
raw.listings_fincaraiz/metrocuadrado/habi pero nunca se propagaba a la vista
unificada. En Colombia es un gasto fijo relevante para cualquier simulación
de flujo de caja (apartamentos con administración de edificio).
"""
from alembic import op

revision = "0087"
down_revision = "0086"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE staging.stg_listings_unificado
        ADD COLUMN IF NOT EXISTS administracion NUMERIC;
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE staging.stg_listings_unificado
        DROP COLUMN IF EXISTS administracion;
    """)
