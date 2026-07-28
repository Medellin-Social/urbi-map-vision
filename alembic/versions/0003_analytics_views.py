"""analytics views: score_mediano_plazo VIEW + analytics schema guard

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-30
"""
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

_VIEW_SQL = """
CREATE OR REPLACE VIEW analytics.score_mediano_plazo AS
WITH base AS (
    SELECT
        bm.barrio_id,
        bm.yield_renta_media_pct,
        bm.yield_bruto,
        bm.estado_precio,
        poi.n_cafes_500m,
        poi.n_coworking_1km,
        poi.n_gimnasios_1km,
        poi.indice_nomada,
        seg.score_seguridad_residente       AS seguridad_score
    FROM analytics.barrios_mercado          bm
    LEFT JOIN analytics.barrios_pois_distancia poi ON bm.barrio_id = poi.barrio_id
    LEFT JOIN analytics.barrios_seguridad   seg ON bm.barrio_id = seg.barrio_id
),
yield_score AS (
    SELECT
        barrio_id,
        CASE
            WHEN yield_renta_media_pct IS NOT NULL THEN
                CASE
                    WHEN yield_renta_media_pct >= 12 THEN 45
                    WHEN yield_renta_media_pct >= 10 THEN 36
                    WHEN yield_renta_media_pct >= 8  THEN 28
                    WHEN yield_renta_media_pct >= 6  THEN 18
                    WHEN yield_renta_media_pct >= 4  THEN 9
                    ELSE 2
                END
            WHEN yield_bruto IS NOT NULL THEN
                CASE
                    WHEN yield_bruto * 1.2 >= 12 THEN 45
                    WHEN yield_bruto * 1.2 >= 10 THEN 36
                    WHEN yield_bruto * 1.2 >= 8  THEN 28
                    WHEN yield_bruto * 1.2 >= 6  THEN 18
                    WHEN yield_bruto * 1.2 >= 4  THEN 9
                    ELSE 2
                END
            ELSE 0
        END                                 AS yield_medio_score
    FROM base
),
pbn_score AS (
    SELECT
        barrio_id,
        CASE estado_precio
            WHEN 'BAJO'   THEN 25
            WHEN 'NORMAL' THEN 15
            WHEN 'SOBRE'  THEN 4
            ELSE 10
        END                                 AS pbn_score
    FROM base
),
demanda_score AS (
    SELECT
        barrio_id,
        CASE
            WHEN n_cafes_500m >= 15 THEN 8
            WHEN n_cafes_500m >= 8  THEN 5
            WHEN n_cafes_500m >= 3  THEN 2
            ELSE 0
        END
        + CASE
            WHEN n_coworking_1km >= 2 THEN 7
            WHEN n_coworking_1km >= 1 THEN 4
            ELSE 0
        END
        + CASE
            WHEN n_gimnasios_1km >= 3 THEN 5
            WHEN n_gimnasios_1km >= 1 THEN 3
            ELSE 0
        END                                 AS nomada_score
    FROM base
),
seg_score AS (
    SELECT
        barrio_id,
        CASE
            WHEN seguridad_score >= 80 THEN 10
            WHEN seguridad_score >= 60 THEN 7
            WHEN seguridad_score >= 40 THEN 4
            WHEN seguridad_score IS NULL THEN 5
            ELSE 2
        END                                 AS seg_medio_score
    FROM base
)
SELECT
    b.barrio_id,
    ys.yield_medio_score,
    ds.nomada_score,
    ps.pbn_score,
    ss.seg_medio_score,
    0                                       AS pts_verde,
    0                                       AS pts_equip,
    (ys.yield_medio_score
        + ps.pbn_score
        + ds.nomada_score
        + ss.seg_medio_score)               AS score_mediano
FROM base b
JOIN yield_score   ys ON b.barrio_id = ys.barrio_id
JOIN pbn_score     ps ON b.barrio_id = ps.barrio_id
JOIN demanda_score ds ON b.barrio_id = ds.barrio_id
JOIN seg_score     ss ON b.barrio_id = ss.barrio_id;
"""


def upgrade() -> None:
    # Bootstrap raw schema + barrios stub so FK-dependent migrations (0005+) work on fresh DB.
    # Real data loaded separately via pg_dump from local.
    op.execute("CREATE SCHEMA IF NOT EXISTS raw")
    op.execute("""
        CREATE TABLE IF NOT EXISTS raw.barrios (
            id                   SERIAL PRIMARY KEY,
            nombre               text,
            comuna               text,
            municipio            text,
            fuente               text,
            raw_props            jsonb,
            geometry             geometry(MultiPolygon,4326),
            cargado_en           timestamptz DEFAULT now(),
            excluir_inversion    boolean DEFAULT false,
            uso_suelo_dominante  varchar,
            uso_suelo_score      integer,
            ciudad_id            integer DEFAULT 1
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_barrios_geometry ON raw.barrios USING GIST (geometry)")
    op.execute("CREATE SCHEMA IF NOT EXISTS analytics")
    op.execute("CREATE EXTENSION IF NOT EXISTS unaccent")
    op.execute("ALTER TABLE raw.barrios ADD COLUMN IF NOT EXISTS uso_suelo_dominante varchar")
    op.execute("ALTER TABLE raw.barrios ADD COLUMN IF NOT EXISTS uso_suelo_score integer")
    # score_mediano_plazo may exist as a table (pre-migration) — must drop before CREATE VIEW
    op.execute("DROP TABLE IF EXISTS analytics.score_mediano_plazo")
    # These are dbt models; create stubs so the view definition validates on fresh DB
    op.execute("""
        CREATE TABLE IF NOT EXISTS analytics.barrios_mercado (
            barrio_id              integer,
            yield_renta_media_pct  double precision,
            yield_bruto            double precision,
            estado_precio          text,
            airbnb_n_listings      integer
        )
    """)
    op.execute("ALTER TABLE analytics.barrios_mercado ADD COLUMN IF NOT EXISTS airbnb_n_listings integer")
    op.execute("""
        CREATE TABLE IF NOT EXISTS analytics.barrios_pois_distancia (
            barrio_id       integer,
            n_cafes_500m    integer,
            n_coworking_1km integer,
            n_gimnasios_1km integer,
            indice_nomada   double precision
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS analytics.barrios_seguridad (
            barrio_id                  integer,
            score_seguridad_residente  double precision
        )
    """)
    op.execute(_VIEW_SQL)


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS analytics.score_mediano_plazo")
