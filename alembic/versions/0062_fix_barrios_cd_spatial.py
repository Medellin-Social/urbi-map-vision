"""recompute analytics.barrios_cd.cd_comuna via spatial join, fix raw.barrios.comuna

Migration 0060 backfilled analytics.barrios_cd from raw.barrios.comuna (text),
which was itself corrupted on databases where barrios_cd was empty pre-0060
(e.g. prod). 0061 fixed the comuna text but derived it FROM the already-wrong
cd_comuna, leaving the underlying cd_comuna assignment wrong (self-consistent
but incorrect — e.g. barrio "BELEN" ended up under cd_comuna=12/LA AMERICA).

raw.comunas holds the official commune polygons (codigo 01-16). Recompute
cd_comuna by spatially containing each barrio's centroid, which is the
authoritative source independent of any text corruption. Then re-sync
raw.barrios.comuna from the corrected cd_comuna.

Revision ID: 0062
Revises: 0061
"""
from alembic import op

revision = "0062"
down_revision = "0061"
branch_labels = None
depends_on = None

_COMUNAS = [
    (1,  "POPULAR"), (2,  "SANTA CRUZ"), (3,  "MANRIQUE"), (4,  "ARANJUEZ"),
    (5,  "CASTILLA"), (6,  "DOCE DE OCTUBRE"), (7,  "ROBLEDO"), (8,  "VILLA HERMOSA"),
    (9,  "BUENOS AIRES"), (10, "LA CANDELARIA"), (11, "LAURELES ESTADIO"),
    (12, "LA AMERICA"), (13, "SAN JAVIER"), (14, "EL POBLADO"), (15, "GUAYABAL"),
    (16, "BELEN"),
]


def upgrade() -> None:
    # 1) Recompute cd_comuna from official polygons (raw.comunas), authoritative.
    op.execute("""
        INSERT INTO analytics.barrios_cd (barrio_id, cd_comuna)
        SELECT b.id, c.codigo::int
        FROM raw.barrios b
        JOIN raw.comunas c
          ON ST_Contains(c.geometry, ST_Centroid(b.geometry))
         AND c.codigo ~ '^[0-9]+$'
         AND c.codigo::int BETWEEN 1 AND 16
        WHERE b.municipio = 'MEDELLIN'
        ON CONFLICT (barrio_id) DO UPDATE SET cd_comuna = EXCLUDED.cd_comuna
    """)

    # 2) Re-sync raw.barrios.comuna display name from the corrected cd_comuna.
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
