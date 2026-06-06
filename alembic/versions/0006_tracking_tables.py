"""feat: user tracking tables — user_events (partitioned), user_sessions, user_interests, partition function

Revision ID: 0006
Revises: 0005
Create Date: 2026-06-04
"""
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.user_events (
            id BIGSERIAL,
            usuario_id INTEGER REFERENCES public.usuarios(id) ON DELETE CASCADE,
            session_id VARCHAR NOT NULL,
            event_type VARCHAR NOT NULL,
            entity_type VARCHAR,
            entity_id VARCHAR,
            barrio_id INTEGER REFERENCES raw.barrios(id),
            ciudad_id INTEGER REFERENCES public.ciudades(id) DEFAULT 1,
            duration_ms INTEGER,
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT NOW()
        ) PARTITION BY RANGE (created_at)
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.user_events_2026_06
        PARTITION OF public.user_events
        FOR VALUES FROM ('2026-06-01') TO ('2026-07-01')
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.user_events_2026_07
        PARTITION OF public.user_events
        FOR VALUES FROM ('2026-07-01') TO ('2026-08-01')
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.user_events_2026_08
        PARTITION OF public.user_events
        FOR VALUES FROM ('2026-08-01') TO ('2026-09-01')
    """)
    op.execute("CREATE INDEX IF NOT EXISTS user_events_usuario_created_idx ON public.user_events(usuario_id, created_at)")
    op.execute("CREATE INDEX IF NOT EXISTS user_events_type_created_idx ON public.user_events(event_type, created_at)")
    op.execute("CREATE INDEX IF NOT EXISTS user_events_session_id_idx ON public.user_events(session_id)")
    op.execute("CREATE INDEX IF NOT EXISTS user_events_barrio_id_idx ON public.user_events(barrio_id)")
    op.execute("CREATE INDEX IF NOT EXISTS user_events_entity_idx ON public.user_events(entity_type, entity_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS public.user_sessions (
            id SERIAL PRIMARY KEY,
            session_id VARCHAR UNIQUE NOT NULL,
            usuario_id INTEGER REFERENCES public.usuarios(id) ON DELETE CASCADE,
            ciudad_id INTEGER REFERENCES public.ciudades(id) DEFAULT 1,
            device_type VARCHAR,
            browser VARCHAR,
            os VARCHAR,
            ip_hash VARCHAR,
            referrer VARCHAR,
            utm_source VARCHAR,
            utm_medium VARCHAR,
            utm_campaign VARCHAR,
            started_at TIMESTAMP DEFAULT NOW(),
            ended_at TIMESTAMP,
            duration_segundos INTEGER,
            total_eventos INTEGER DEFAULT 0,
            paginas_vistas INTEGER DEFAULT 0
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS user_sessions_usuario_id_idx ON public.user_sessions(usuario_id)")
    op.execute("CREATE INDEX IF NOT EXISTS user_sessions_started_at_idx ON public.user_sessions(started_at)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS public.user_interests (
            id SERIAL PRIMARY KEY,
            usuario_id INTEGER REFERENCES public.usuarios(id) ON DELETE CASCADE,
            top_barrios INTEGER[],
            inversion_preferida VARCHAR,
            precio_min_avg DECIMAL,
            precio_max_avg DECIMAL,
            tipo_inmueble_top VARCHAR,
            categorias_eventos_top TEXT[],
            categorias_tiendas_top TEXT[],
            total_sesiones INTEGER DEFAULT 0,
            total_eventos INTEGER DEFAULT 0,
            avg_session_duration_seg INTEGER,
            dias_activo INTEGER DEFAULT 0,
            ultimo_activo TIMESTAMP,
            engagement_score INTEGER DEFAULT 0,
            inversion_intent_score INTEGER DEFAULT 0,
            updated_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(usuario_id)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS user_interests_usuario_id_idx ON public.user_interests(usuario_id)")
    op.execute("CREATE INDEX IF NOT EXISTS user_interests_engagement_idx ON public.user_interests(engagement_score DESC)")
    op.execute("CREATE INDEX IF NOT EXISTS user_interests_inversion_intent_idx ON public.user_interests(inversion_intent_score DESC)")

    op.execute("""
        CREATE OR REPLACE FUNCTION create_user_events_partition()
        RETURNS void AS $$
        DECLARE
            partition_date DATE;
            partition_name TEXT;
            start_date TEXT;
            end_date TEXT;
        BEGIN
            partition_date := DATE_TRUNC('month', NOW()) + INTERVAL '1 month';
            partition_name := 'user_events_' || TO_CHAR(partition_date, 'YYYY_MM');
            start_date := TO_CHAR(partition_date, 'YYYY-MM-01');
            end_date := TO_CHAR(partition_date + INTERVAL '1 month', 'YYYY-MM-01');

            IF NOT EXISTS (
                SELECT 1 FROM pg_tables WHERE tablename = partition_name
            ) THEN
                EXECUTE format(
                    'CREATE TABLE public.%I PARTITION OF public.user_events FOR VALUES FROM (%L) TO (%L)',
                    partition_name, start_date, end_date
                );
                RAISE NOTICE 'Partición creada: %', partition_name;
            END IF;
        END;
        $$ LANGUAGE plpgsql
    """)


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS create_user_events_partition()")
    op.drop_table("user_interests", schema="public")
    op.drop_table("user_sessions", schema="public")
    op.execute("DROP TABLE IF EXISTS public.user_events_2026_08")
    op.execute("DROP TABLE IF EXISTS public.user_events_2026_07")
    op.execute("DROP TABLE IF EXISTS public.user_events_2026_06")
    op.execute("DROP TABLE IF EXISTS public.user_events")
