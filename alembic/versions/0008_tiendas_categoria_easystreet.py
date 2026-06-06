"""feat: tiendas — EasyStreet category CHECK constraint

Revision ID: 0008
Revises: 0007
Create Date: 2026-06-04
"""
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None

_CATEGORIAS = ("happy_hour", "date_night", "live_music", "brunch", "craft_beer", "coworking", "wellness", "nightlife")


def upgrade() -> None:
    # Clear test data scraped with old category names
    op.execute("TRUNCATE TABLE public.tiendas RESTART IDENTITY")

    op.execute("ALTER TABLE public.tiendas DROP CONSTRAINT IF EXISTS tiendas_categoria_check")
    op.execute(f"""
        ALTER TABLE public.tiendas
        ADD CONSTRAINT tiendas_categoria_check
        CHECK (categoria IN {_CATEGORIAS})
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE public.tiendas DROP CONSTRAINT IF EXISTS tiendas_categoria_check")
