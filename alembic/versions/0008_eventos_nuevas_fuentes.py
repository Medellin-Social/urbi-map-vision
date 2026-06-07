"""feat: eventos — agregar medellin_travel, tuboleta, alcaldia_medellin al CHECK de fuente

Revision ID: 0008a
Revises: 0008
Create Date: 2026-06-04
"""
from alembic import op

revision = "0008a"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE public.eventos DROP CONSTRAINT IF EXISTS eventos_fuente_check")
    op.execute("""
        ALTER TABLE public.eventos
        ADD CONSTRAINT eventos_fuente_check
        CHECK (fuente IN (
            'interno', 'meetup', 'eventbrite', 'luma',
            'medellin_travel', 'tuboleta', 'alcaldia_medellin',
            'facebook'
        ))
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE public.eventos DROP CONSTRAINT IF EXISTS eventos_fuente_check")
    op.execute("""
        ALTER TABLE public.eventos
        ADD CONSTRAINT eventos_fuente_check
        CHECK (fuente IN (
            'interno', 'meetup', 'eventbrite', 'luma', 'facebook'
        ))
    """)
