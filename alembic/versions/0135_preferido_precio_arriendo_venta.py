"""Realtor Preferido: precio separado arriendo / venta (reunión 21-nov-2026)

Fuente: Fathom 21-nov (Israel + Ken). Cada zona tiene dos precios mensuales:
"list" (arriendo) y "sale" (venta). Se agregan precio_arriendo y precio_venta.
`precio_mensual` se conserva (lo lee el servicio/checkout hoy) y se iguala al
precio de arriendo hasta que el checkout elija por tipo.

Solo se cargan los niveles que dio la reunión; los demás (barrio B/D, comuna D)
quedan como estaban (ejemplo, COP). Los precios de la reunión están en USD
(confirmado por Israel: "Ken habló en dólares") y se marcan es_ejemplo = FALSE.

Revision ID: 0135
Revises: 0134
"""
from alembic import op

revision = "0135"
down_revision = "0134"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE realtor_preferido_precio ADD COLUMN IF NOT EXISTS precio_arriendo NUMERIC")
    op.execute("ALTER TABLE realtor_preferido_precio ADD COLUMN IF NOT EXISTS precio_venta NUMERIC")
    op.execute("ALTER TABLE realtor_preferido_precio ADD COLUMN IF NOT EXISTS moneda TEXT")
    op.execute("""
    UPDATE realtor_preferido_precio p
       SET precio_arriendo = v.arr, precio_venta = v.ven, precio_mensual = v.arr,
           es_ejemplo = FALSE, moneda = 'USD'
      FROM (VALUES
        ('comuna','A',4995,2500), ('comuna','B',2995,1495), ('comuna','C',1495,995),
        ('barrio','A',1500,750),  ('barrio','C',750,375)
      ) AS v(zona_nivel, nivel, arr, ven)
     WHERE p.zona_nivel = v.zona_nivel AND p.nivel = v.nivel
    """)
    # Filas sin precio de la reunión: siguen siendo ejemplo, en COP (seed de 0129).
    op.execute("UPDATE realtor_preferido_precio SET moneda = 'COP' WHERE moneda IS NULL")


def downgrade() -> None:
    op.execute("ALTER TABLE realtor_preferido_precio DROP COLUMN IF EXISTS moneda")
    op.execute("ALTER TABLE realtor_preferido_precio DROP COLUMN IF EXISTS precio_venta")
    op.execute("ALTER TABLE realtor_preferido_precio DROP COLUMN IF EXISTS precio_arriendo")
