"""Add missing columns to raw.listings_metrocuadrado

Revision ID: 0033
Revises: 0032
Create Date: 2026-06-18

raw.listings_metrocuadrado was created by the scraper (pre-alembic).
The cache refresh SELECT references estrato_real, estrato, tipo_operacion,
tipo_inmueble, direccion_raw which may not exist in older prod instances.
"""
from alembic import op

revision = "0033"
down_revision = "0032"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'raw'
                  AND table_name = 'listings_metrocuadrado'
                  AND table_type = 'BASE TABLE'
            ) THEN
                EXECUTE 'ALTER TABLE raw.listings_metrocuadrado ADD COLUMN IF NOT EXISTS estrato INTEGER';
                EXECUTE 'ALTER TABLE raw.listings_metrocuadrado ADD COLUMN IF NOT EXISTS estrato_real INTEGER';
                EXECUTE 'ALTER TABLE raw.listings_metrocuadrado ADD COLUMN IF NOT EXISTS tipo_operacion TEXT';
                EXECUTE 'ALTER TABLE raw.listings_metrocuadrado ADD COLUMN IF NOT EXISTS tipo_inmueble TEXT';
                EXECUTE 'ALTER TABLE raw.listings_metrocuadrado ADD COLUMN IF NOT EXISTS direccion_raw TEXT';
                EXECUTE 'ALTER TABLE raw.listings_metrocuadrado ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT true';
            END IF;
        END $$;
    """)


def downgrade() -> None:
    pass
