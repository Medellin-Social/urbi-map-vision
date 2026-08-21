"""create raw.listings_casadolcecasa if not exists

cache.py's stg_listings_unificado UNION ALL is about to gain a branch reading
this table (Casa Dolce Casa — sponsored agency partner, tier=agencia_premium).
Prod never received it from scraping; mirrors 0063's approach for
listings_metrocuadrado — an empty stub so the UNION ALL resolves to 0 rows
instead of throwing and silently killing the whole cache refresh. DDL mirrors
scripts/load_casadolcecasa.py verbatim.

Revision ID: 0066
Revises: 0065
"""
from alembic import op

revision = "0066"
down_revision = "0065"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS raw.listings_casadolcecasa (
            id              bigint PRIMARY KEY,
            codigo          text,
            fuente          text DEFAULT 'casadolcecasa',
            tipo_operacion  text,
            tipo_inmueble   text,
            precio          numeric,
            area_m2         numeric,
            habitaciones    integer,
            banos           integer,
            parqueaderos    smallint,
            piso            smallint,
            estrato_real    integer,
            antiguedad      text,
            direccion_raw   text,
            barrio_raw      text,
            municipio_raw   text,
            lat             numeric,
            lon             numeric,
            geom            geometry(Point, 4326),
            barrio_id       integer,
            amenidades      text[],
            fotos           text[],
            descripcion     text,
            url             text,
            dedup_hash      varchar,
            activo          boolean DEFAULT true,
            raw_data        jsonb,
            fecha_scraping  timestamptz DEFAULT now()
        );
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS raw.listings_casadolcecasa;")
