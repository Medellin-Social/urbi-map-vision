"""Listing soft-delete — columna deleted_at para "eliminar" desde el dashboard

Revision ID: 0126
Revises: 0125
Create Date: 2026-11-16

El realtor puede eliminar un listing propio desde "Mis listings". Soft-delete
(reversible, auditable): se setea deleted_at = NOW() y mis_listings filtra
deleted_at IS NULL. NO se borra la fila ni el evento de propiedad asociado.

Alcance de esta pasada = solo estado del dashboard: el cache público del mapa NO
se toca (un listing eliminado puede seguir en el mapa hasta el refresh; sync al
mapa es fase 2). Migración aditiva y de bajo riesgo (carril alembic, CLAUDE.md).
"""
from alembic import op

revision = "0126"
down_revision = "0125"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE listing ADD COLUMN IF NOT EXISTS deleted_at timestamptz")


def downgrade() -> None:
    op.execute("ALTER TABLE listing DROP COLUMN IF EXISTS deleted_at")
