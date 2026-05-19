"""baseline: initial schema

Revision ID: 0001
Revises:
Create Date: 2026-05-18

Captures the schema that already exists in production.
Running upgrade() on a fresh DB recreates all tables.
Running upgrade() against an already-migrated DB is safe — each
statement uses CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS usuarios (
            id              SERIAL PRIMARY KEY,
            email           TEXT NOT NULL UNIQUE,
            password_hash   TEXT NOT NULL,
            nombre          TEXT,
            apellido        TEXT,
            activo          BOOLEAN NOT NULL DEFAULT TRUE,
            email_verificado BOOLEAN NOT NULL DEFAULT FALSE,
            last_login      TIMESTAMPTZ,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS perfil_inversor (
            id              SERIAL PRIMARY KEY,
            usuario_id      INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
            objetivo        TEXT,
            riesgo          TEXT,
            presupuesto_min BIGINT,
            presupuesto_max BIGINT,
            horizonte_anos  INTEGER,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS token_blacklist (
            id          SERIAL PRIMARY KEY,
            token       TEXT NOT NULL UNIQUE,
            usuario_id  INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_token_blacklist_token ON token_blacklist(token)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS favoritos (
            id          SERIAL PRIMARY KEY,
            usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
            barrio_id   INTEGER NOT NULL,
            nota        TEXT,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (usuario_id, barrio_id)
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS historial (
            id          SERIAL PRIMARY KEY,
            usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
            tipo        TEXT NOT NULL,
            barrio_id   INTEGER,
            metadata    JSONB,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_historial_usuario ON historial(usuario_id, created_at DESC)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id          SERIAL PRIMARY KEY,
            usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
            token       TEXT NOT NULL UNIQUE,
            expires_at  TIMESTAMPTZ NOT NULL,
            used        BOOLEAN NOT NULL DEFAULT FALSE,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (usuario_id)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_prt_token ON password_reset_tokens(token)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS email_verification_tokens (
            id          SERIAL PRIMARY KEY,
            usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
            token       TEXT NOT NULL UNIQUE,
            expires_at  TIMESTAMPTZ NOT NULL,
            used        BOOLEAN NOT NULL DEFAULT FALSE,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (usuario_id)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_evt_token ON email_verification_tokens(token)")

    # Idempotent column additions for DB upgraded from older schema
    op.execute("""
        ALTER TABLE usuarios
        ADD COLUMN IF NOT EXISTS email_verificado BOOLEAN NOT NULL DEFAULT FALSE
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS email_verification_tokens")
    op.execute("DROP TABLE IF EXISTS password_reset_tokens")
    op.execute("DROP TABLE IF EXISTS historial")
    op.execute("DROP TABLE IF EXISTS favoritos")
    op.execute("DROP TABLE IF EXISTS token_blacklist")
    op.execute("DROP TABLE IF EXISTS perfil_inversor")
    op.execute("DROP TABLE IF EXISTS usuarios")
