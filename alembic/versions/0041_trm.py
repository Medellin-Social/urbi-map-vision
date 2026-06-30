"""public.trm — single-row TRM (COP per USD), refreshed weekly from datos.gov.co

Revision ID: 0041
Revises: 0040
Create Date: 2026-06-29

Canonical exchange rate for the MLS (cards/drawer/filter). Single row (id=1).
The weekly Airflow DAG (trm_semanal) upserts `valor` from datos.gov.co dataset
32sa-8pi3. NO per-listing USD column — listings stay in COP.
"""
from alembic import op

revision = "0041"
down_revision = "0040"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.trm (
            id         smallint     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
            valor      numeric      NOT NULL,
            vigencia   date,
            updated_at timestamptz  DEFAULT now()
        )
    """)
    # Seed with the previous hardcoded fallback so the rate is never null.
    op.execute("INSERT INTO public.trm (id, valor) VALUES (1, 4100) ON CONFLICT (id) DO NOTHING")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS public.trm")
