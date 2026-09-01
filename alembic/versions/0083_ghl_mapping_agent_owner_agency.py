"""GHL object mapping — agrega agent/owner/agency al discriminador

Mismo crosswalk genérico de la migración 0082, ahora también para los 3
tipos que necesitan las associations de Real Estate Listing (Listing Agent,
Property Owner, Listing Agency — PDF §6). agent/owner mapean a GHL Contact,
agency mapea a GHL Business (igual que tienda, pero es una entidad interna
distinta — object_type los separa).

Revision ID: 0083
Revises: 0082
"""
from alembic import op

revision = "0083"
down_revision = "0082"
branch_labels = None
depends_on = None

_OLD = "('listing', 'tienda', 'evento', 'deal')"
_NEW = "('listing', 'tienda', 'evento', 'deal', 'agent', 'owner', 'agency')"


def upgrade() -> None:
    op.execute("ALTER TABLE public.ghl_object_mapping DROP CONSTRAINT ghl_object_mapping_object_type_check")
    op.execute(
        f"ALTER TABLE public.ghl_object_mapping ADD CONSTRAINT ghl_object_mapping_object_type_check "
        f"CHECK (object_type IN {_NEW})"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE public.ghl_object_mapping DROP CONSTRAINT ghl_object_mapping_object_type_check")
    op.execute(
        f"ALTER TABLE public.ghl_object_mapping ADD CONSTRAINT ghl_object_mapping_object_type_check "
        f"CHECK (object_type IN {_OLD})"
    )
