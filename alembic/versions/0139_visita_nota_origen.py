"""Visitas: nota del realtor + origen (manual vs mapa)

Dos campos nuevos en visita_solicitud, pedidos en la mejora de la sección de
visitas del realtor:

- `nota_realtor`  (#4): nota libre que el realtor escribe al marcar el resultado
  de una visita (ej. "ofrece $440M, pide 2 parqueaderos").
- `origen`        (#2): de dónde salió la visita. 'mapa' = pedida por un comprador
  desde el mapa (default, lo existente). 'manual' = el realtor la registró a mano
  (la agendó por fuera de la plataforma). Permite decidir luego si las visitas
  manuales cuentan o no para el puntaje/ranking (auto-reporte sin verificación).

Revision ID: 0139
Revises: 0138
"""
from alembic import op

revision = "0139"
down_revision = "0138"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE visita_solicitud ADD COLUMN IF NOT EXISTS nota_realtor TEXT")
    op.execute("ALTER TABLE visita_solicitud ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'mapa'")


def downgrade() -> None:
    op.execute("ALTER TABLE visita_solicitud DROP COLUMN IF EXISTS origen")
    op.execute("ALTER TABLE visita_solicitud DROP COLUMN IF EXISTS nota_realtor")
