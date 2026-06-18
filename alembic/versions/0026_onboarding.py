"""0026 onboarding fields on usuarios

Revision ID: 0026
Revises: 0025
Create Date: 2026-06-13
"""
from alembic import op
import sqlalchemy as sa

revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        ALTER TABLE public.usuarios
            ADD COLUMN IF NOT EXISTS perfil_busqueda VARCHAR DEFAULT NULL,
            ADD COLUMN IF NOT EXISTS onboarding_completado BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS origen_registro VARCHAR DEFAULT NULL;
    """)


def downgrade():
    op.execute("""
        ALTER TABLE public.usuarios
            DROP COLUMN IF EXISTS perfil_busqueda,
            DROP COLUMN IF EXISTS onboarding_completado,
            DROP COLUMN IF EXISTS origen_registro;
    """)
