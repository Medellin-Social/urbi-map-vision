"""add unique constraints to raw.listings_fincaraiz (url, dedup_hash)

Wiring load_medellin_fincaraiz.py / load_valle_aburra.py into the daily
prod cron (refresh_data.py) so scraped fincaraiz data actually persists
(previously it never did — see 0068's commit message). Both loaders use
`ON CONFLICT (url) DO UPDATE`, which requires a unique constraint on url;
local also has one on dedup_hash. Verified prod's current 60,490 rows have
no duplicate url or dedup_hash values before adding these.

Revision ID: 0074
Revises: 0073
"""
from alembic import op

revision = "0074"
down_revision = "0073"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE raw.listings_fincaraiz ADD CONSTRAINT listings_fc_url_unique UNIQUE (url);")
    op.execute("ALTER TABLE raw.listings_fincaraiz ADD CONSTRAINT listings_fc_dedup_unique UNIQUE (dedup_hash);")


def downgrade() -> None:
    op.execute("ALTER TABLE raw.listings_fincaraiz DROP CONSTRAINT IF EXISTS listings_fc_dedup_unique;")
    op.execute("ALTER TABLE raw.listings_fincaraiz DROP CONSTRAINT IF EXISTS listings_fc_url_unique;")
