"""fix raw.barrios.comuna names using authoritative cd_comuna lookup

raw.barrios.comuna has incorrect values for barrios in several Medellín communes
(e.g., barrios in BELÉN have commune='LA AMERICA'). The GeoJSON is authoritative;
analytics.barrios_cd holds the correct cd_comuna → we map that to the official name.

Revision ID: 0061
Revises: 0060_backfill_barrios_cd
"""
from alembic import op

revision = "0061"
down_revision = "0060"
branch_labels = None
depends_on = None

# Official Medellín commune names (matches GeoJSON nombre_comuna)
_COMUNAS = [
    (1,  "POPULAR"),
    (2,  "SANTA CRUZ"),
    (3,  "MANRIQUE"),
    (4,  "ARANJUEZ"),
    (5,  "CASTILLA"),
    (6,  "DOCE DE OCTUBRE"),
    (7,  "ROBLEDO"),
    (8,  "VILLA HERMOSA"),
    (9,  "BUENOS AIRES"),
    (10, "LA CANDELARIA"),
    (11, "LAURELES ESTADIO"),
    (12, "LA AMERICA"),
    (13, "SAN JAVIER"),
    (14, "EL POBLADO"),
    (15, "GUAYABAL"),
    (16, "BELEN"),
]


def upgrade() -> None:
    values = ", ".join(f"({cd}, '{name}')" for cd, name in _COMUNAS)
    op.execute(f"""
        UPDATE raw.barrios b
        SET    comuna = c.nombre
        FROM   analytics.barrios_cd bc
        JOIN   (VALUES {values}) AS c(cd, nombre) ON c.cd = bc.cd_comuna
        WHERE  bc.barrio_id = b.id
          AND  (b.comuna IS DISTINCT FROM c.nombre)
          AND  b.municipio = 'MEDELLIN'
    """)


def downgrade() -> None:
    pass  # data-only fix; original values not stored
