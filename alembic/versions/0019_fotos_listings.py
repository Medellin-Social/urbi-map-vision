"""feat: add fotos TEXT[] to fincaraiz and metrocuadrado tables

Revision ID: 0019
Revises: 0018
Create Date: 2026-06-08
"""
from alembic import op

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'raw'
                  AND table_name = 'listings_fincaraiz'
                  AND table_type = 'BASE TABLE'
            ) THEN
                EXECUTE 'ALTER TABLE raw.listings_fincaraiz ADD COLUMN IF NOT EXISTS fotos TEXT[]';
                EXECUTE 'CREATE INDEX IF NOT EXISTS idx_fc_fotos ON raw.listings_fincaraiz USING GIN(fotos) WHERE fotos IS NOT NULL';
            END IF;
        END $$;
    """)
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'raw'
                  AND table_name = 'listings_metrocuadrado'
                  AND table_type = 'BASE TABLE'
            ) THEN
                EXECUTE 'ALTER TABLE raw.listings_metrocuadrado ADD COLUMN IF NOT EXISTS fotos TEXT[]';
                EXECUTE 'CREATE INDEX IF NOT EXISTS idx_mq_fotos ON raw.listings_metrocuadrado USING GIN(fotos) WHERE fotos IS NOT NULL';
            END IF;
        END $$;
    """)


def downgrade() -> None:
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='raw' AND table_name='listings_fincaraiz' AND table_type='BASE TABLE') THEN
                EXECUTE 'ALTER TABLE raw.listings_fincaraiz DROP COLUMN IF EXISTS fotos';
            END IF;
        END $$;
    """)
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='raw' AND table_name='listings_metrocuadrado' AND table_type='BASE TABLE') THEN
                EXECUTE 'ALTER TABLE raw.listings_metrocuadrado DROP COLUMN IF EXISTS fotos';
            END IF;
        END $$;
    """)
