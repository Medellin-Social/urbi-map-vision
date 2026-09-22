"""Create public.magic_link_tokens

Revision ID: 0089
Revises: 0088
Create Date: 2026-09-20

Passwordless login by email link/code — same shape as password_reset_tokens,
except keyed by email instead of usuario_id: the whole point is supporting
people who don't have an account yet (first magic-link login auto-registers
them), so there's no usuario_id to reference until the token is redeemed.
"""
from alembic import op

revision = "0089"
down_revision = "0088"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS magic_link_tokens (
            id          SERIAL PRIMARY KEY,
            email       TEXT NOT NULL,
            token       TEXT NOT NULL UNIQUE,
            expires_at  TIMESTAMPTZ NOT NULL,
            used        BOOLEAN NOT NULL DEFAULT FALSE,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (email)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_mlt_token ON magic_link_tokens(token)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS magic_link_tokens")
