"""GHL payment mapping — prep only, not wired to a live webhook yet

Mirrors the existing stripe_subscription_id/wompi_subscription_id columns on
suscripciones_usuario. ghl_contact_id on usuarios is set at checkout-initiation
(create/find the GHL contact, persist the mapping there) so the return webhook
looks up by that stored ID instead of matching on email.

Revision ID: 0077
Revises: 0076
"""
from alembic import op

revision = "0077"
down_revision = "0076"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS ghl_contact_id TEXT"
    )
    op.execute(
        "ALTER TABLE public.suscripciones_usuario "
        "ADD COLUMN IF NOT EXISTS ghl_subscription_id TEXT"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_usuarios_ghl_contact_id "
        "ON public.usuarios (ghl_contact_id) WHERE ghl_contact_id IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE public.usuarios DROP COLUMN IF EXISTS ghl_contact_id")
    op.execute(
        "ALTER TABLE public.suscripciones_usuario DROP COLUMN IF EXISTS ghl_subscription_id"
    )
