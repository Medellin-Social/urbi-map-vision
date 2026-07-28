"""Verificación de teléfono del owner (anti-spam del intake)

Equivalente barato de la llamada automática de Zillow FSBO: OTP antes de que
la publicación de un owner entre al asignador. Código plano con expiración
corta — no es un secreto de larga vida.

Revision ID: 0057
Revises: 0056
Create Date: 2026-07-16
"""
from alembic import op

revision = "0057"
down_revision = "0056"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE owner ADD COLUMN IF NOT EXISTS telefono_verificado BOOLEAN NOT NULL DEFAULT FALSE")
    op.execute("ALTER TABLE owner ADD COLUMN IF NOT EXISTS otp_codigo TEXT")
    op.execute("ALTER TABLE owner ADD COLUMN IF NOT EXISTS otp_expira TIMESTAMPTZ")


def downgrade() -> None:
    op.execute("ALTER TABLE owner DROP COLUMN IF EXISTS otp_expira")
    op.execute("ALTER TABLE owner DROP COLUMN IF EXISTS otp_codigo")
    op.execute("ALTER TABLE owner DROP COLUMN IF EXISTS telefono_verificado")
