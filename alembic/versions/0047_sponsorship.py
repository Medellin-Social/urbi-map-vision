"""Agency zone sponsorship

Revision ID: 0047
Revises: 0046
Create Date: 2026-07-10

Motor de ingresos: una agency paga por patrocinar una zona (barrio, comuna o
municipio) durante un período. Varias agencies pueden patrocinar la misma zona
simultáneamente — el reparto entre ellas va en el asignador (paso 5).

zona_codigo es TEXT sin FK porque el campo es polimórfico:
  - zona_nivel='barrio'    → zona_codigo = raw.barrios.id::text  (int estable)
  - zona_nivel='comuna'    → zona_codigo = raw.barrios.comuna     (texto libre)
  - zona_nivel='municipio' → zona_codigo = raw.barrios.municipio  (texto libre)
Un FK declarativo requeriría 3 columnas o un trigger; el consumidor hace el cast.

"Vigente hoy" = estado='activa' AND fecha_inicio <= CURRENT_DATE <= fecha_fin.
El índice compuesto (zona_nivel, zona_codigo, estado) hace esa query barata.
"""
from alembic import op

revision = "0047"
down_revision = "0046"
branch_labels = None
depends_on = None

_CREATE_ENUMS = """
DO $$ BEGIN
    CREATE TYPE sponsorship_zona_nivel AS ENUM ('barrio', 'comuna', 'municipio');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE sponsorship_estado AS ENUM ('activa', 'vencida', 'cancelada');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
"""

_DROP_ENUMS = """
DROP TYPE IF EXISTS sponsorship_estado;
DROP TYPE IF EXISTS sponsorship_zona_nivel;
"""


def upgrade() -> None:
    op.execute(_CREATE_ENUMS)

    op.execute("""
        CREATE TABLE IF NOT EXISTS sponsorship (
            id             UUID                   PRIMARY KEY DEFAULT gen_random_uuid(),
            agency_id      UUID                   NOT NULL REFERENCES agency(id) ON DELETE RESTRICT,
            zona_nivel     sponsorship_zona_nivel  NOT NULL,
            zona_codigo    TEXT                   NOT NULL,
            tier           TEXT,
            precio_mensual NUMERIC                NOT NULL,
            fecha_inicio   DATE                   NOT NULL,
            fecha_fin      DATE                   NOT NULL,
            estado         sponsorship_estado     NOT NULL DEFAULT 'activa',
            created_at     TIMESTAMPTZ            NOT NULL DEFAULT NOW(),
            updated_at     TIMESTAMPTZ            NOT NULL DEFAULT NOW(),
            CONSTRAINT chk_sponsorship_fechas CHECK (fecha_fin >= fecha_inicio)
        )
    """)

    # Índice principal: filtra por zona + estado en patrocinadores_vigentes()
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_sponsorship_zona "
        "ON sponsorship(zona_nivel, zona_codigo, estado)"
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_sponsorship_agency     ON sponsorship(agency_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_sponsorship_fechas     ON sponsorship(fecha_inicio, fecha_fin)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS sponsorship")
    op.execute(_DROP_ENUMS)
