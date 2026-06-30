"""Consolidación agentes fase 3 — drop columnas viejas

Revision ID: 0044
Revises: 0043
Create Date: 2026-06-30

Tras fase 1 (backfill 0043) y fase 2 (todo el código usa esquema nuevo), ya no
hay lectura viva de las columnas viejas en agentes. Las dropea. Reversible:
el downgrade las recrea (vacías; los datos vivían también en las nuevas).
NO toca `bio` (sigue en uso, fuera de scope de esta consolidación).
"""
from alembic import op

revision = "0044"
down_revision = "0043"
branch_labels = None
depends_on = None

_OLD_COLS = [
    "verificado",
    "activo",
    "nombre",
    "apellido",
    "agencia",
    "barrios_especializados",
    "foto_url",
]


def upgrade() -> None:
    for col in _OLD_COLS:
        op.execute(f"ALTER TABLE public.agentes DROP COLUMN IF EXISTS {col}")


def downgrade() -> None:
    op.execute("""
        ALTER TABLE public.agentes
            ADD COLUMN IF NOT EXISTS verificado             BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS activo                 BOOLEAN DEFAULT TRUE,
            ADD COLUMN IF NOT EXISTS nombre                 VARCHAR,
            ADD COLUMN IF NOT EXISTS apellido               VARCHAR,
            ADD COLUMN IF NOT EXISTS agencia                VARCHAR,
            ADD COLUMN IF NOT EXISTS barrios_especializados INTEGER[],
            ADD COLUMN IF NOT EXISTS foto_url               VARCHAR
    """)
