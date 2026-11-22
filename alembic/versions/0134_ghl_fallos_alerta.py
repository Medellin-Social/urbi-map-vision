"""ghl_push_failures.alerta_agotado_at: marca de fallos agotados ya avisados al admin.

Revision ID: 0134
Revises: 0133
"""
from alembic import op

revision = "0134"
down_revision = "0133"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE public.ghl_push_failures ADD COLUMN IF NOT EXISTS alerta_agotado_at timestamptz")


def downgrade() -> None:
    op.execute("ALTER TABLE public.ghl_push_failures DROP COLUMN IF EXISTS alerta_agotado_at")
