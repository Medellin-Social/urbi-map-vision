"""FASE B: soltar FK listings_propios.agente_id -> agentes

Revision ID: 0052
Revises: 0051
Create Date: 2026-07-12

Borrado del Portal de Agentes viejo (tabla `agentes` SERIAL). Antes de dropear
`agentes` (Fase E) hay que soltar el único FK que la referencia desde una tabla
que SE CONSERVA: `listings_propios` (publicación de propietarios y agentes, feed
del mapa via cache fuente='propio').

Solo se elimina el CONSTRAINT. La columna `listings_propios.agente_id` y la
tabla se quedan intactas — el router listings_propios sigue funcionando.

Nota: el FK original era ON DELETE CASCADE (borrar un agente borraba sus
listings). Soltarlo también elimina ese cascade peligroso antes del DROP.

Idempotente (DROP CONSTRAINT IF EXISTS). Reversible mientras `agentes` exista.
"""
from alembic import op

revision = "0052"
down_revision = "0051"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE public.listings_propios "
        "DROP CONSTRAINT IF EXISTS listings_propios_agente_id_fkey"
    )


def downgrade() -> None:
    # Re-crea el FK original (ON DELETE CASCADE). Solo válido mientras `agentes`
    # exista; tras Fase E (DROP agentes) este downgrade ya no aplica.
    op.execute(
        "ALTER TABLE public.listings_propios "
        "ADD CONSTRAINT listings_propios_agente_id_fkey "
        "FOREIGN KEY (agente_id) REFERENCES public.agentes(id) ON DELETE CASCADE"
    )
