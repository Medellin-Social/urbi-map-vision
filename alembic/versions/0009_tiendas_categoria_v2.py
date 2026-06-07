"""feat: tiendas — expand categoria CHECK to full service taxonomy

Revision ID: 0009
Revises: 0008
Create Date: 2026-06-04
"""
from alembic import op

revision = "0009"
down_revision = "0008a"
branch_labels = None
depends_on = None

_CATEGORIAS = (
    # Gastronomía
    "brunch", "almuerzo", "cena", "bares", "cafes",
    "comida_rapida", "panaderia", "asiatica",
    # Salud & Belleza
    "medicos", "dentistas", "dermatologia", "fisioterapia",
    "masajes_spa", "peluquerias", "estetica",
    # Fitness
    "gimnasios", "yoga",
    # Servicios del hogar
    "remodelaciones", "plomeria", "electricistas",
    "mudanzas", "cerrajeria", "jardineria",
    # Más servicios
    "bancos", "mascotas", "parqueaderos", "segunda_mano",
    # Manual / otros
    "agente_inmobiliario", "otro",
)


def upgrade() -> None:
    op.execute("TRUNCATE TABLE public.tiendas RESTART IDENTITY")
    op.execute("ALTER TABLE public.tiendas DROP CONSTRAINT IF EXISTS tiendas_categoria_check")
    op.execute(f"ALTER TABLE public.tiendas ADD CONSTRAINT tiendas_categoria_check CHECK (categoria IN {_CATEGORIAS})")


def downgrade() -> None:
    op.execute("ALTER TABLE public.tiendas DROP CONSTRAINT IF EXISTS tiendas_categoria_check")
