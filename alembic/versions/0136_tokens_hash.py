"""Tokens de verify/reset/magic-link pasan a guardarse como sha256.

Los tokens en claro que haya en las tablas dejan de servir (el código ahora compara
contra el hash), así que se borran: son de vida corta (15 min a 24 h) y el usuario
solo debe pedir otro link. Sin cambio de esquema (la columna es TEXT).

Revision ID: 0136
Revises: 0135
"""
from alembic import op

revision = "0136"
down_revision = "0135"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for t in ("email_verification_tokens", "password_reset_tokens", "magic_link_tokens"):
        op.execute(f"DELETE FROM {t}")


def downgrade() -> None:
    pass
