"""Create raw.favoritos_listings and raw.parametros_sistema if missing

Revision ID: 0030
Revises: 0029
Create Date: 2026-06-18

favoritos_listings is referenced in listings SQL (LEFT JOIN) and favoritos router.
parametros_sistema is loaded at startup by api/parametros.py.
Both must exist for the API to serve listings correctly.
"""
from alembic import op

revision = "0030"
down_revision = "0029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS raw.favoritos_listings (
            id          SERIAL PRIMARY KEY,
            usuario_id  INT NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
            url         TEXT NOT NULL,
            barrio_id   INT,
            created_at  TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE (usuario_id, url)
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_favoritos_usuario
        ON raw.favoritos_listings (usuario_id)
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS raw.parametros_sistema (
            nombre  TEXT PRIMARY KEY,
            valor   NUMERIC NOT NULL
        )
    """)
    op.execute("""
        INSERT INTO raw.parametros_sistema (nombre, valor) VALUES
            ('tasa_interes_anual',    0.12),
            ('inflacion_anual',       0.065),
            ('valorizacion_anual',    0.05),
            ('tasa_vacancia',         0.08),
            ('gastos_operacion_pct',  0.15),
            ('usd_to_cop',            4200),
            ('eur_to_cop',            4600)
        ON CONFLICT (nombre) DO NOTHING
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS raw.favoritos_listings")
    op.execute("DROP TABLE IF EXISTS raw.parametros_sistema")
