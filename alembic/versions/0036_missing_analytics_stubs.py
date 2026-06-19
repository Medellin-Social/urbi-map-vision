"""Create stub analytics tables missing from prod DB (part 2)

Revision ID: 0036
Revises: 0035
Create Date: 2026-06-19

analytics.score_largo_plazo and analytics.barrios_oportunidades are referenced
in barrios SQL, oportunidades router, and stats/ciudad but were never created
via alembic — they only existed locally (populated by dbt). Without these tables
asyncpg fails at query PREPARE time causing HTTP 500 on every request to those
endpoints.
"""
from alembic import op

revision = "0036"
down_revision = "0035"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS analytics.score_largo_plazo (
            barrio_id               INT PRIMARY KEY,
            estrato_barrio          INT,
            var_anual_5anos_pct     NUMERIC,
            tendencia_valorizacion  TEXT
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS analytics.barrios_oportunidades (
            barrio_id               INT PRIMARY KEY,
            nombre_barrio           TEXT,
            comuna                  TEXT,
            municipio               TEXT,
            oportunidad_detectada   BOOLEAN DEFAULT FALSE,
            tipo_oportunidad        TEXT,
            descripcion_oportunidad TEXT,
            estado_precio           TEXT
        )
    """)


def downgrade() -> None:
    pass
