"""Agency team: agent_id en visita_solicitud para routing directo agente→visita

Revision ID: 0064
Revises: 0063
Create Date: 2026-08-13

NULL = visita en pool de agencia (sin asignar).
NOT NULL = visita va directo al inbox del agente asignado al listing.
"""
from alembic import op

revision = "0064"
down_revision = "0063"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE visita_solicitud
        ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES agent(id) ON DELETE SET NULL
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_visita_agent_id ON visita_solicitud(agent_id)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_visita_agent_id")
    op.execute("ALTER TABLE visita_solicitud DROP COLUMN IF EXISTS agent_id")
