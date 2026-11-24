"""agent_reporte_mensual: ledger de reportes mensuales enviados (idempotencia por agente+periodo).

Revision ID: 0135
Revises: 0134
"""
from alembic import op

revision = "0135"
down_revision = "0134"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS agent_reporte_mensual (
            agent_id   UUID NOT NULL,
            periodo    DATE NOT NULL,
            enviado_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (agent_id, periodo)
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS agent_reporte_mensual")
