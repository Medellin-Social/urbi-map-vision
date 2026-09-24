"""Noticias: barrio_id para filtro futuro por comuna/barrio

Revision ID: 0092
Revises: 0091
Create Date: 2026-09-22

NULL = sin tag de ubicación (caso actual, todas las noticias son city-wide vía
RSS). Deja la columna+índice listos para cuando se etiquete por barrio
(manual o NLP) sin migración adicional — mismo patrón que eventos.barrio_id.
El filtro en API/frontend no se construye acá, solo el hook de esquema.
"""
from alembic import op

revision = "0092"
down_revision = "0091"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE noticias
        ADD COLUMN IF NOT EXISTS barrio_id INTEGER REFERENCES raw.barrios(id) ON DELETE SET NULL
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_noticias_barrio_id ON noticias(barrio_id)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_noticias_barrio_id")
    op.execute("ALTER TABLE noticias DROP COLUMN IF EXISTS barrio_id")
