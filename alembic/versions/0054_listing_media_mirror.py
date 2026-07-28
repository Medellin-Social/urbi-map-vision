"""Espejo de fotos scrapeadas a R2 — tabla persistente keyed por url.

Revision ID: 0054
Revises: 0053
Create Date: 2026-07-15

Deja de depender de los CDN externos (fincaraiz/metrocuadrado) para servir las
fotos del mapa. El script semanal descarga la portada (y luego galería),
la sube a R2 bajo `listings/{media_uid}/...`, y guarda aquí el resultado.

Por qué tabla aparte y NO columna en stg_listings_unificado: esa tabla se
RECONSTRUYE en cada corrida del pipeline (recreate_stg_listings_unificado) →
una columna ahí se perdería cada semana. Esta persiste; stg la LEFT JOIN por url.

Diseño content-addressable:
- media_uid    → identificador estable del listing (folder en R2). Nunca cambia.
- content_hashes → sha256 por foto. Misma foto = mismo hash = no re-subir ni
  actualizar. Foto nueva = hash nuevo = subir. Foto que desaparece = se quita
  del array (soft-hide). Todo el diff sale de comparar este array.

Aditivo puro: no toca ninguna tabla existente.
"""
from alembic import op

revision = "0054"
down_revision = "0053"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS raw.listing_media_mirror (
            url            TEXT PRIMARY KEY,
            media_uid      UUID NOT NULL DEFAULT gen_random_uuid(),
            fuente         TEXT,
            portada_r2     TEXT,
            fotos_r2       TEXT[],
            content_hashes TEXT[],
            n_fotos        SMALLINT,
            activa         BOOLEAN     NOT NULL DEFAULT TRUE,
            first_seen     TIMESTAMPTZ NOT NULL DEFAULT now(),
            last_seen      TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    # media_uid único: es la clave del folder en R2, no puede colisionar.
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_listing_media_mirror_uid "
        "ON raw.listing_media_mirror (media_uid)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS raw.listing_media_mirror")
