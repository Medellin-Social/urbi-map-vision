"""feat: aplicaciones_embajador y aplicaciones_afiliado

Revision ID: 0013
Revises: 0012
Create Date: 2026-06-06
"""
from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.aplicaciones_embajador (
            id          SERIAL PRIMARY KEY,
            nombre      VARCHAR NOT NULL,
            email       VARCHAR NOT NULL,
            telefono    VARCHAR,
            barrio_id   INTEGER REFERENCES raw.barrios(id),
            experiencia TEXT,
            motivacion  TEXT,
            estado      VARCHAR DEFAULT 'nuevo'
                CHECK (estado IN ('nuevo','revisando','aprobado','rechazado')),
            ciudad_id   INTEGER REFERENCES public.ciudades(id) DEFAULT 1,
            created_at  TIMESTAMP DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_aplic_emb_estado ON public.aplicaciones_embajador(estado, created_at DESC)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS public.aplicaciones_afiliado (
            id          SERIAL PRIMARY KEY,
            nombre      VARCHAR NOT NULL,
            email       VARCHAR NOT NULL,
            telefono    VARCHAR,
            canal       VARCHAR,
            estado      VARCHAR DEFAULT 'nuevo'
                CHECK (estado IN ('nuevo','revisando','aprobado','rechazado')),
            ciudad_id   INTEGER REFERENCES public.ciudades(id) DEFAULT 1,
            created_at  TIMESTAMP DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_aplic_afil_estado ON public.aplicaciones_afiliado(estado, created_at DESC)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS public.aplicaciones_afiliado")
    op.execute("DROP TABLE IF EXISTS public.aplicaciones_embajador")
