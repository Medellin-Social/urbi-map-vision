"""Audit log de acciones admin — append-only, sin ruta de borrado/edición.

Capa de seguridad: qué admin hizo qué (aprobar agente, dar plan, etc), cuándo,
desde qué IP. Se lee en /panel-x9k2 pestaña Seguridad. No hay UPDATE/DELETE
expuesto — solo INSERT (desde _audit() en api/routers/admin.py) y SELECT.

Revision ID: 0078
Revises: 0077
"""
from alembic import op

revision = "0078"
down_revision = "0077"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS admin_audit_log (
            id          BIGSERIAL PRIMARY KEY,
            admin_email TEXT NOT NULL,
            accion      TEXT NOT NULL,
            entidad     TEXT NOT NULL,
            entidad_id  TEXT,
            detalle     JSONB,
            ip          TEXT,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created ON admin_audit_log(created_at DESC)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS admin_audit_log")
