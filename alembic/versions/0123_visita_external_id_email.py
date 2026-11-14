"""GHL lead-in: external_id (idempotencia) + email en visita_solicitud

POST /api/v1/ghl/leads recibe leads NUEVOS desde GHL (ads / forms / portales).
Los workflows de GHL reintentan → `external_id` + unique index deduplica (una
fila por lead de GHL; reenviar el mismo external_id devuelve el existente, no
crea otra visita). `email`: visita_solicitud tenía nombre/telefono pero NO
email propio — lo sacaba del JOIN a usuarios; un lead de GHL trae su email y
no había dónde guardarlo. Ambas columnas NULL-ables (los leads de nuestro
sitio siguen sin external_id y con email vía usuarios).

Revision ID: 0123
Revises: 0122
Create Date: 2026-11-13
"""
from alembic import op

revision = "0123"
down_revision = "0122"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE visita_solicitud ADD COLUMN IF NOT EXISTS external_id TEXT")
    op.execute("ALTER TABLE visita_solicitud ADD COLUMN IF NOT EXISTS email TEXT")
    # Idempotencia del boundary GHL: a lo sumo una fila por external_id. Parcial
    # (WHERE NOT NULL) para no colisionar entre los muchos leads de nuestro sitio
    # que no traen external_id.
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_visita_external_id "
        "ON visita_solicitud(external_id) WHERE external_id IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_visita_external_id")
    op.execute("ALTER TABLE visita_solicitud DROP COLUMN IF EXISTS email")
    op.execute("ALTER TABLE visita_solicitud DROP COLUMN IF EXISTS external_id")
