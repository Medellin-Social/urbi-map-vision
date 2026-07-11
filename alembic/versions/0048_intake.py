"""Owner intake: captación de inmuebles

Revision ID: 0048
Revises: 0047
Create Date: 2026-07-10

Tabla intake: el propietario declara su inmueble (AUTOREPORTE — no verificado).
El realtor lo confirma después en la due diligence.

geom (Point SRID 4326, MISMO formato que listing.geom) se resuelve a barrio con
ST_Contains contra raw.barrios. zona_nivel/zona_codigo guardan el identificador
ESTABLE (barrio_id::text) — mismo que consulta el asignador (paso 5).

Las respuestas del cuestionario legal van en `declaraciones` (JSONB) para que
cambiar el cuestionario NO exija migración. agent_id lo llena el asignador;
listing_id se llena al aceptar.
"""
from alembic import op

revision = "0048"
down_revision = "0047"
branch_labels = None
depends_on = None

_CREATE_ENUMS = """
DO $$ BEGIN
    CREATE TYPE intake_estado AS ENUM
        ('nuevo', 'asignado', 'en_verificacion', 'aceptado', 'descartado');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE intake_operacion AS ENUM ('venta', 'arriendo');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE intake_tipo_inmueble AS ENUM
        ('apartamento', 'casa', 'local', 'oficina', 'lote', 'finca');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
"""

_DROP_ENUMS = """
DROP TYPE IF EXISTS intake_tipo_inmueble;
DROP TYPE IF EXISTS intake_operacion;
DROP TYPE IF EXISTS intake_estado;
"""


def upgrade() -> None:
    op.execute(_CREATE_ENUMS)

    op.execute("""
        CREATE TABLE IF NOT EXISTS intake (
            id              UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
            owner_id        UUID                  NOT NULL REFERENCES owner(id)   ON DELETE RESTRICT,
            estado          intake_estado         NOT NULL DEFAULT 'nuevo',
            agent_id        UUID                  REFERENCES agent(id)   ON DELETE SET NULL,
            listing_id      UUID                  REFERENCES listing(id) ON DELETE SET NULL,

            -- Declaraciones del owner (AUTOREPORTE, no verificado)
            operacion       intake_operacion      NOT NULL,
            tipo_inmueble   intake_tipo_inmueble  NOT NULL,

            -- Ubicación (obligatoria: sin zona no hay asignación)
            geom            GEOMETRY(Point, 4326) NOT NULL,
            municipio       TEXT,
            barrio          TEXT,
            direccion_aprox TEXT,

            -- Zona resuelta desde geom (identificador estable)
            zona_nivel      TEXT,   -- 'barrio' (único nivel estable hoy)
            zona_codigo     TEXT,   -- raw.barrios.id::text

            -- Características físicas (autoreporte)
            precio_esperado NUMERIC,
            area_m2         NUMERIC,
            habitaciones    SMALLINT,
            banos           SMALLINT,

            -- Cuestionario legal (autoreporte, versionable → JSONB, no columnas)
            declaraciones   JSONB,

            notas_owner     TEXT,

            created_at      TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ           NOT NULL DEFAULT NOW()
        )
    """)

    op.execute("CREATE INDEX IF NOT EXISTS idx_intake_owner_estado ON intake(owner_id, estado)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_intake_estado       ON intake(estado)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_intake_agent_id     ON intake(agent_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_intake_zona         ON intake(zona_nivel, zona_codigo)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_intake_geom         ON intake USING gist(geom)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS intake")
    op.execute(_DROP_ENUMS)
