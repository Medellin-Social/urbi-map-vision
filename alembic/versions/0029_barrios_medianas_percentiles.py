"""Add price percentile columns to analytics.barrios_medianas

Revision ID: 0029
Revises: 0028
Create Date: 2026-06-18

Adds m2_p25, m2_p75, arr_p25, arr_p75 columns used by listings router
and cache.py INSERT for pro price-range feature.
"""
from alembic import op

revision = "0029"
down_revision = "0028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE analytics.barrios_medianas
            ADD COLUMN IF NOT EXISTS m2_p25   bigint,
            ADD COLUMN IF NOT EXISTS m2_p75   bigint,
            ADD COLUMN IF NOT EXISTS arr_p25  bigint,
            ADD COLUMN IF NOT EXISTS arr_p75  bigint
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE analytics.barrios_medianas
            DROP COLUMN IF EXISTS m2_p25,
            DROP COLUMN IF EXISTS m2_p75,
            DROP COLUMN IF EXISTS arr_p25,
            DROP COLUMN IF EXISTS arr_p75
    """)
