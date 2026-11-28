"""Ledger de pagos de sponsorship (barrio/comuna) → idempotencia del webhook GHL.

Antes el webhook de "pago aprobado" de una zona patrocinada no existía (solo el
confirmador simulado en dev), y procesar_pago_zona no deduplicaba por pago_ref →
un reenvío del webhook extendía la zona dos veces. Este ledger (igual patrón que
realtor_preferido_pago) hace el pago idempotente: un pago_ref = una asignación.
"""
from alembic import op

revision = "0141"
down_revision = "0140"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS sponsorship_pago (
            pago_ref       TEXT PRIMARY KEY,
            sponsorship_id UUID REFERENCES sponsorship(id) ON DELETE SET NULL,
            agent_id       UUID NOT NULL,
            zona_nivel     TEXT NOT NULL,
            zona_codigo    TEXT NOT NULL,
            created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )


def downgrade():
    op.execute("DROP TABLE IF EXISTS sponsorship_pago")
