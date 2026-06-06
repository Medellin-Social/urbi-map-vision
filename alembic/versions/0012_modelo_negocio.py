"""feat: modelo negocio — planes, suscripciones, embajadores, afiliados, referidos

Revision ID: 0012
Revises: 0011
Create Date: 2026-06-06
"""
from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── planes_negocio ────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.planes_negocio (
            id          SERIAL PRIMARY KEY,
            nombre      VARCHAR NOT NULL,
            tipo        VARCHAR NOT NULL
                CHECK (tipo IN ('free','hotspot','featured')),
            precio_usd  DECIMAL,
            precio_cop  DECIMAL,
            descripcion TEXT,
            features    JSONB DEFAULT '[]',
            activo      BOOLEAN DEFAULT TRUE,
            created_at  TIMESTAMP DEFAULT NOW()
        )
    """)
    op.execute("""
        INSERT INTO public.planes_negocio (nombre, tipo, precio_usd, precio_cop, descripcion, features)
        VALUES
        (
            'Free', 'free', 0, 0,
            'Listing básico en el directorio',
            '["Aparece en el directorio","Rating de Google Places","Botones WhatsApp y Maps"]'::jsonb
        ),
        (
            'Hotspot / Special Offer', 'hotspot', 29, 120000,
            'Deal o promoción destacada por campaña',
            '["Aparece en Hotspots & Deals del home","Incluido en newsletter semanal","Publicado en redes sociales","Sin compromiso mensual"]'::jsonb
        ),
        (
            'Featured Business', 'featured', 99, 410000,
            'Exclusividad de categoría en tu barrio',
            '["Exclusividad de categoría por barrio","Badge Featured Contributor","Posición permanente en home","Perfil dedicado con bio y fotos","Artículo IA incluido","Newsletter + redes + blog"]'::jsonb
        )
        ON CONFLICT DO NOTHING
    """)

    # ── suscripciones_negocio ─────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.suscripciones_negocio (
            id                      SERIAL PRIMARY KEY,
            tienda_id               INTEGER REFERENCES public.tiendas(id) ON DELETE CASCADE,
            plan_id                 INTEGER REFERENCES public.planes_negocio(id),
            ciudad_id               INTEGER REFERENCES public.ciudades(id) DEFAULT 1,
            barrio_id               INTEGER REFERENCES raw.barrios(id),
            categoria_exclusiva     VARCHAR,
            estado                  VARCHAR DEFAULT 'activo'
                CHECK (estado IN ('activo','pausado','cancelado','pendiente_pago')),
            stripe_subscription_id  VARCHAR,
            stripe_customer_id      VARCHAR,
            precio_pagado_usd       DECIMAL,
            fecha_inicio            DATE DEFAULT CURRENT_DATE,
            fecha_fin               DATE,
            renovacion_automatica   BOOLEAN DEFAULT TRUE,
            created_at              TIMESTAMP DEFAULT NOW(),
            updated_at              TIMESTAMP DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_susc_negocio_tienda ON public.suscripciones_negocio(tienda_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_susc_negocio_estado ON public.suscripciones_negocio(estado)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_susc_negocio_barrio ON public.suscripciones_negocio(barrio_id)")
    # Exclusivity: one featured per barrio+categoria (NULL categoria_exclusiva for non-featured won't conflict)
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_susc_featured_barrio_cat
        ON public.suscripciones_negocio(barrio_id, categoria_exclusiva, plan_id)
        WHERE categoria_exclusiva IS NOT NULL
    """)

    # ── deals — add missing columns from original 0011 schema ─────────────────
    op.execute("ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS suscripcion_id INTEGER REFERENCES public.suscripciones_negocio(id)")
    op.execute("ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS descripcion_larga TEXT")
    op.execute("ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS foto_url VARCHAR")
    op.execute("ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS vistas INTEGER DEFAULT 0")
    op.execute("ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS clicks INTEGER DEFAULT 0")

    # ── embajadores ───────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.embajadores (
            id               SERIAL PRIMARY KEY,
            usuario_id       INTEGER REFERENCES public.usuarios(id) ON DELETE CASCADE,
            barrio_id        INTEGER REFERENCES raw.barrios(id),
            ciudad_id        INTEGER REFERENCES public.ciudades(id) DEFAULT 1,
            codigo           VARCHAR UNIQUE NOT NULL,
            bio              TEXT,
            foto_url         VARCHAR,
            instagram        VARCHAR,
            comision_pct     DECIMAL DEFAULT 10.0,
            total_referidos  INTEGER DEFAULT 0,
            total_ganado_usd DECIMAL DEFAULT 0,
            activo           BOOLEAN DEFAULT TRUE,
            verificado       BOOLEAN DEFAULT FALSE,
            created_at       TIMESTAMP DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_embajadores_usuario ON public.embajadores(usuario_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_embajadores_barrio  ON public.embajadores(barrio_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_embajadores_codigo  ON public.embajadores(codigo)")

    # ── afiliados ─────────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.afiliados (
            id               SERIAL PRIMARY KEY,
            usuario_id       INTEGER REFERENCES public.usuarios(id) ON DELETE CASCADE,
            ciudad_id        INTEGER REFERENCES public.ciudades(id) DEFAULT 1,
            codigo_referido  VARCHAR UNIQUE NOT NULL,
            comision_pct     DECIMAL DEFAULT 15.0,
            total_referidos  INTEGER DEFAULT 0,
            total_ganado_usd DECIMAL DEFAULT 0,
            activo           BOOLEAN DEFAULT TRUE,
            created_at       TIMESTAMP DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_afiliados_usuario ON public.afiliados(usuario_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_afiliados_codigo  ON public.afiliados(codigo_referido)")

    # ── referidos ─────────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.referidos (
            id              SERIAL PRIMARY KEY,
            afiliado_id     INTEGER REFERENCES public.afiliados(id),
            embajador_id    INTEGER REFERENCES public.embajadores(id),
            tienda_id       INTEGER REFERENCES public.tiendas(id),
            suscripcion_id  INTEGER REFERENCES public.suscripciones_negocio(id),
            comision_usd    DECIMAL,
            estado          VARCHAR DEFAULT 'pendiente'
                CHECK (estado IN ('pendiente','pagado','cancelado')),
            created_at      TIMESTAMP DEFAULT NOW()
        )
    """)

    # ── leads_negocio — business "aplicar" form submissions ───────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.leads_negocio (
            id              SERIAL PRIMARY KEY,
            nombre_negocio  VARCHAR NOT NULL,
            email           VARCHAR NOT NULL,
            telefono        VARCHAR,
            categoria       VARCHAR,
            barrio_id       INTEGER REFERENCES raw.barrios(id),
            plan_tipo       VARCHAR CHECK (plan_tipo IN ('free','hotspot','featured')),
            mensaje         TEXT,
            estado          VARCHAR DEFAULT 'nuevo'
                CHECK (estado IN ('nuevo','contactado','convertido','descartado')),
            ciudad_id       INTEGER REFERENCES public.ciudades(id) DEFAULT 1,
            created_at      TIMESTAMP DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_leads_negocio_estado ON public.leads_negocio(estado, created_at DESC)")

    # ── usuarios — newsletter columns ─────────────────────────────────────────
    op.execute("ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS newsletter_activo BOOLEAN DEFAULT FALSE")
    op.execute("ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS newsletter_barrio_id INTEGER REFERENCES raw.barrios(id)")
    op.execute("ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS newsletter_intereses TEXT[]")
    op.execute("ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS fecha_suscripcion TIMESTAMP")

    # ── tiendas — plan + featured columns ────────────────────────────────────
    op.execute("""
        ALTER TABLE public.tiendas
        ADD COLUMN IF NOT EXISTS plan VARCHAR DEFAULT 'free'
            CHECK (plan IN ('free','hotspot','featured')),
        ADD COLUMN IF NOT EXISTS featured_badge BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS featured_desde DATE
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE public.tiendas DROP COLUMN IF EXISTS featured_desde")
    op.execute("ALTER TABLE public.tiendas DROP COLUMN IF EXISTS featured_badge")
    op.execute("ALTER TABLE public.tiendas DROP COLUMN IF EXISTS plan")
    op.execute("ALTER TABLE public.usuarios DROP COLUMN IF EXISTS fecha_suscripcion")
    op.execute("ALTER TABLE public.usuarios DROP COLUMN IF EXISTS newsletter_intereses")
    op.execute("ALTER TABLE public.usuarios DROP COLUMN IF EXISTS newsletter_barrio_id")
    op.execute("ALTER TABLE public.usuarios DROP COLUMN IF EXISTS newsletter_activo")
    op.execute("DROP TABLE IF EXISTS public.leads_negocio")
    op.execute("DROP TABLE IF EXISTS public.referidos")
    op.execute("DROP TABLE IF EXISTS public.afiliados")
    op.execute("DROP TABLE IF EXISTS public.embajadores")
    op.execute("ALTER TABLE public.deals DROP COLUMN IF EXISTS clicks")
    op.execute("ALTER TABLE public.deals DROP COLUMN IF EXISTS vistas")
    op.execute("ALTER TABLE public.deals DROP COLUMN IF EXISTS foto_url")
    op.execute("ALTER TABLE public.deals DROP COLUMN IF EXISTS descripcion_larga")
    op.execute("ALTER TABLE public.deals DROP COLUMN IF EXISTS suscripcion_id")
    op.execute("DROP TABLE IF EXISTS public.suscripciones_negocio")
    op.execute("DROP TABLE IF EXISTS public.planes_negocio")
