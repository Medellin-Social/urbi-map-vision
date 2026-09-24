"""Add telefono to usuarios

Revision ID: 0093
Revises: 0092
Create Date: 2026-09-22

Captura el teléfono en el registro (form email/password). Nullable porque
Google Sign-In auto-registra sin pedirlo, y las cuentas existentes no lo tienen.
"""
from alembic import op

revision = "0093"
down_revision = "0092"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefono TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE usuarios DROP COLUMN IF EXISTS telefono")
