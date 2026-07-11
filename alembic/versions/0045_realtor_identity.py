"""Realtor identity model: agency, agent, agency_member, owner

Revision ID: 0045
Revises: 0044
Create Date: 2026-07-10

Tablas nuevas para el flujo de realtors. No toca agentes (portal viejo),
scrapers ni barrios. agent.usuario_id y owner.usuario_id son FK nullable
a public.usuarios para montar perfiles sobre la auth existente.

Un agente independiente = agency(tipo='independiente') + agency_member(rol='owner').
CHECK en agent garantiza que estado='activo' requiere usuario_id (cuenta auth).
"""
from alembic import op

revision = "0045"
down_revision = "0044"
branch_labels = None
depends_on = None

# Postgres no soporta CREATE TYPE IF NOT EXISTS — bloque DO con handler.
_CREATE_ENUMS = """
DO $$ BEGIN
    CREATE TYPE agency_tipo AS ENUM ('independiente', 'agencia');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE agent_estado AS ENUM ('pendiente', 'activo', 'rechazado');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE agency_member_rol AS ENUM ('owner', 'agente');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
"""

_DROP_ENUMS = """
DROP TYPE IF EXISTS agency_member_rol;
DROP TYPE IF EXISTS agent_estado;
DROP TYPE IF EXISTS agency_tipo;
"""


def upgrade() -> None:
    op.execute(_CREATE_ENUMS)

    op.execute("""
        CREATE TABLE IF NOT EXISTS agency (
            id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            nombre     TEXT        NOT NULL,
            nit        TEXT,
            tipo       agency_tipo NOT NULL DEFAULT 'independiente',
            verificada BOOLEAN     NOT NULL DEFAULT FALSE,
            plan       TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS agent (
            id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
            usuario_id INT          REFERENCES public.usuarios(id) ON DELETE SET NULL,
            email      TEXT         NOT NULL UNIQUE,
            nombre     TEXT         NOT NULL,
            telefono   TEXT         NOT NULL,
            foto_url   TEXT,
            estado     agent_estado NOT NULL DEFAULT 'pendiente',
            created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            CONSTRAINT chk_agent_activo_requires_usuario
                CHECK (estado <> 'activo' OR usuario_id IS NOT NULL)
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS agency_member (
            agency_id UUID              NOT NULL REFERENCES agency(id) ON DELETE CASCADE,
            agent_id  UUID              NOT NULL REFERENCES agent(id)  ON DELETE CASCADE,
            rol       agency_member_rol NOT NULL DEFAULT 'agente',
            PRIMARY KEY (agency_id, agent_id)
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS owner (
            id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            usuario_id INT         REFERENCES public.usuarios(id) ON DELETE SET NULL,
            nombre     TEXT        NOT NULL,
            email      TEXT        NOT NULL UNIQUE,
            telefono   TEXT        NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    op.execute("CREATE INDEX IF NOT EXISTS idx_agent_estado   ON agent(estado)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_agent_usuario  ON agent(usuario_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_owner_usuario  ON owner(usuario_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_agmem_agent_id ON agency_member(agent_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS owner")
    op.execute("DROP TABLE IF EXISTS agency_member")
    op.execute("DROP TABLE IF EXISTS agent")
    op.execute("DROP TABLE IF EXISTS agency")
    op.execute(_DROP_ENUMS)
