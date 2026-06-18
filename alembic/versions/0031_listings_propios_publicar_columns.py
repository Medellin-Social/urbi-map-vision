"""Add publicar columns to public.listings_propios

Revision ID: 0031
Revises: 0030
Create Date: 2026-06-18

The publicar router uses user_id, administracion_cop, area_lote_m2, antiguedad,
nombre_contacto, telefono, email_contacto, horario_contacto, mascotas,
permite_airbnb, fuente, and fecha_publicacion — none were in the original 0005 schema.
"""
from alembic import op

revision = "0031"
down_revision = "0030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE public.listings_propios
            ADD COLUMN IF NOT EXISTS user_id          INT REFERENCES public.usuarios(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS administracion_cop BIGINT,
            ADD COLUMN IF NOT EXISTS area_lote_m2     DOUBLE PRECISION,
            ADD COLUMN IF NOT EXISTS antiguedad        INTEGER,
            ADD COLUMN IF NOT EXISTS nombre_contacto  TEXT,
            ADD COLUMN IF NOT EXISTS telefono         TEXT,
            ADD COLUMN IF NOT EXISTS email_contacto   TEXT,
            ADD COLUMN IF NOT EXISTS horario_contacto TEXT,
            ADD COLUMN IF NOT EXISTS mascotas         BOOLEAN DEFAULT false,
            ADD COLUMN IF NOT EXISTS permite_airbnb   BOOLEAN DEFAULT false,
            ADD COLUMN IF NOT EXISTS fuente           TEXT DEFAULT 'propio',
            ADD COLUMN IF NOT EXISTS fecha_publicacion TIMESTAMPTZ
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_listings_propios_user_id
        ON public.listings_propios (user_id)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_listings_propios_fuente
        ON public.listings_propios (fuente)
        WHERE estado = 'activo'
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE public.listings_propios
            DROP COLUMN IF EXISTS user_id,
            DROP COLUMN IF EXISTS administracion_cop,
            DROP COLUMN IF EXISTS area_lote_m2,
            DROP COLUMN IF EXISTS antiguedad,
            DROP COLUMN IF EXISTS nombre_contacto,
            DROP COLUMN IF EXISTS telefono,
            DROP COLUMN IF EXISTS email_contacto,
            DROP COLUMN IF EXISTS horario_contacto,
            DROP COLUMN IF EXISTS mascotas,
            DROP COLUMN IF EXISTS permite_airbnb,
            DROP COLUMN IF EXISTS fuente,
            DROP COLUMN IF EXISTS fecha_publicacion
    """)
