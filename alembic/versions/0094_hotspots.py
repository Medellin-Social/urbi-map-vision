"""feat: hotspots — lugares curados por experiencia (rooftop, salsa, cocteles), separado de deals

Revision ID: 0094
Revises: 0093
Create Date: 2026-09-23
"""
from alembic import op

revision = "0094"
down_revision = "0093"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.hotspots (
            id                    SERIAL PRIMARY KEY,
            tienda_id             INTEGER NOT NULL REFERENCES public.tiendas(id) ON DELETE CASCADE,
            categoria_experiencia VARCHAR NOT NULL,
            descripcion           VARCHAR NOT NULL,
            descripcion_larga     VARCHAR,
            foto_url              VARCHAR,
            barrio_id             INTEGER REFERENCES raw.barrios(id),
            ciudad_id             INTEGER REFERENCES public.ciudades(id) DEFAULT 1,
            fecha_inicio          DATE DEFAULT CURRENT_DATE,
            fecha_fin             DATE,
            activo                BOOLEAN DEFAULT TRUE,
            destacado             BOOLEAN DEFAULT TRUE,
            suscripcion_id        INTEGER NOT NULL,
            vistas                INTEGER DEFAULT 0,
            clicks                INTEGER DEFAULT 0,
            created_at            TIMESTAMP DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_hotspots_activo    ON public.hotspots(activo)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_hotspots_destacado ON public.hotspots(destacado)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_hotspots_ciudad    ON public.hotspots(ciudad_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS public.hotspots")
