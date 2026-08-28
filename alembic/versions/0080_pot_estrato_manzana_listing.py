"""Uso de suelo POT + estrato manzana a nivel listing.

analytics.listings_georef gana dos columnas point-in-polygon contra las
tablas geolocalizadas raw.pot_usos_medellin/raw.estratos_manzana (ambas
cargadas por scripts/load_estratos_pot.py, hoy huérfanas). Se calculan en
el refresh de cache.py (_INSERT_LISTINGS_GEOREF), no aquí — esta migración
solo agrega las columnas.

Cobertura real (verificada 2026-08-25, listings Medellín n=52,452):
  - estrato_manzana: 99.9% match directo.
  - uso_suelo_pot: 72.6% match directo, ~96% con buffer 30m (huecos de
    costura por reproyección EPSG:9377→4326, no zonas sin dato). El
    refresh usa el buffer.
Ambas tablas fuente son Medellín-only — listings de otros 9 municipios
del Valle de Aburrá quedan NULL, es esperado, no un bug.

Revision ID: 0080
Revises: 0079
"""
from alembic import op

revision = "0080"
down_revision = "0079"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE analytics.listings_georef
            ADD COLUMN IF NOT EXISTS uso_suelo_pot VARCHAR,
            ADD COLUMN IF NOT EXISTS estrato_manzana INTEGER
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE analytics.listings_georef
            DROP COLUMN IF EXISTS uso_suelo_pot,
            DROP COLUMN IF EXISTS estrato_manzana
    """)
