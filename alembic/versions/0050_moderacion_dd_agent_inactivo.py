"""Moderación, due diligence y estado 'inactivo' de agente

Revision ID: 0050
Revises: 0048
Create Date: 2026-07-10

Cierra el backend del flujo de realtors:
- listing_moderacion: bitácora de aprobación/rechazo de la publicación inicial.
- due_diligence_item: checklist del realtor sobre lo declarado por el owner.
- agent_estado += 'inactivo': desactivar un agente sin borrarlo.
- agent.motivo_estado: motivo de rechazo/suspensión.

NOTA: down_revision = 0048. La 0049 (asignador) mencionada en el plan no existe
en el repo; esta migración NO depende de ella.

⚠️ Añadir un valor a un ENUM de Postgres NO es reversible de forma trivial
(no hay DROP VALUE). El downgrade dropea las tablas y columnas nuevas pero DEJA
'inactivo' en agent_estado — documentado, no fingido.
"""
from alembic import op

revision = "0050"
down_revision = "0048"
branch_labels = None
depends_on = None

_CREATE_ENUMS = """
DO $$ BEGIN
    CREATE TYPE moderacion_accion AS ENUM ('aprobado', 'rechazado');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE due_diligence_estado AS ENUM ('pendiente', 'verificado', 'rechazado');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
"""

_DROP_ENUMS = """
DROP TYPE IF EXISTS due_diligence_estado;
DROP TYPE IF EXISTS moderacion_accion;
"""


def upgrade() -> None:
    op.execute(_CREATE_ENUMS)

    # Añade 'inactivo' al enum agent_estado (idempotente, PG 12+).
    # No se USA el valor en esta misma migración → seguro dentro de la transacción.
    op.execute("ALTER TYPE agent_estado ADD VALUE IF NOT EXISTS 'inactivo'")

    # motivo de rechazo/suspensión del agente
    op.execute("ALTER TABLE agent ADD COLUMN IF NOT EXISTS motivo_estado TEXT")

    op.execute("""
        CREATE TABLE IF NOT EXISTS listing_moderacion (
            id           UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
            listing_id   UUID              NOT NULL REFERENCES listing(id) ON DELETE CASCADE,
            accion       moderacion_accion NOT NULL,
            motivo       TEXT,             -- solo el rechazo lo lleva
            moderador_id TEXT              NOT NULL,
            created_at   TIMESTAMPTZ       NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_listing_moderacion_listing ON listing_moderacion(listing_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS due_diligence_item (
            id             UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
            intake_id      UUID                 NOT NULL REFERENCES intake(id) ON DELETE CASCADE,
            clave          TEXT                 NOT NULL,
            declarado      JSONB,
            estado         due_diligence_estado NOT NULL DEFAULT 'pendiente',
            nota           TEXT,
            verificado_por UUID                 REFERENCES agent(id) ON DELETE SET NULL,
            verificado_at  TIMESTAMPTZ,
            created_at     TIMESTAMPTZ          NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_dd_intake_estado ON due_diligence_item(intake_id, estado)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS due_diligence_item")
    op.execute("DROP TABLE IF EXISTS listing_moderacion")
    op.execute("ALTER TABLE agent DROP COLUMN IF EXISTS motivo_estado")
    op.execute(_DROP_ENUMS)
    # ⚠️ 'inactivo' queda en agent_estado: Postgres no soporta quitar un valor de
    # un ENUM sin recrear el tipo (riesgoso con datos vivos). Se deja a propósito.
