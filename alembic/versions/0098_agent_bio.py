"""feat: agent.bio — descripción pública que el agente escribe de sí mismo

Solo bio. foto_url ya existe (0045). años_experiencia/#transacciones NO van aquí:
el doc los ata a la solicitud de certificación (revisados), no al registro —
ponerlos self-claim en `agent` implicaría una verificación que no tenemos.

Revision ID: 0098
Revises: 0097
Create Date: 2026-09-27
"""
from alembic import op

revision = "0098"
down_revision = "0097"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE public.agent ADD COLUMN IF NOT EXISTS bio TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE public.agent DROP COLUMN IF EXISTS bio")
