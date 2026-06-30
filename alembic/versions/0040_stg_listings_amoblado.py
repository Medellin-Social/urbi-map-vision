"""Add amoblado column to staging.stg_listings_unificado

Revision ID: 0040
Revises: 0039
Create Date: 2026-06-29

Adds BOOLEAN amoblado column to stg_listings_unificado.
Populated by cache.py refresh from raw.listings_fincaraiz amenidades.
"""
from alembic import op

revision = "0040"
down_revision = "0039"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE staging.stg_listings_unificado
        ADD COLUMN IF NOT EXISTS amoblado BOOLEAN;
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE staging.stg_listings_unificado
        DROP COLUMN IF EXISTS amoblado;
    """)
