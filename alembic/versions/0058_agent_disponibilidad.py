"""Disponibilidad semanal del agente (slots de visita sin Google Calendar)

El agente define su horario semanal; el modal de "Agendar visita" muestra solo
esos slots menos los ya reservados. Fase 1 del calendario — Google Calendar
queda como upgrade opcional posterior.

Revision ID: 0058
Revises: 0057
Create Date: 2026-07-18
"""
from alembic import op

revision = "0058"
down_revision = "0057"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS agent_disponibilidad (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            agent_id    UUID NOT NULL REFERENCES agent(id) ON DELETE CASCADE,
            dia_semana  SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),  -- 0=lunes
            hora_inicio TIME NOT NULL,
            hora_fin    TIME NOT NULL,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            CHECK (hora_fin > hora_inicio)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_agent_disp_agent ON agent_disponibilidad(agent_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS agent_disponibilidad")
