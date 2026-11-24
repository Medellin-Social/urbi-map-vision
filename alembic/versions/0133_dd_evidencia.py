"""due_diligence_item — evidencia (link O archivo en la DB, no R2)

Gap A: el realtor adjunta prueba al verificar cada ítem del checklist.
- evidencia        TEXT  : link/referencia (Drive, CTL radicado #, nota)
- evidencia_bytes  BYTEA : contenido del archivo subido (se guarda EN la DB, no en R2)
- evidencia_nombre TEXT  : nombre original del archivo
- evidencia_mime   TEXT  : content-type (para servirlo de vuelta)

Idempotente (ADD COLUMN IF NOT EXISTS) — seguro de re-correr.

Revision ID: 0133
Revises: 0132
"""
from alembic import op

revision = "0133"
down_revision = "0132"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE due_diligence_item ADD COLUMN IF NOT EXISTS evidencia        TEXT")
    op.execute("ALTER TABLE due_diligence_item ADD COLUMN IF NOT EXISTS evidencia_bytes  BYTEA")
    op.execute("ALTER TABLE due_diligence_item ADD COLUMN IF NOT EXISTS evidencia_nombre TEXT")
    op.execute("ALTER TABLE due_diligence_item ADD COLUMN IF NOT EXISTS evidencia_mime   TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE due_diligence_item DROP COLUMN IF EXISTS evidencia_mime")
    op.execute("ALTER TABLE due_diligence_item DROP COLUMN IF EXISTS evidencia_nombre")
    op.execute("ALTER TABLE due_diligence_item DROP COLUMN IF EXISTS evidencia_bytes")
    op.execute("ALTER TABLE due_diligence_item DROP COLUMN IF EXISTS evidencia")
