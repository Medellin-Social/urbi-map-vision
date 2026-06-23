"""Add descripcion, fotos, amenidades to raw.listings_renta_media

Revision ID: 0037
Revises: 0036
Create Date: 2026-06-22

Enables Airbnb detail-page interception to store description, photos, and
amenities extracted from StaysPdpSections GraphQL responses.
"""
from alembic import op

revision = "0037"
down_revision = "0036"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE raw.listings_renta_media
            ADD COLUMN IF NOT EXISTS descripcion  TEXT,
            ADD COLUMN IF NOT EXISTS fotos        TEXT[],
            ADD COLUMN IF NOT EXISTS amenidades   TEXT[];
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE raw.listings_renta_media
            DROP COLUMN IF EXISTS descripcion,
            DROP COLUMN IF EXISTS fotos,
            DROP COLUMN IF EXISTS amenidades;
    """)
