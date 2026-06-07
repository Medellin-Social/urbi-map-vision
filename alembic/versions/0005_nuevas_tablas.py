"""feat: tablas agentes, listings_propios, tiendas, eventos, agente_reviews, posts_barrio + alter favoritos

Revision ID: 0005
Revises: 0004
Create Date: 2026-06-04
"""
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.ciudades (
            id SERIAL PRIMARY KEY,
            nombre VARCHAR NOT NULL,
            pais VARCHAR DEFAULT 'Colombia',
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)
    op.execute("INSERT INTO public.ciudades (id, nombre) VALUES (1, 'Medellín') ON CONFLICT DO NOTHING")

    op.execute("""
        CREATE TABLE IF NOT EXISTS public.agentes (
            id SERIAL PRIMARY KEY,
            usuario_id INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL,
            nombre VARCHAR NOT NULL,
            apellido VARCHAR,
            foto_url VARCHAR,
            telefono VARCHAR,
            whatsapp VARCHAR,
            email VARCHAR,
            agencia VARCHAR,
            licencia VARCHAR,
            bio TEXT,
            ciudad_id INTEGER REFERENCES public.ciudades(id) DEFAULT 1,
            barrios_especializados INTEGER[],
            idiomas VARCHAR[] DEFAULT ARRAY['es'],
            activo BOOLEAN DEFAULT TRUE,
            verificado BOOLEAN DEFAULT FALSE,
            plan VARCHAR DEFAULT 'basico' CHECK (plan IN ('basico','pro','enterprise')),
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS agentes_usuario_id_idx ON public.agentes(usuario_id)")
    op.execute("CREATE INDEX IF NOT EXISTS agentes_ciudad_id_idx ON public.agentes(ciudad_id)")
    op.execute("CREATE INDEX IF NOT EXISTS agentes_verificado_idx ON public.agentes(verificado)")
    op.execute("CREATE INDEX IF NOT EXISTS agentes_activo_idx ON public.agentes(activo)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS public.listings_propios (
            id SERIAL PRIMARY KEY,
            agente_id INTEGER REFERENCES public.agentes(id) ON DELETE CASCADE,
            ciudad_id INTEGER REFERENCES public.ciudades(id) DEFAULT 1,
            barrio_id INTEGER REFERENCES raw.barrios(id),
            tipo_operacion VARCHAR NOT NULL CHECK (tipo_operacion IN ('venta','arriendo')),
            tipo_inmueble VARCHAR NOT NULL,
            precio_cop DECIMAL,
            precio_usd DECIMAL,
            area_m2 DOUBLE PRECISION,
            habitaciones INTEGER,
            banos NUMERIC,
            descripcion TEXT,
            amenidades TEXT[],
            fotos TEXT[],
            lat DOUBLE PRECISION,
            lon DOUBLE PRECISION,
            direccion VARCHAR,
            estrato INTEGER,
            amoblado BOOLEAN,
            parqueaderos INTEGER,
            piso INTEGER,
            ano_construccion INTEGER,
            estado VARCHAR DEFAULT 'activo' CHECK (estado IN ('activo','vendido','arrendado','pausado')),
            destacado BOOLEAN DEFAULT FALSE,
            vistas INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS listings_propios_agente_id_idx ON public.listings_propios(agente_id)")
    op.execute("CREATE INDEX IF NOT EXISTS listings_propios_barrio_id_idx ON public.listings_propios(barrio_id)")
    op.execute("CREATE INDEX IF NOT EXISTS listings_propios_ciudad_id_idx ON public.listings_propios(ciudad_id)")
    op.execute("CREATE INDEX IF NOT EXISTS listings_propios_estado_idx ON public.listings_propios(estado)")
    op.execute("CREATE INDEX IF NOT EXISTS listings_propios_tipo_operacion_idx ON public.listings_propios(tipo_operacion)")
    op.execute("CREATE INDEX IF NOT EXISTS listings_propios_tipo_inmueble_idx ON public.listings_propios(tipo_inmueble)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS public.tiendas (
            id SERIAL PRIMARY KEY,
            nombre VARCHAR NOT NULL,
            descripcion TEXT,
            categoria VARCHAR,
            subcategoria VARCHAR,
            barrio_id INTEGER REFERENCES raw.barrios(id),
            ciudad_id INTEGER REFERENCES public.ciudades(id) DEFAULT 1,
            direccion VARCHAR,
            telefono VARCHAR,
            whatsapp VARCHAR,
            instagram VARCHAR,
            website VARCHAR,
            google_place_id VARCHAR UNIQUE,
            foto_url VARCHAR,
            fotos TEXT[],
            lat DOUBLE PRECISION,
            lon DOUBLE PRECISION,
            horario JSONB,
            precio_rango VARCHAR CHECK (precio_rango IN ('$','$$','$$$','$$$$')),
            rating_google FLOAT,
            activo BOOLEAN DEFAULT TRUE,
            verificado BOOLEAN DEFAULT FALSE,
            destacado BOOLEAN DEFAULT FALSE,
            subido_por INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS tiendas_barrio_id_idx ON public.tiendas(barrio_id)")
    op.execute("CREATE INDEX IF NOT EXISTS tiendas_ciudad_id_idx ON public.tiendas(ciudad_id)")
    op.execute("CREATE INDEX IF NOT EXISTS tiendas_categoria_idx ON public.tiendas(categoria)")
    op.execute("CREATE INDEX IF NOT EXISTS tiendas_google_place_id_idx ON public.tiendas(google_place_id)")
    op.execute("CREATE INDEX IF NOT EXISTS tiendas_activo_idx ON public.tiendas(activo)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS public.eventos (
            id SERIAL PRIMARY KEY,
            titulo VARCHAR NOT NULL,
            descripcion TEXT,
            categoria VARCHAR,
            barrio_id INTEGER REFERENCES raw.barrios(id),
            ciudad_id INTEGER REFERENCES public.ciudades(id) DEFAULT 1,
            fecha_inicio TIMESTAMP NOT NULL,
            fecha_fin TIMESTAMP,
            precio DECIMAL DEFAULT 0,
            gratuito BOOLEAN DEFAULT TRUE,
            url_externo VARCHAR,
            fuente VARCHAR DEFAULT 'interno' CHECK (fuente IN ('interno','meetup','eventbrite','facebook')),
            fuente_id VARCHAR,
            foto_url VARCHAR,
            lat DOUBLE PRECISION,
            lon DOUBLE PRECISION,
            organizador VARCHAR,
            max_asistentes INTEGER,
            activo BOOLEAN DEFAULT TRUE,
            destacado BOOLEAN DEFAULT FALSE,
            subido_por INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS eventos_barrio_id_idx ON public.eventos(barrio_id)")
    op.execute("CREATE INDEX IF NOT EXISTS eventos_ciudad_id_idx ON public.eventos(ciudad_id)")
    op.execute("CREATE INDEX IF NOT EXISTS eventos_fecha_inicio_idx ON public.eventos(fecha_inicio)")
    op.execute("CREATE INDEX IF NOT EXISTS eventos_fuente_idx ON public.eventos(fuente)")
    op.execute("CREATE INDEX IF NOT EXISTS eventos_activo_idx ON public.eventos(activo)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS public.agente_reviews (
            id SERIAL PRIMARY KEY,
            agente_id INTEGER REFERENCES public.agentes(id) ON DELETE CASCADE,
            usuario_id INTEGER REFERENCES public.usuarios(id) ON DELETE CASCADE,
            rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
            comentario TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(agente_id, usuario_id)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS agente_reviews_agente_id_idx ON public.agente_reviews(agente_id)")
    op.execute("CREATE INDEX IF NOT EXISTS agente_reviews_usuario_id_idx ON public.agente_reviews(usuario_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS public.posts_barrio (
            id SERIAL PRIMARY KEY,
            barrio_id INTEGER REFERENCES raw.barrios(id) ON DELETE CASCADE,
            usuario_id INTEGER REFERENCES public.usuarios(id) ON DELETE CASCADE,
            tipo VARCHAR DEFAULT 'post' CHECK (tipo IN ('post','review','pregunta','recomendacion')),
            contenido TEXT NOT NULL,
            fotos TEXT[],
            likes INTEGER DEFAULT 0,
            activo BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS posts_barrio_barrio_id_idx ON public.posts_barrio(barrio_id)")
    op.execute("CREATE INDEX IF NOT EXISTS posts_barrio_usuario_id_idx ON public.posts_barrio(usuario_id)")
    op.execute("CREATE INDEX IF NOT EXISTS posts_barrio_tipo_idx ON public.posts_barrio(tipo)")

    op.execute("ALTER TABLE public.favoritos ADD COLUMN IF NOT EXISTS listing_uid VARCHAR")
    op.execute("""
        ALTER TABLE public.favoritos
        ADD COLUMN IF NOT EXISTS tipo VARCHAR DEFAULT 'barrio'
        CHECK (tipo IN ('barrio','listing'))
    """)
    op.execute("ALTER TABLE public.favoritos ALTER COLUMN barrio_id DROP NOT NULL")


def downgrade() -> None:
    op.execute("ALTER TABLE public.favoritos ALTER COLUMN barrio_id SET NOT NULL")
    op.execute("ALTER TABLE public.favoritos DROP COLUMN IF EXISTS tipo")
    op.execute("ALTER TABLE public.favoritos DROP COLUMN IF EXISTS listing_uid")
    op.drop_table("posts_barrio", schema="public")
    op.drop_table("agente_reviews", schema="public")
    op.drop_table("eventos", schema="public")
    op.drop_table("tiendas", schema="public")
    op.drop_table("listings_propios", schema="public")
    op.drop_table("agentes", schema="public")
    op.drop_table("ciudades", schema="public")
