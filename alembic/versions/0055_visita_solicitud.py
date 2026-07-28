"""Agenda del realtor: solicitudes de visita de compradores

visita_solicitud guarda cada "quiero ver este inmueble" que llega desde el
drawer del mapa (modal agendar visita). listing_url usa la misma clave que
user_events.entity_id y favoritos.listing_uid: la url del listing en el cache
(id::text para listings propios / listing nuevo, url externa para scrapeados).

Revision ID: 0055
Revises: 0054
Create Date: 2026-07-15
"""
from alembic import op

revision = "0055"
down_revision = "0054"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS visita_solicitud (
            id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            listing_url  TEXT        NOT NULL,
            usuario_id   INT         REFERENCES public.usuarios(id) ON DELETE SET NULL,
            nombre       TEXT,
            telefono     TEXT,
            fecha_visita TIMESTAMPTZ,
            mensaje      TEXT,
            estado       TEXT        NOT NULL DEFAULT 'pendiente'
                CHECK (estado IN ('pendiente', 'confirmada', 'realizada', 'cancelada')),
            created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_visita_listing ON visita_solicitud(listing_url)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_visita_estado  ON visita_solicitud(estado)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS visita_solicitud")
