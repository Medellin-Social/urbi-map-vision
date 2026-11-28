"""Vistas del realtor: historial + guardados de comparaciones y simulaciones.

Cada comparación/simulación que el realtor corre se registra como HISTORIAL
(guardado=false, nombre auto-descriptivo). Puede "Guardar" una con su propio
nombre → guardado=true (no se purga). El historial sin guardar se poda al tope.
Guardamos los INPUTS en `payload` JSONB (no el snapshot): al reabrir se re-corre.
Scoped por agente.
"""
from alembic import op

revision = "0143"
down_revision = "0142"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS realtor_vista_guardada (
            id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            agent_id   UUID NOT NULL REFERENCES agent(id) ON DELETE CASCADE,
            tipo       TEXT NOT NULL CHECK (tipo IN ('comparador', 'simulador')),
            nombre     TEXT,
            guardado   BOOLEAN NOT NULL DEFAULT false,
            payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_rvg_agent_tipo "
        "ON realtor_vista_guardada (agent_id, tipo, guardado, created_at DESC)"
    )


def downgrade():
    op.execute("DROP TABLE IF EXISTS realtor_vista_guardada")
