"""feat: eventos — add cultura_eterea to fuente CHECK

Revision ID: 0015
Revises: 0014
Create Date: 2026-06-06
"""
from alembic import op

revision = "0015"
down_revision = "0014"
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
            'facebook', 'cultura_eterea'
        ))
    """)


def downgrade() -> None:
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
