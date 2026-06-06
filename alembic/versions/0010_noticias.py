"""feat: noticias — tabla para ticker RSS cultural

Revision ID: 0010
Revises: 0009
Create Date: 2026-06-06
"""
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.noticias (
            id                  SERIAL PRIMARY KEY,
            fuente              VARCHAR NOT NULL DEFAULT 'el_colombiano',
            titulo              VARCHAR NOT NULL,
            url                 VARCHAR UNIQUE NOT NULL,
            fecha_publicacion   TIMESTAMP,
            activa              BOOLEAN DEFAULT TRUE,
            created_at          TIMESTAMP DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_noticias_fuente ON public.noticias(fuente)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_noticias_fecha ON public.noticias(fecha_publicacion DESC)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_noticias_activa ON public.noticias(activa)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS public.noticias")
