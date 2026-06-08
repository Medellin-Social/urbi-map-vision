"""feat: raw.listing_vistas — track listing views (anonymous + authenticated)

Revision ID: 0017
Revises: 0016
Create Date: 2026-06-08
"""
from alembic import op

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS raw.listing_vistas (
            id          SERIAL PRIMARY KEY,
            listing_url VARCHAR NOT NULL,
            usuario_id  INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL,
            ip_hash     VARCHAR(64),
            created_at  TIMESTAMP DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS listing_vistas_url_idx     ON raw.listing_vistas(listing_url)")
    op.execute("CREATE INDEX IF NOT EXISTS listing_vistas_created_idx ON raw.listing_vistas(created_at)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS raw.listing_vistas")
