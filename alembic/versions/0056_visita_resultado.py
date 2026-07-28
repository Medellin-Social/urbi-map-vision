"""CRM nivel 1: no_asistio + resultado de la visita

Separa plantón (no_asistio) de cancelación, y captura el desenlace comercial
con un clic al marcar la visita realizada. Alimenta show rate y visitas→ofertas
en /realtor/desempeno.

Revision ID: 0056
Revises: 0055
Create Date: 2026-07-16
"""
from alembic import op

revision = "0056"
down_revision = "0055"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE visita_solicitud DROP CONSTRAINT IF EXISTS visita_solicitud_estado_check")
    op.execute("""
        ALTER TABLE visita_solicitud ADD CONSTRAINT visita_solicitud_estado_check
        CHECK (estado IN ('pendiente', 'confirmada', 'realizada', 'cancelada', 'no_asistio'))
    """)
    op.execute("""
        ALTER TABLE visita_solicitud ADD COLUMN IF NOT EXISTS resultado TEXT
        CHECK (resultado IN ('interesado', 'oferta', 'descartado'))
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE visita_solicitud DROP COLUMN IF EXISTS resultado")
    op.execute("UPDATE visita_solicitud SET estado = 'cancelada' WHERE estado = 'no_asistio'")
    op.execute("ALTER TABLE visita_solicitud DROP CONSTRAINT IF EXISTS visita_solicitud_estado_check")
    op.execute("""
        ALTER TABLE visita_solicitud ADD CONSTRAINT visita_solicitud_estado_check
        CHECK (estado IN ('pendiente', 'confirmada', 'realizada', 'cancelada'))
    """)
