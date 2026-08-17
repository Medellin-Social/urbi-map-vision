"""Agency invite: tabla para invitaciones de agencia a agentes por email

Revision ID: 0065
Revises: 0064
Create Date: 2026-08-13

token UUID generado por backend → enviado por email → agente lo usa para unirse.
expires_at = NOW() + 7 días por defecto.
estado: pendiente → aceptada | rechazada | vencida
"""
from alembic import op

revision = "0065"
down_revision = "0064"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS agency_invite (
            id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            agency_id   UUID        NOT NULL REFERENCES agency(id) ON DELETE CASCADE,
            email       TEXT        NOT NULL,
            token       UUID        NOT NULL UNIQUE DEFAULT gen_random_uuid(),
            estado      TEXT        NOT NULL DEFAULT 'pendiente'
                CHECK (estado IN ('pendiente', 'aceptada', 'rechazada', 'vencida')),
            agent_id    UUID        REFERENCES agent(id) ON DELETE SET NULL,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days'
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_agency_invite_token    ON agency_invite(token)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_agency_invite_email    ON agency_invite(email)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_agency_invite_agency   ON agency_invite(agency_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS agency_invite")
