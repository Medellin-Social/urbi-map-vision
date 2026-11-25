"""listing_representante_abierto — agentes que representan un anuncio ABIERTO

Modelo "anuncio abierto": un listing publicado por una PERSONA NATURAL
(agent_id IS NULL, fuente propia) no es exclusivo de nadie. Varios agentes DE LA
ZONA hacen opt-in ("Sumarme") y rotan en el listing. Quien hace el due diligence
(DD) marca `es_verificador` → el listing gana el sello «Verificada» y ese agente
se lleva los puntos. La comisión es de quien reporte el cierre.

NO reutiliza `listing_representacion` (esa es del agent-program: representación de
listings SCRAPEADOS con UN aprobado por listing — invariante opuesto). Tabla aparte.

- listing_id       : nuestro listing (público.listing).
- agent_id         : el agente que se sumó.
- es_verificador   : hizo el DD de este listing → puntos + sello. A lo sumo uno.
- UNIQUE(listing_id, agent_id) : un agente aparece una sola vez por listing.

Revision ID: 0140
Revises: 0139
"""
from alembic import op

revision = "0140"
down_revision = "0139"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    CREATE TABLE IF NOT EXISTS listing_representante_abierto (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        listing_id     UUID NOT NULL REFERENCES listing(id) ON DELETE CASCADE,
        agent_id       UUID NOT NULL REFERENCES agent(id)   ON DELETE CASCADE,
        es_verificador BOOLEAN NOT NULL DEFAULT FALSE,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    )""")
    # Un agente aparece una sola vez por listing.
    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS uq_lra_listing_agent
        ON listing_representante_abierto(listing_id, agent_id)""")
    # A lo sumo UN verificador por listing (quien hizo el DD → puntos + sello).
    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS uq_lra_verificador
        ON listing_representante_abierto(listing_id) WHERE es_verificador""")
    # "Mis anuncios abiertos" del agente.
    op.execute("""CREATE INDEX IF NOT EXISTS idx_lra_agent
        ON listing_representante_abierto(agent_id)""")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS listing_representante_abierto")
