"""Add comparaciones_historial and simulaciones_historial tables

Revision ID: 0027
Revises: 0026
Create Date: 2026-06-14
"""
from alembic import op

revision = "0027"
down_revision = "0026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.comparaciones_historial (
            id              SERIAL PRIMARY KEY,
            usuario_id      INTEGER NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
            tipo            TEXT    NOT NULL CHECK (tipo IN ('barrios', 'listings')),
            items           JSONB   NOT NULL DEFAULT '[]',
            filtro_inversion TEXT,
            nombre          TEXT,
            fecha_creacion  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_comparaciones_historial_usuario
            ON public.comparaciones_historial(usuario_id);

        CREATE TABLE IF NOT EXISTS public.simulaciones_historial (
            id              SERIAL PRIMARY KEY,
            usuario_id      INTEGER NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
            listing_id      INTEGER,
            barrio_id       INTEGER,
            presupuesto     NUMERIC,
            tipo_inversion  TEXT,
            horizonte_anos  INTEGER,
            con_credito     BOOLEAN,
            params          JSONB,
            resultados      JSONB,
            fecha_creacion  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_simulaciones_historial_usuario
            ON public.simulaciones_historial(usuario_id);
    """)


def downgrade() -> None:
    op.execute("""
        DROP TABLE IF EXISTS public.simulaciones_historial;
        DROP TABLE IF EXISTS public.comparaciones_historial;
    """)
