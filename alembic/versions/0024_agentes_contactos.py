"""Add contactos_agente table + slug index on agentes

Revision ID: 0024
Revises: 0023
Create Date: 2026-06-10
"""
from alembic import op

revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS contactos_agente (
            id         SERIAL PRIMARY KEY,
            agente_id  INT REFERENCES agentes(id) ON DELETE CASCADE,
            nombre     TEXT NOT NULL,
            email      TEXT NOT NULL,
            mensaje    TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_contactos_agente_id ON contactos_agente(agente_id)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS contactos_agente")
