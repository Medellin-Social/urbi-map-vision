"""feat: tabla lateral de traducciones de descripciones de listings (es<->en)

Traducción offline bidireccional (Opus-MT/CTranslate2, ver scripts/traductor.py).
Keyed por url —la misma clave que usan los JOIN de descripción (lm/lf/lp por
l.url)— para sobrevivir a cualquier patrón de escritura de las tablas raw (upsert
o truncate) sin tocar los loaders. src_lang = idioma detectado del source;
descripcion_trad = traducción al idioma OPUESTO (el front muestra source o
traducción según el idioma elegido). src_hash detecta cambios de la fuente para
retraducir. La llena scripts/translate_descripciones.py desde el cron.

Revision ID: 0094
Revises: 0093
Create Date: 2026-09-24
"""
from alembic import op

revision = "0094"
down_revision = "0093"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS raw.descripcion_traduccion (
            url             TEXT PRIMARY KEY,
            src_lang        TEXT NOT NULL,   -- 'es' | 'en' (idioma del source)
            descripcion_trad TEXT,           -- traducción al idioma opuesto a src_lang
            src_hash        TEXT NOT NULL,
            updated_at      TIMESTAMPTZ DEFAULT NOW()
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS raw.descripcion_traduccion")
