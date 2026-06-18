"""Add fecha_primera_vez to raw.listings_metrocuadrado if BASE TABLE

Revision ID: 0032
Revises: 0031
Create Date: 2026-06-18

raw.listings_fincaraiz is a VIEW in prod — cannot add columns.
raw.listings_metrocuadrado is a BASE TABLE — safe to ALTER.
The listings SQL uses fecha_primera_vez from both; after this migration
only lm (metrocuadrado) is used for dias_en_mercado.
"""
from alembic import op

revision = "0032"
down_revision = "0031"
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
                EXECUTE 'ALTER TABLE raw.listings_metrocuadrado ADD COLUMN IF NOT EXISTS fecha_primera_vez TIMESTAMPTZ';
            END IF;
        END $$;
    """)


def downgrade() -> None:
    pass
