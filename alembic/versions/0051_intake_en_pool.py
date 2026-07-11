"""Asignador: estado 'en_pool' en intake_estado

Revision ID: 0051
Revises: 0050
Create Date: 2026-07-10

El asignador (paso 5) manda al pool los intakes sin patrocinador vigente (o sin
owner activo). Añade 'en_pool' al enum intake_estado. No crea tablas: el
asignador reusa intake, sponsorship y agent existentes.

⚠️ ADD VALUE a un ENUM de Postgres NO es reversible (no hay DROP VALUE sin
recrear el tipo). El downgrade lo documenta y deja el valor — igual que 0050.
El valor NO se USA en esta migración → seguro dentro de la transacción (PG 12+).
"""
from alembic import op

revision = "0051"
down_revision = "0050"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE intake_estado ADD VALUE IF NOT EXISTS 'en_pool'")


def downgrade() -> None:
    # ⚠️ 'en_pool' queda en intake_estado: Postgres no soporta quitar un valor de
    # un ENUM sin recrear el tipo (riesgoso con datos vivos). Se deja a propósito.
    pass
