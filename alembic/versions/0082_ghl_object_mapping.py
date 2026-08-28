"""GHL object mapping — generic id crosswalk for listing/tienda/evento/deal

Tabla nueva y vacía (cero riesgo sobre datos existentes). No toca listing,
tiendas, eventos ni deals — solo referencia sus PKs como texto (mezcla
uuid/integer) vía object_type discriminador. Necesaria para que el receptor
de webhooks GHL pueda hacer upsert idempotente en vez de duplicar filas en
cada evento repetido.

sync_status/sync_error existen para poder ver desde /panel-x9k2 qué falló sin
tener que leer logs de Railway (que en el incidente de barrio_id resultaron
inaccesibles para un deployment caído).

Revision ID: 0082
Revises: 0081
"""
from alembic import op

revision = "0082"
down_revision = "0081"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS public.ghl_object_mapping (
            id BIGSERIAL PRIMARY KEY,
            object_type TEXT NOT NULL CHECK (object_type IN ('listing', 'tienda', 'evento', 'deal')),
            internal_object_id TEXT NOT NULL,
            ghl_object_id TEXT NOT NULL,
            ghl_location_id TEXT,
            sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'failed')),
            sync_error TEXT,
            last_synced_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_ghl_mapping_internal "
        "ON public.ghl_object_mapping (object_type, internal_object_id)"
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_ghl_mapping_ghl "
        "ON public.ghl_object_mapping (object_type, ghl_object_id)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS public.ghl_object_mapping")
