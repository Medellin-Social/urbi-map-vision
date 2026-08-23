"""add missing amoblado column to raw.listings_premium

Missed in 0072's column diff — local has it, prod didn't. Blocks the
premium backfill's pg_restore (explicit column list COPY).

Revision ID: 0073
Revises: 0072
"""
from alembic import op

revision = "0073"
down_revision = "0072"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE raw.listings_premium ADD COLUMN IF NOT EXISTS amoblado boolean;")


def downgrade() -> None:
    op.execute("ALTER TABLE raw.listings_premium DROP COLUMN IF EXISTS amoblado;")
