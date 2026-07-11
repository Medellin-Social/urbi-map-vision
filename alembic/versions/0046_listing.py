"""Realtor listing: listing + listing_media tables + state enums

Revision ID: 0046
Revises: 0045
Create Date: 2026-07-10

Nueva entidad listing con ubicación PostGIS (GEOMETRY Point 4326) e tabla de
media asociada. Máquina de estados declarada como ENUM; transiciones válidas
viven en api/services/listing_service.py, no en triggers.

FKs a agency y agent usan RESTRICT para proteger integridad sin DELETE en
cascada — un listing publicado no debe desaparecer si se archiva la agency.
"""
from alembic import op

revision = "0046"
down_revision = "0045"
branch_labels = None
depends_on = None

_CREATE_ENUMS = """
DO $$ BEGIN
    CREATE TYPE listing_estado AS ENUM
        ('borrador', 'en_revision', 'publicado', 'rechazado', 'pausado', 'cerrado');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE listing_operacion AS ENUM ('venta', 'arriendo');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE listing_tipo_inmueble AS ENUM
        ('apartamento', 'casa', 'local', 'oficina', 'lote', 'finca');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
"""

_DROP_ENUMS = """
DROP TYPE IF EXISTS listing_tipo_inmueble;
DROP TYPE IF EXISTS listing_operacion;
DROP TYPE IF EXISTS listing_estado;
"""


def upgrade() -> None:
    op.execute(_CREATE_ENUMS)

    op.execute("""
        CREATE TABLE IF NOT EXISTS listing (
            id               UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
            slug             TEXT                  NOT NULL UNIQUE,
            agency_id        UUID                  NOT NULL REFERENCES agency(id)  ON DELETE RESTRICT,
            agent_id         UUID                  NOT NULL REFERENCES agent(id)   ON DELETE RESTRICT,
            estado           listing_estado        NOT NULL DEFAULT 'borrador',

            -- Ubicación
            geom             GEOMETRY(Point, 4326) NOT NULL,
            municipio        TEXT,
            barrio           TEXT,
            direccion_aprox  TEXT,
            mostrar_exacto   BOOLEAN               NOT NULL DEFAULT FALSE,

            -- Comercial
            operacion        listing_operacion     NOT NULL,
            precio           NUMERIC               NOT NULL,
            moneda           TEXT                  NOT NULL DEFAULT 'COP',
            administracion   NUMERIC,

            -- Características
            tipo_inmueble    listing_tipo_inmueble NOT NULL,
            area_m2          NUMERIC,
            habitaciones     SMALLINT,
            banos            SMALLINT,
            parqueaderos     SMALLINT,
            estrato          SMALLINT,
            antiguedad_anios SMALLINT,

            -- Meta
            titulo           TEXT,
            descripcion      TEXT,
            video_url        TEXT,
            tour_url         TEXT,

            created_at       TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
            updated_at       TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
            published_at     TIMESTAMPTZ
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS listing_media (
            id         UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
            listing_id UUID     NOT NULL REFERENCES listing(id) ON DELETE CASCADE,
            url        TEXT     NOT NULL,
            orden      SMALLINT NOT NULL DEFAULT 0,
            es_portada BOOLEAN  NOT NULL DEFAULT FALSE
        )
    """)

    # Spatial index (GIST) — fuente de verdad para queries por proximidad/bbox
    op.execute("CREATE INDEX IF NOT EXISTS idx_listing_geom       ON listing USING gist(geom)")

    # Btree indexes para filtros frecuentes
    op.execute("CREATE INDEX IF NOT EXISTS idx_listing_estado     ON listing(estado)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_listing_agency_id  ON listing(agency_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_listing_agent_id   ON listing(agent_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_listing_op_tipo    ON listing(operacion, tipo_inmueble)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_listing_mun_barrio ON listing(municipio, barrio)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_listing_media_lid  ON listing_media(listing_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS listing_media")
    op.execute("DROP TABLE IF EXISTS listing")
    op.execute(_DROP_ENUMS)
