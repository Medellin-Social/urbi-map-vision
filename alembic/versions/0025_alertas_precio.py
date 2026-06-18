"""Create alertas_precio table

Revision ID: 0025
Revises: 0024
Create Date: 2026-06-12
"""
from alembic import op

revision = "0025"
down_revision = "0024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.alertas_precio (
            id              SERIAL PRIMARY KEY,
            usuario_id      INT NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
            barrio_id       INT NOT NULL REFERENCES raw.barrios(id) ON DELETE CASCADE,
            tipo_operacion  TEXT NOT NULL CHECK (tipo_operacion IN ('venta', 'arriendo')),
            precio_max      NUMERIC,
            tipo_inmueble   TEXT,
            activa          BOOLEAN NOT NULL DEFAULT true,
            fecha_creacion  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_alertas_precio_usuario ON public.alertas_precio(usuario_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_alertas_precio_barrio ON public.alertas_precio(barrio_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS public.alertas_precio")
