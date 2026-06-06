"""feat: eventos — add luma to fuente CHECK, tipo_audiencia col, UNIQUE(fuente,fuente_id)

Revision ID: 0007
Revises: 0006
Create Date: 2026-06-04
"""
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE public.eventos
        DROP CONSTRAINT IF EXISTS eventos_fuente_check
    """)
    op.execute("""
        ALTER TABLE public.eventos
        ADD CONSTRAINT eventos_fuente_check
        CHECK (fuente IN ('interno','meetup','eventbrite','facebook','luma'))
    """)
    op.execute("""
        ALTER TABLE public.eventos
        ADD COLUMN IF NOT EXISTS tipo_audiencia VARCHAR
    """)
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS eventos_fuente_fuente_id_uidx
        ON public.eventos (fuente, fuente_id)
        WHERE fuente_id IS NOT NULL
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS eventos_tipo_audiencia_idx
        ON public.eventos (tipo_audiencia)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS eventos_destacado_fecha_idx
        ON public.eventos (destacado DESC, fecha_inicio ASC)
        WHERE activo = TRUE
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS eventos_destacado_fecha_idx")
    op.execute("DROP INDEX IF EXISTS eventos_tipo_audiencia_idx")
    op.execute("DROP INDEX IF EXISTS eventos_fuente_fuente_id_uidx")
    op.execute("ALTER TABLE public.eventos DROP COLUMN IF EXISTS tipo_audiencia")
    op.execute("ALTER TABLE public.eventos DROP CONSTRAINT IF EXISTS eventos_fuente_check")
    op.execute("""
        ALTER TABLE public.eventos
        ADD CONSTRAINT eventos_fuente_check
        CHECK (fuente IN ('interno','meetup','eventbrite','facebook'))
    """)
