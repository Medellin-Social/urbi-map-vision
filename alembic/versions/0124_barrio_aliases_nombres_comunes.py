"""Más aliases de barrio: nombres comunes/populares + polígonos malformados

La barra de búsqueda resuelve nombres populares vía raw.barrio_alias (ver 0104:
Ciudad del Río, Provenza). Aquí se agregan los que faltaban, en 3 grupos:

1. Nombre popular ≠ polígono oficial (confirmado con fuentes):
   - "Barrio Triste"    → 192 CORAZON DE JESUS (comuna 10)  — nombre popular histórico
   - "Barrio Antioquia" → 263 TRINIDAD (comuna 15 Guayabal) — nombre oficial hasta 1950, aún en uso
   - "Parque Lleras"/"Lleras" → 236 EL POBLADO — zona rosa

2. Polígono MALFORMADO en raw.barrios (sin espacio) → el usuario que teclea el
   nombre bien escrito no lo encontraba por nombre; el alias lo resuelve:
   - "Corazón de Jesús" → 192 (polígono 'CORAZON DEJESUS')
   - "El Tesoro"        → 241 (polígono 'ELTESORO')
   - "La Linde"         → 234 (polígono 'LALINDE')
   - "San Lucas"        → 247 (polígono 'SANLUCAS')

3. Formato/abreviación de Robledo (comuna 7):
   - "Aures 1" → 27, "Aures 2" → 26  (polígono 'AURES #1/#2')
   - "López de Mesa" → 29            (polígono 'LUIS LÓPEZ DE MESA')
   - "Facultad de Minas" → 46        (polígono 'UNIVERSIDAD NACIONAL FACULTAD DE MINAS')

NO se renombra raw.barrios.nombre: ese valor es join key contra los estáticos del
front (barrios_comunas.json / barrios_medellin.geojson / barrios_stats.json) y
renombrarlo rompería esos joins. El alias agrega el nombre buscable sin tocar la key.

Idempotente (ON CONFLICT DO NOTHING) y reversible. Revisa 0104 para el origen.

Revision ID: 0124
Revises: 0123
Create Date: 2026-11-14
"""
from alembic import op

revision = "0124"
down_revision = "0123"
branch_labels = None
depends_on = None

# (alias_norm, display, barrio_id, nota) — alias_norm = query normalizada (minúsculas, sin tildes)
_ALIASES = [
    ("barrio triste", "Barrio Triste", 192, "popular; oficial CORAZON DE JESUS (comuna 10 La Candelaria)"),
    ("barrio antioquia", "Barrio Antioquia", 263, "oficial TRINIDAD (comuna 15 Guayabal); nombre hasta 1950, aun en uso"),
    ("parque lleras", "Parque Lleras", 236, "zona rosa, barrio EL POBLADO"),
    ("lleras", "Lleras", 236, "Parque Lleras, barrio EL POBLADO"),
    ("corazon de jesus", "Corazón de Jesús", 192, "poligono CORAZON DEJESUS sin espacio"),
    ("el tesoro", "El Tesoro", 241, "poligono ELTESORO sin espacio"),
    ("la linde", "La Linde", 234, "poligono LALINDE sin espacio"),
    ("san lucas", "San Lucas", 247, "poligono SANLUCAS sin espacio"),
    ("aures 1", "Aures 1", 27, "poligono AURES #1"),
    ("aures 2", "Aures 2", 26, "poligono AURES #2"),
    ("lopez de mesa", "López de Mesa", 29, "poligono LUIS LOPEZ DE MESA"),
    ("facultad de minas", "Facultad de Minas", 46, "poligono UNIVERSIDAD NACIONAL FACULTAD DE MINAS"),
]


def upgrade() -> None:
    # La tabla ya existe (0104); el guardia CREATE IF NOT EXISTS la protege si 0104
    # no corrió por alguna razón.
    op.execute("""
        CREATE TABLE IF NOT EXISTS raw.barrio_alias (
            alias_norm TEXT PRIMARY KEY,
            alias      TEXT NOT NULL,
            barrio_id  INTEGER NOT NULL,
            nota       TEXT
        )
    """)
    for norm, alias, bid, nota in _ALIASES:
        # SELECT desde raw.barrios valida que el barrio_id exista (si no, no inserta).
        op.execute(f"""
            INSERT INTO raw.barrio_alias (alias_norm, alias, barrio_id, nota)
            SELECT '{norm}', '{alias}', b.id, '{nota}'
            FROM raw.barrios b WHERE b.id = {bid}
            ON CONFLICT (alias_norm) DO NOTHING
        """)


def downgrade() -> None:
    norms = ", ".join(f"'{a[0]}'" for a in _ALIASES)
    op.execute(f"DELETE FROM raw.barrio_alias WHERE alias_norm IN ({norms})")
