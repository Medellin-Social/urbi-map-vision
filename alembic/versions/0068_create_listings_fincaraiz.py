"""create raw.listings_fincaraiz if not exists

Same failure mode as 0067: api/routers/listings.py's _LISTING_BY_ID_SQL LEFT
JOINs raw.listings_fincaraiz on every GET /listings/{id}. The table doesn't
exist in prod at all (confirmed via information_schema — not a permissions
or search_path issue), so every listing detail call throws "relation
does not exist" and 500s, on top of the listings_vs_catastro gap fixed in
0067.

staging.stg_listings_unificado (the materialized table cache.py builds)
still holds 31k rows with fuente='fincaraiz' in prod — a frozen snapshot
from before this table disappeared. Since cache.py's own refresh query
UNION ALLs FROM raw.listings_fincaraiz too, the scheduled cache refresh is
very likely failing in prod right now for the same reason; that data
pipeline gap is a separate, bigger follow-up (needs a decision on whether
to backfill or drop the source), not folded into this migration.

Stub only — no indexes/constraints/triggers (mirrors 0063/0066: existence
is all _LISTING_BY_ID_SQL's LEFT JOIN needs to stop crashing).

Revision ID: 0068
Revises: 0067
"""
from alembic import op

revision = "0068"
down_revision = "0067"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS raw.listings_fincaraiz (
            id                      serial PRIMARY KEY,
            fuente                  text DEFAULT 'fincaraiz',
            tipo_operacion          text,
            tipo_inmueble           text,
            precio                  numeric,
            area_m2                 numeric,
            habitaciones            integer,
            banos                   integer,
            direccion_raw           text,
            barrio_raw              text,
            url                     text,
            fecha_scraping          timestamptz DEFAULT now(),
            activo                  boolean DEFAULT true,
            barrio_id               integer,
            raw_data                jsonb,
            fecha_publicacion       date,
            dias_en_mercado         integer,
            dedup_hash              varchar,
            geom                    geometry(Point, 4326),
            lat                     numeric(10,6),
            lon                     numeric(10,6),
            municipio_raw           text,
            estrato_real            integer,
            url_activa              boolean,
            url_validada_at         timestamp,
            fecha_primera_vez       timestamp DEFAULT now(),
            fecha_ultima_vez_activa timestamp,
            descripcion             text,
            amenidades              text[],
            fotos                   text[],
            parqueaderos            smallint,
            piso                    smallint,
            antiguedad              text,
            administracion          numeric
        );
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS raw.listings_fincaraiz;")
