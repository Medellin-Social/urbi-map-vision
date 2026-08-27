"""listing.barrio_id — replaces fragile free-text municipio/barrio matching

public.listing only had free-text municipio/barrio (no FK to raw.barrios),
same fragile-matching problem already hit in the frontend (accents, "B."
prefixes, etc.) — flagged when preparing the GHL field-schema doc: GHL needs
to group/filter listings by zone and can't do that reliably against raw text.

Backfill via spatial join (ST_Contains against raw.barrios.geometry, same
SRID 4326 as listing.geom) instead of text matching — listing.geom is
already the real point geometry, no guessing needed.

Revision ID: 0081
Revises: 0080
"""
from alembic import op

revision = "0081"
down_revision = "0080"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE public.listing ADD COLUMN IF NOT EXISTS barrio_id "
        "integer REFERENCES raw.barrios(id)"
    )
    op.execute(
        """
        UPDATE public.listing l
        SET barrio_id = b.id
        FROM raw.barrios b
        WHERE l.geom IS NOT NULL
          AND l.barrio_id IS NULL
          AND ST_Contains(b.geometry, l.geom)
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_listing_barrio_id ON public.listing (barrio_id)"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE public.listing DROP COLUMN IF EXISTS barrio_id")
