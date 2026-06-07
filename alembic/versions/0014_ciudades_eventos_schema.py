"""feat: ciudades extra columns + eventos.moneda

Revision ID: 0014
Revises: 0013
Create Date: 2026-06-07
"""
from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ciudades: add slug, activa, lat, lon
    op.execute("ALTER TABLE public.ciudades ADD COLUMN IF NOT EXISTS slug VARCHAR")
    op.execute("ALTER TABLE public.ciudades ADD COLUMN IF NOT EXISTS activa BOOLEAN DEFAULT TRUE")
    op.execute("ALTER TABLE public.ciudades ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION")
    op.execute("ALTER TABLE public.ciudades ADD COLUMN IF NOT EXISTS lon DOUBLE PRECISION")

    # Backfill slug for existing row (id=1 Medellín inserted in 0005)
    op.execute("UPDATE public.ciudades SET slug = 'medellin' WHERE id = 1 AND slug IS NULL")

    # Add unique constraint on slug (nullable-safe)
    op.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'ciudades_slug_key'
            ) THEN
                ALTER TABLE public.ciudades
                ADD CONSTRAINT ciudades_slug_key UNIQUE (slug);
            END IF;
        END $$
    """)

    # eventos: add moneda column
    op.execute("""
        ALTER TABLE public.eventos
        ADD COLUMN IF NOT EXISTS moneda VARCHAR(10) DEFAULT 'COP'
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE public.eventos DROP COLUMN IF EXISTS moneda")
    op.execute("ALTER TABLE public.ciudades DROP CONSTRAINT IF EXISTS ciudades_slug_key")
    op.execute("ALTER TABLE public.ciudades DROP COLUMN IF EXISTS lon")
    op.execute("ALTER TABLE public.ciudades DROP COLUMN IF EXISTS lat")
    op.execute("ALTER TABLE public.ciudades DROP COLUMN IF EXISTS activa")
    op.execute("ALTER TABLE public.ciudades DROP COLUMN IF EXISTS slug")
