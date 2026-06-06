"""feat: deals — tabla para hotspots y ofertas exclusivas

Revision ID: 0011
Revises: 0010
Create Date: 2026-06-06
"""
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.deals (
            id           SERIAL PRIMARY KEY,
            tienda_id    INTEGER REFERENCES public.tiendas(id) ON DELETE CASCADE,
            tipo_deal    VARCHAR NOT NULL,
            descripcion  VARCHAR NOT NULL,
            categoria    VARCHAR,
            barrio_id    INTEGER REFERENCES raw.barrios(id),
            ciudad_id    INTEGER REFERENCES public.ciudades(id) DEFAULT 1,
            fecha_inicio DATE DEFAULT CURRENT_DATE,
            fecha_fin    DATE,
            activo       BOOLEAN DEFAULT TRUE,
            destacado    BOOLEAN DEFAULT TRUE,
            created_at   TIMESTAMP DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_deals_activo    ON public.deals(activo)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_deals_destacado ON public.deals(destacado)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_deals_ciudad    ON public.deals(ciudad_id)")

    # Sample deals — one per category, highest-rated tienda
    op.execute("""
        INSERT INTO public.deals (tienda_id, tipo_deal, descripcion, categoria, ciudad_id, activo, destacado)
        SELECT id, '-30%', 'Happy Hour, toda la tarde', 'bares', 1, TRUE, TRUE
        FROM public.tiendas WHERE categoria = 'bares' AND rating_google >= 4.5 AND activo = TRUE
        ORDER BY rating_google DESC LIMIT 1
    """)
    op.execute("""
        INSERT INTO public.deals (tienda_id, tipo_deal, descripcion, categoria, ciudad_id, activo, destacado)
        SELECT id, '2x1', 'Cocteles Date Night', 'bares', 1, TRUE, TRUE
        FROM public.tiendas WHERE categoria = 'bares' AND rating_google >= 4.5 AND activo = TRUE
        ORDER BY rating_google DESC, id DESC LIMIT 1
    """)
    op.execute("""
        INSERT INTO public.deals (tienda_id, tipo_deal, descripcion, categoria, ciudad_id, activo, destacado)
        SELECT id, '-50%', 'Wellness entre semana', 'masajes_spa', 1, TRUE, TRUE
        FROM public.tiendas WHERE categoria = 'masajes_spa' AND rating_google >= 4.5 AND activo = TRUE
        ORDER BY rating_google DESC LIMIT 1
    """)
    op.execute("""
        INSERT INTO public.deals (tienda_id, tipo_deal, descripcion, categoria, ciudad_id, activo, destacado)
        SELECT id, 'Free', 'Postre de cortesía', 'brunch', 1, TRUE, TRUE
        FROM public.tiendas WHERE categoria = 'brunch' AND rating_google >= 4.5 AND activo = TRUE
        ORDER BY rating_google DESC LIMIT 1
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS public.deals")
