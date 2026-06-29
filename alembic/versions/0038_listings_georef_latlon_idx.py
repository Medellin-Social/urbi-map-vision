"""listings_georef lat/lon index for viewport bbox queries

Revision ID: 0038
Revises: 0037
Create Date: 2026-06-29

Composite btree on (lat, lon) so the viewport bbox filter
(g.lat BETWEEN ... AND g.lon BETWEEN ...) is index-backed instead of a seq scan.
TRUNCATE in cache.py preserves the index, so it survives hourly refreshes.
"""
from alembic import op

revision = "0038"
down_revision = "0037"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_listings_georef_latlon "
        "ON analytics.listings_georef (lat, lon)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS analytics.idx_listings_georef_latlon")
