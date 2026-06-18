"""Recreate staging.stg_listings_unificado if missing (recovery migration)

Revision ID: 0028
Revises: 0027
Create Date: 2026-06-18

Migration 0021 created stg_listings_unificado, but if the staging schema was
dropped (e.g. DB restore, manual cleanup) alembic won't re-run 0021. This
migration recreates the empty table so cache.py can populate it on startup.
"""
from alembic import op

revision = "0028"
down_revision = "0027"
branch_labels = None
depends_on = None

_RECREATE = """
CREATE SCHEMA IF NOT EXISTS staging;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'staging'
      AND table_name   = 'stg_listings_unificado'
  ) THEN
    CREATE TABLE staging.stg_listings_unificado (
        listing_uid         TEXT,
        fuente              TEXT,
        tier                TEXT,
        tipo_operacion      TEXT,
        tipo_inmueble       TEXT,
        precio_cop          BIGINT,
        precio_usd          BIGINT,
        precio_min_cluster  BIGINT,
        precio_max_cluster  BIGINT,
        precio_variable     BOOLEAN,
        area_m2             NUMERIC,
        precio_m2           NUMERIC,
        habitaciones        INTEGER,
        banos               NUMERIC,
        barrio_raw          TEXT,
        barrio_id           INTEGER,
        direccion_raw       TEXT,
        lat                 DOUBLE PRECISION,
        lon                 DOUBLE PRECISION,
        geom                GEOMETRY(Point, 4326),
        url                 TEXT,
        fotos               TEXT[],
        fecha_scraping      TIMESTAMPTZ,
        n_duplicados        BIGINT,
        estrato_real        INTEGER
    );

    CREATE INDEX idx_stg_barrio_id ON staging.stg_listings_unificado (barrio_id);
    CREATE INDEX idx_stg_url       ON staging.stg_listings_unificado (url);
    CREATE INDEX idx_stg_precio    ON staging.stg_listings_unificado (precio_cop);
  END IF;
END $$;
"""


def upgrade() -> None:
    op.execute(_RECREATE)


def downgrade() -> None:
    pass
