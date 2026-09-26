"""feat: listing.nombre_edificio — nombre de edificio/condominio/unidad cerrada

Revision ID: 0097
Revises: 0096
Create Date: 2026-09-25
"""
from alembic import op

revision = "0097"
down_revision = "0096"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE public.listing ADD COLUMN IF NOT EXISTS nombre_edificio TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE public.listing DROP COLUMN IF EXISTS nombre_edificio")
