"""visita_solicitud: marcas de seguimiento (recordatorio 12 h, reasignación 24 h, escalada).

Revision ID: 0134
Revises: 0133
"""
from alembic import op

revision = "0134"
down_revision = "0133"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE visita_solicitud ADD COLUMN IF NOT EXISTS recordatorio_at TIMESTAMPTZ")
    op.execute("ALTER TABLE visita_solicitud ADD COLUMN IF NOT EXISTS reasignada_at TIMESTAMPTZ")
    op.execute("ALTER TABLE visita_solicitud ADD COLUMN IF NOT EXISTS escalada_at TIMESTAMPTZ")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_visita_followup ON visita_solicitud(created_at) "
        "WHERE estado = 'pendiente' AND agent_id IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_visita_followup")
    for c in ("escalada_at", "reasignada_at", "recordatorio_at"):
        op.execute(f"ALTER TABLE visita_solicitud DROP COLUMN IF EXISTS {c}")
