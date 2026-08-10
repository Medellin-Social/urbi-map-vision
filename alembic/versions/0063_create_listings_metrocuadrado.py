"""create raw.listings_metrocuadrado if not exists

The viewport query JOINs this table unconditionally. Prod never received it
from scraping so the relation is missing → 500 on every map load.
This migration creates an empty stub so JOINs resolve (returning NULL) and
EXISTS checks short-circuit to FALSE, which is correct behaviour when there is
no metrocuadrado data.

Revision ID: 0063
Revises: 0062
"""
from alembic import op

revision = "0063"
down_revision = "0062"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS raw.listings_metrocuadrado (
            url                text PRIMARY KEY,
            fecha_primera_vez  timestamptz,
            raw_data           jsonb,
            amenidades         text[]
        );
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS raw.listings_metrocuadrado;")
