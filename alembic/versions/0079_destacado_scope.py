"""Alcance de destacado (barrio | comuna | ciudad) en tiendas y eventos.

Extiende el booleano `destacado` (ya existía, sin alcance) con dónde debe
aparecer arriba: solo en su barrio, en toda su comuna, o en toda la ciudad
(listado "todos"). Mismo patrón que `sponsorship.zona_nivel`/`zona_codigo`
(0047) pero sin FK — zona_codigo es barrio_id o cd_comuna como texto, NULL
cuando nivel='ciudad'. NULL en destacado_nivel con destacado=true (filas
existentes antes de esta migración) se trata como 'ciudad' en las queries
públicas — comportamiento previo preservado, sin regresión.

Revision ID: 0079
Revises: 0078
"""
from alembic import op

revision = "0079"
down_revision = "0078"
branch_labels = None
depends_on = None

_TABLES = ("tiendas", "eventos")


def upgrade() -> None:
    for t in _TABLES:
        op.execute(f"""
            ALTER TABLE public.{t}
                ADD COLUMN IF NOT EXISTS destacado_nivel VARCHAR
                    CHECK (destacado_nivel IN ('barrio', 'comuna', 'ciudad')),
                ADD COLUMN IF NOT EXISTS destacado_zona_codigo VARCHAR
        """)


def downgrade() -> None:
    for t in _TABLES:
        op.execute(f"""
            ALTER TABLE public.{t}
                DROP COLUMN IF EXISTS destacado_nivel,
                DROP COLUMN IF EXISTS destacado_zona_codigo
        """)
