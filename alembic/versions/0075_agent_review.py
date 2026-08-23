"""Reseñas de agentes — /agentes pide rating con estrellas real, no inventado

Trust model: login-gated (get_current_user), UNIQUE(agent_id, user_id) — un
usuario, una reseña por agente. ponytail: sin cola de moderación; agregar si
aparece abuso. Sin esa cola no hace falta columna estado — toda fila visible
ya viene de un usuario autenticado real.

Revision ID: 0075
Revises: 0074
"""
from alembic import op

revision = "0075"
down_revision = "0074"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS agent_review (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            agent_id    UUID NOT NULL REFERENCES agent(id) ON DELETE CASCADE,
            user_id     INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
            calificacion SMALLINT NOT NULL CHECK (calificacion BETWEEN 1 AND 5),
            comentario  TEXT,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (agent_id, user_id)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_agent_review_agent ON agent_review(agent_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS agent_review")
