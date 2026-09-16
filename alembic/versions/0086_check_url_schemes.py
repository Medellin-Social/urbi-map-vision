"""security: CHECK constraints — url_externo/website must be http(s)

DB-level defense-in-depth on top of the Pydantic validator in
api/utils/urls.py: even a future insert path that bypasses app-level
validation (direct SQL, a buggy migration, a compromised service) can't get
a javascript:/data: URL into a column that's rendered as <a href>.

Scoped to url_externo/website only — the confirmed <a href> sinks (both
have zero existing violations). foto_url is excluded: it's only ever used
as img src / CSS background-image (not exploitable as javascript: — browsers
don't execute it in those contexts), and legit scraper rows use relative
paths there (e.g. eventos.foto_url = '/themes/png/gov.png' from the gov.co
calendar scraper) that a same-constraint would have broken.

Revision ID: 0086
Revises: 0085
Create Date: 2026-09-15
"""
from alembic import op

revision = "0086"
down_revision = "0085"
branch_labels = None
depends_on = None

_URL_COLUMNS = [
    ("public.eventos", "url_externo"),
    ("public.tiendas", "website"),
]


def upgrade() -> None:
    for table, col in _URL_COLUMNS:
        constraint = f"ck_{table.split('.')[-1]}_{col}_scheme"
        op.execute(f"""
            ALTER TABLE {table}
            ADD CONSTRAINT {constraint}
            CHECK ({col} IS NULL OR {col} ~ '^https?://')
        """)


def downgrade() -> None:
    for table, col in _URL_COLUMNS:
        constraint = f"ck_{table.split('.')[-1]}_{col}_scheme"
        op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {constraint}")
