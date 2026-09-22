"""Create public.aplicacion_referidor

Revision ID: 0088
Revises: 0087
Create Date: 2026-09-20

api/routers/afiliados.py y embajadores.py insertan en esta tabla desde que la
consolidación de esquema del 2026-08-23 (commit 68220f5) las apuntó aquí, pero
nunca quedó una migración — la tabla solo existía creada a mano en local. En
cualquier entorno sin ese CREATE manual (prod, un clone nuevo) ambos endpoints
de aplicar (afiliado/embajador) tiran 500 porque la tabla no existe.
"""
from alembic import op

revision = "0088"
down_revision = "0087"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.aplicacion_referidor (
            id          SERIAL PRIMARY KEY,
            tipo        VARCHAR NOT NULL CHECK (tipo IN ('afiliado', 'embajador')),
            nombre      VARCHAR NOT NULL,
            email       VARCHAR NOT NULL,
            telefono    VARCHAR,
            canal       VARCHAR,
            barrio_id   INTEGER REFERENCES raw.barrios(id),
            experiencia TEXT,
            motivacion  TEXT,
            estado      VARCHAR,
            ciudad_id   INTEGER REFERENCES ciudades(id),
            created_at  TIMESTAMP NOT NULL DEFAULT NOW()
        );
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS public.aplicacion_referidor;")
