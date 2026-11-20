"""Listing — columna caracteristicas JSONB (ficha rica de realtor)

Revision ID: 0128
Revises: 0127
Create Date: 2026-11-19

Catch-all estructurado para la info que un realtor diligencia y que no tiene su
propia columna: año de construcción, área privada/construida, estado/condición,
orientación, niveles, parqueadero cubierto, piso (antes se recogía en el form y
se descartaba del INSERT), y campos por operación (arriendo: depósito, requisitos,
servicios incluidos, disponible-desde; venta: negociable, permuta, crédito,
comisión). Una sola columna JSONB = extensible sin migración-por-campo (mismo
patrón que `declaraciones` 0048 y `raw_data` de los scrapers).

El detalle del mapa (lee de staging) la muestra sin tocar el refresh de cache: el
query hace LEFT JOIN de vuelta a `listing` por `listing.id::text = staging.url`
(para 'propio' el url de staging ES el uuid del listing). Migración ADITIVA
(carril alembic, CLAUDE.md).
"""
from alembic import op

revision = "0128"
down_revision = "0127"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE listing ADD COLUMN IF NOT EXISTS caracteristicas JSONB")


def downgrade() -> None:
    op.execute("ALTER TABLE listing DROP COLUMN IF EXISTS caracteristicas")
