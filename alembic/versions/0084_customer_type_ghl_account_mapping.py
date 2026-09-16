"""customer_type en usuarios + ghl_account_mapping (cuenta, no objeto)

Blueprint GHL (docs/Medellin-Social-GHL-Architecture.pdf) pide dos cosas que
todavía no existían:

  §4 "Design implication: customer_type must be a first-class field in
  PostgreSQL and on the central GHL contact." No vivía en ninguna tabla.
  Va en usuarios porque aplica a cualquier persona (hasta un free_subscriber
  que nunca toca agent/agency).

  §21 "Client -> GHL account mapping" — tabla distinta de ghl_object_mapping
  (0082/0083): esa mapea REGISTROS (listing/agent/agency como contacto),
  esta mapea CUENTAS (el sub-account GHL que se le aprovisiona a un usuario
  pagador). client_id = usuarios.id. community_id del blueprint se omite a
  propósito — es multi-ciudad (Easy Street fase 7), todavía una sola ciudad.

No crea el flujo de aprovisionamiento (crear sub-account, mandar login) ni
el que crea el usuario a partir de un contacto GHL — eso sigue bloqueado en
el contrato de Talal (ver api/routers/ghl_webhook.py). Esto solo dej a las
tablas listas para cuando exista.

Revision ID: 0084
Revises: 0083
"""
from alembic import op

revision = "0084"
down_revision = "0083"
branch_labels = None
depends_on = None

_CUSTOMER_TYPES = (
    "free_subscriber", "community_member", "contributing_subscriber",
    "local_business", "featured_business", "realtor", "property_manager",
    "rental_host", "service_provider", "hotspot_business",
    "neighbourhood_ambassador", "community_affiliate",
    "team", "developer", "admin",
)


def upgrade() -> None:
    op.execute("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS customer_type TEXT")
    op.execute(
        f"ALTER TABLE usuarios ADD CONSTRAINT chk_usuarios_customer_type "
        f"CHECK (customer_type IS NULL OR customer_type IN {_CUSTOMER_TYPES})"
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS public.ghl_account_mapping (
            id BIGSERIAL PRIMARY KEY,
            client_id INTEGER NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
            ghl_location_id TEXT NOT NULL UNIQUE,
            ghl_user_id TEXT,
            snapshot_id TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS public.ghl_account_mapping")
    op.execute("ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS chk_usuarios_customer_type")
    op.execute("ALTER TABLE usuarios DROP COLUMN IF EXISTS customer_type")
