"""perf: materialized cache tables for listings — barrios_medianas, barrios_contexto, listings_georef, barrios_cd

Replaces per-request CTEs (PERCENTILE_CONT, 6-table analytics JOIN) and 3-way lat/lon LEFT JOINs
with pre-computed tables refreshed hourly by the API at startup.

Revision ID: 0004
Revises: 0003
Create Date: 2026-06-01
"""
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS analytics")

    # These indexes are on the old staging.stg_listings table (renamed to stg_listings_unificado).
    # Skip silently if the table doesn't exist to avoid failing the migration.
    op.execute("""
        DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.tables
                     WHERE table_schema='staging' AND table_name='stg_listings') THEN
            CREATE INDEX IF NOT EXISTS idx_stg_listings_barrio_tipo
            ON staging.stg_listings (barrio_id, tipo_inmueble)
            WHERE activo = TRUE AND precio > 0;

            CREATE INDEX IF NOT EXISTS idx_stg_listings_url
            ON staging.stg_listings (url)
            WHERE activo = TRUE;
          END IF;
        END $$;
    """)

    # barrios_medianas — replaces med CTE (PERCENTILE_CONT per-barrio per request)
    op.execute("""
        CREATE TABLE IF NOT EXISTS analytics.barrios_medianas (
            barrio_id     integer NOT NULL,
            tipo_inmueble text,
            m2_mediana    bigint,
            arr_mediana   bigint,
            refreshed_at  timestamptz DEFAULT now()
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_barrios_medianas_lookup
        ON analytics.barrios_medianas (barrio_id, tipo_inmueble)
    """)

    # barrios_contexto — replaces bctx CTE (6 analytics table JOINs per request)
    op.execute("""
        CREATE TABLE IF NOT EXISTS analytics.barrios_contexto (
            barrio_id         integer PRIMARY KEY,
            yield_bruto_pct   numeric,
            n_listings_airbnb integer,
            score_corto       numeric,
            score_mediano     numeric,
            score_largo       numeric,
            liquidez_score    numeric,
            indice_nomada     numeric,
            seguridad_score   numeric,
            var_anual_pct     numeric,
            pct_wifi          numeric,
            refreshed_at      timestamptz DEFAULT now()
        )
    """)

    # listings_georef — replaces 3-way lat/lon LEFT JOIN + COALESCE IS NOT NULL filter
    op.execute("""
        CREATE TABLE IF NOT EXISTS analytics.listings_georef (
            url          text PRIMARY KEY,
            lat          float8 NOT NULL,
            lon          float8 NOT NULL,
            url_activa   boolean,
            estrato_real integer,
            refreshed_at timestamptz DEFAULT now()
        )
    """)

    # barrios_cd — replaces barrio_cd CTE (static catastro JOIN, never changes)
    op.execute("""
        CREATE TABLE IF NOT EXISTS analytics.barrios_cd (
            barrio_id integer PRIMARY KEY,
            cd_comuna integer,
            refreshed_at timestamptz DEFAULT now()
        )
    """)

    # Populate barrios_cd — skipped on fresh DB where catastro_medellin hasn't been loaded yet
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'raw' AND table_name = 'catastro_medellin'
            ) THEN
                INSERT INTO analytics.barrios_cd (barrio_id, cd_comuna)
                SELECT DISTINCT ON (b2.id) b2.id AS barrio_id, c.cd_comuna
                FROM raw.barrios b2
                JOIN raw.catastro_medellin c ON UPPER(c.ds_comuna) = UPPER(b2.comuna)
                ORDER BY b2.id
                ON CONFLICT (barrio_id) DO NOTHING;
            END IF;
        END $$;
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS analytics.barrios_cd")
    op.execute("DROP TABLE IF EXISTS analytics.listings_georef")
    op.execute("DROP TABLE IF EXISTS analytics.barrios_contexto")
    op.execute("DROP TABLE IF EXISTS analytics.barrios_medianas")
    op.execute("DROP INDEX IF EXISTS idx_stg_listings_url")
    op.execute("DROP INDEX IF EXISTS idx_stg_listings_barrio_tipo")
