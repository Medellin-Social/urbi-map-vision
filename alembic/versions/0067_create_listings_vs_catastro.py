"""create analytics.listings_vs_catastro if not exists

api/routers/listings.py's _LISTING_BY_ID_SQL LEFT JOINs a subquery over this
table (avaluo_m2_catastro, grouped by cd_comuna) on EVERY GET /listings/{id}
call. The table exists locally (42.9k rows, generated ad-hoc — never went
through a migration) but was never created in prod, so the relation is
simply missing there: every listing detail lookup in prod throws
"relation \"analytics.listings_vs_catastro\" does not exist" and 500s —
breaking the listing detail drawer for every single listing. Mirrors 0063's
and 0066's approach: an empty stub so the LEFT JOIN resolves to 0 rows
instead of throwing. Backfilling the real catastro data is a separate task.

Revision ID: 0067
Revises: 0066
"""
from alembic import op

revision = "0067"
down_revision = "0066"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS analytics.listings_vs_catastro (
            listing_uid                text,
            fuente                     text,
            tier                       text,
            tipo_operacion             text,
            tipo_inmueble              text,
            precio_cop                 numeric,
            precio_m2                  numeric,
            area_m2                    numeric,
            habitaciones               integer,
            banos                      numeric,
            barrio_raw                 text,
            barrio_id                  integer,
            barrio_comuna              text,
            lat                        double precision,
            lon                        double precision,
            geom                       geometry,
            url                        text,
            n_duplicados               bigint,
            precio_variable            boolean,
            fecha_scraping             timestamptz,
            cd_comuna                  integer,
            n_predios_catastro         bigint,
            avaluo_m2_catastro         numeric,
            avaluo_m2_catastro_mediana double precision,
            area_construccion_prom    numeric,
            catastro_nivel             text,
            ratio_mercado_catastro     numeric,
            categoria_precio_catastro  text
        );
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS analytics.listings_vs_catastro;")
