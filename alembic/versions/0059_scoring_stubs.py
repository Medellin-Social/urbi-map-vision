"""Add scoring stub tables needed by barrios endpoint and cache.py

Revision ID: 0059
Revises: 0058
Create Date: 2026-07-28

These tables are populated by an external scoring pipeline.
Stubs ensure the barrios API and cache.py work on fresh DB
while scoring data is absent (all LEFT JOINs return NULLs).
"""
from alembic import op

revision = "0059"
down_revision = "0058"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS analytics.barrios_score_consolidado (
            barrio_id             integer,
            nombre_barrio         text,
            comuna                text,
            municipio             text,
            score_corto           integer,
            categoria_corto       text,
            color_corto           text,
            pts_yield_airbnb      integer,
            score_mediano         numeric,
            categoria_mediano     text,
            color_mediano         text,
            pts_yield_medio       integer,
            score_largo           integer,
            categoria_largo       text,
            color_largo           text,
            pts_yield_largo       integer,
            perfil_recomendado    text,
            precio_m2_venta_p50   numeric,
            arriendo_p50          numeric,
            estado_precio         text,
            yield_airbnb_pct      numeric,
            yield_bruto_pct       numeric,
            yield_renta_media_pct numeric,
            liquidez_score        integer,
            categoria_liquidez    text,
            tiempo_estimado_venta text,
            nota_metodologia      text,
            indice_verde_pct      numeric,
            categoria_verde       text,
            score_verde           integer,
            pct_wifi              numeric,
            pct_ac                numeric,
            pct_kitchen           numeric,
            pct_washer            numeric,
            score_equipamiento    integer,
            calculado_en          timestamptz
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS analytics.barrios_liquidez (
            barrio_id             integer,
            liquidez_score        integer,
            categoria_liquidez    text,
            tiempo_estimado_venta text
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS analytics.score_corto_plazo (
            barrio_id       integer,
            score_corto     integer,
            categoria_corto text,
            color_corto     text
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS analytics.barrios_renta_media (
            barrio_id             integer,
            yield_renta_media_pct numeric,
            arriendo_medio_cop    numeric,
            n_listings            integer
        )
    """)
    # barrios_mercado stub needs all columns queried by the barrios endpoint
    op.execute("""
        ALTER TABLE analytics.barrios_mercado
          ADD COLUMN IF NOT EXISTS precio_venta_m2_p50      numeric,
          ADD COLUMN IF NOT EXISTS precio_venta_promedio     numeric,
          ADD COLUMN IF NOT EXISTS precio_arriendo_p50       numeric,
          ADD COLUMN IF NOT EXISTS ratio_precio_arriendo     numeric,
          ADD COLUMN IF NOT EXISTS pbn_precio_justo_m2       numeric,
          ADD COLUMN IF NOT EXISTS poi_precio_oferta         numeric,
          ADD COLUMN IF NOT EXISTS ocupacion_airbnb_pct      numeric,
          ADD COLUMN IF NOT EXISTS adr_noche_cop             numeric,
          ADD COLUMN IF NOT EXISTS yield_airbnb_pct          numeric,
          ADD COLUMN IF NOT EXISTS zona_turistica            boolean,
          ADD COLUMN IF NOT EXISTS precio_renta_media_p50    numeric,
          ADD COLUMN IF NOT EXISTS n_listings_renta_media    bigint,
          ADD COLUMN IF NOT EXISTS premium_vs_largo_pct      numeric
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS analytics.barrios_score_consolidado")
    op.execute("DROP TABLE IF EXISTS analytics.barrios_liquidez")
    op.execute("DROP TABLE IF EXISTS analytics.score_corto_plazo")
    op.execute("DROP TABLE IF EXISTS analytics.barrios_renta_media")
