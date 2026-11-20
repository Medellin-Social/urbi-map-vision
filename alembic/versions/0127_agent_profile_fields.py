"""Campos de perfil público del agente + consentimiento en el lead

Revision ID: 0127
Revises: 0126
Create Date: 2026-11-17

Perfil público de agente estilo realtor.com (ver docs/FLUJO_REALTOR.md). Campos de
ficha que hoy no existen en `agent`, aprobados por el usuario:
  - slug          : ruta /agentes/<slug> (backfill de los existentes; los inserts
                    de alta de agente deben poblarlo — ver código).
  - ciudad_id     : discriminador multi-ciudad (convención del repo = ciudades.id;
                    los 10 agentes actuales son de Medellín = 1).
  - anios_experiencia, idiomas, especialidades, licencias, titulo : ficha,
                    NULL hasta que el agente los complete en su dashboard (no se
                    inventan datos).
  - agency.logo_url : logo de la inmobiliaria en el header.

Y el formulario de contacto público escribe en visita_solicitud (lead ya ruteado
al agente por agent_id). Se agrega consentimiento (Ley 1581) al lead.

Migración ADITIVA (carril alembic, CLAUDE.md). El slug queda UNIQUE; se permite
NULL (índice unique ignora NULLs) por si un insert futuro no lo setea, pero el
backfill cubre a todos los existentes.
"""
from alembic import op

revision = "0127"
down_revision = "0126"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── agent: campos de ficha ────────────────────────────────────────────────
    op.execute("ALTER TABLE agent ADD COLUMN IF NOT EXISTS slug              TEXT")
    op.execute("ALTER TABLE agent ADD COLUMN IF NOT EXISTS ciudad_id         INTEGER NOT NULL DEFAULT 1 REFERENCES ciudades(id)")
    op.execute("ALTER TABLE agent ADD COLUMN IF NOT EXISTS anios_experiencia SMALLINT")
    op.execute("ALTER TABLE agent ADD COLUMN IF NOT EXISTS idiomas           TEXT[]")
    op.execute("ALTER TABLE agent ADD COLUMN IF NOT EXISTS especialidades    TEXT[]")
    op.execute("ALTER TABLE agent ADD COLUMN IF NOT EXISTS licencias         JSONB")
    op.execute("ALTER TABLE agent ADD COLUMN IF NOT EXISTS titulo            TEXT")

    # Backfill slug de los existentes: nombre normalizado + 6 chars del uuid
    # (garantiza unicidad aunque dos agentes se llamen igual).
    op.execute("""
        UPDATE agent
        SET slug = regexp_replace(lower(trim(nombre)), '[^a-z0-9]+', '-', 'g')
                   || '-' || substr(id::text, 1, 6)
        WHERE slug IS NULL
    """)
    # Limpia guiones de borde que deje el regexp ('José ' -> 'jos--xxxxxx').
    op.execute("UPDATE agent SET slug = regexp_replace(slug, '-+', '-', 'g')")
    op.execute("UPDATE agent SET slug = trim(both '-' from slug) WHERE slug LIKE '-%' OR slug LIKE '%-'")

    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_slug ON agent(slug)")

    # ── agency: logo ──────────────────────────────────────────────────────────
    op.execute("ALTER TABLE agency ADD COLUMN IF NOT EXISTS logo_url TEXT")

    # ── visita_solicitud: consentimiento del lead (form de contacto público) ──
    op.execute("ALTER TABLE visita_solicitud ADD COLUMN IF NOT EXISTS consentimiento    BOOLEAN NOT NULL DEFAULT false")
    op.execute("ALTER TABLE visita_solicitud ADD COLUMN IF NOT EXISTS consentimiento_at TIMESTAMPTZ")


def downgrade() -> None:
    op.execute("ALTER TABLE visita_solicitud DROP COLUMN IF EXISTS consentimiento_at")
    op.execute("ALTER TABLE visita_solicitud DROP COLUMN IF EXISTS consentimiento")
    op.execute("ALTER TABLE agency DROP COLUMN IF EXISTS logo_url")
    op.execute("DROP INDEX IF EXISTS uq_agent_slug")
    op.execute("ALTER TABLE agent DROP COLUMN IF EXISTS titulo")
    op.execute("ALTER TABLE agent DROP COLUMN IF EXISTS licencias")
    op.execute("ALTER TABLE agent DROP COLUMN IF EXISTS especialidades")
    op.execute("ALTER TABLE agent DROP COLUMN IF EXISTS idiomas")
    op.execute("ALTER TABLE agent DROP COLUMN IF EXISTS anios_experiencia")
    op.execute("ALTER TABLE agent DROP COLUMN IF EXISTS ciudad_id")
    op.execute("ALTER TABLE agent DROP COLUMN IF EXISTS slug")
