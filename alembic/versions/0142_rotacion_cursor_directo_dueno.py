"""Rotación de agentes por zona (cursor) + flag directo_dueno en listing.

Dos cosas para el modelo de "agente del listing":

1. zona_rotacion_cursor — cursor round-robin POR zona (barrio/comuna). Cada carga
   de la página de un listing avanza el cursor de su zona y muestra el siguiente
   slot pagado (realtor_preferido_slot ordenado por posicion). Reparte impresiones
   parejo entre los que pagaron. Avance atómico:
     INSERT ... VALUES (nivel, codigo, 0)
     ON CONFLICT (zona_nivel, zona_codigo) DO UPDATE SET cursor = cursor + 1
     RETURNING cursor;
   slot = posiciones_ordenadas[cursor % N]. Una fila por zona → sin contención
   entre zonas; misma zona = lock de fila microsegundos (aguanta miles/seg).

2. listing.directo_dueno — el dueño publicó y NO quiere realtor. El listing muestra
   "Directo con el dueño" + su contacto, no entra al pool/bridge y no acepta
   agentes que se sumen.

Revision ID: 0142
Revises: 0141
"""
from alembic import op

revision = "0142"
down_revision = "0141"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    CREATE TABLE IF NOT EXISTS zona_rotacion_cursor (
        zona_nivel  TEXT   NOT NULL CHECK (zona_nivel IN ('barrio','comuna')),
        zona_codigo TEXT   NOT NULL,
        cursor      BIGINT NOT NULL DEFAULT 0,
        PRIMARY KEY (zona_nivel, zona_codigo)
    )""")
    op.execute("ALTER TABLE listing ADD COLUMN IF NOT EXISTS directo_dueno BOOLEAN NOT NULL DEFAULT FALSE")


def downgrade() -> None:
    op.execute("ALTER TABLE listing DROP COLUMN IF EXISTS directo_dueno")
    op.execute("DROP TABLE IF EXISTS zona_rotacion_cursor")
