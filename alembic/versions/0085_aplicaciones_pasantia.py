"""feat: aplicaciones_pasantia (EAFIT internship applications)

Revision ID: 0085
Revises: 0084
Create Date: 2026-09-08
"""
from alembic import op

revision = "0085"
down_revision = "0083"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.aplicaciones_pasantia (
            id                  SERIAL PRIMARY KEY,
            nombre              VARCHAR NOT NULL,
            email               VARCHAR NOT NULL,
            telefono            VARCHAR,
            programa_semestre   VARCHAR NOT NULL,
            ruta_interes        VARCHAR NOT NULL
                CHECK (ruta_interes IN ('media', 'growth', 'bizdev')),
            mensaje             TEXT,
            estado              VARCHAR DEFAULT 'nuevo'
                CHECK (estado IN ('nuevo','revisando','aprobado','rechazado')),
            ciudad_id           INTEGER REFERENCES public.ciudades(id) DEFAULT 1,
            created_at          TIMESTAMP DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_aplic_pasantia_estado ON public.aplicaciones_pasantia(estado, created_at DESC)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS public.aplicaciones_pasantia")
