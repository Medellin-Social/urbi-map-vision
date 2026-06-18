"""Create stub analytics tables missing from prod DB

Revision ID: 0034
Revises: 0033
Create Date: 2026-06-18

These tables exist in local dev but were never created via alembic in prod.
They are populated by dbt runs. Stubs allow the API to start without errors
while returning NULL for all analytics fields until dbt populates them.
"""
from alembic import op

revision = "0034"
down_revision = "0033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS analytics.barrios_seguridad (
            barrio_id                   INT PRIMARY KEY,
            score_seguridad_residente   NUMERIC,
            categoria_seguridad         TEXT,
            tendencia                   TEXT,
            nota_seguridad              TEXT
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS analytics.barrios_verde (
            barrio_id       INT PRIMARY KEY,
            indice_verde_pct NUMERIC,
            categoria_verde  TEXT,
            score_verde      NUMERIC
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS analytics.proyecciones_valorizacion (
            estrato_sistema         INT PRIMARY KEY,
            proyeccion_3anos_pct    NUMERIC,
            proyeccion_5anos_pct    NUMERIC
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS analytics.score_mediano_plazo (
            barrio_id           INT PRIMARY KEY,
            yield_medio_score   NUMERIC,
            nomada_score        NUMERIC,
            pbn_score           NUMERIC,
            seg_medio_score     NUMERIC,
            pts_verde           NUMERIC,
            pts_equip           NUMERIC
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS analytics.barrios_airbnb_real (
            barrio_id               INT PRIMARY KEY,
            n_entire_home           INT,
            n_private_room          INT,
            n_superhosts            INT,
            ocupacion_p25_pct       NUMERIC,
            ocupacion_p75_pct       NUMERIC,
            ingresos_anuales_p50_usd NUMERIC,
            ingresos_anuales_p50_cop NUMERIC,
            yield_airbnb_real_pct   NUMERIC,
            rating_promedio         NUMERIC,
            reviews_promedio        NUMERIC,
            diff_ocupacion_pct      NUMERIC,
            diff_adr_cop            NUMERIC
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS analytics.barrios_amenities (
            barrio_id           INT PRIMARY KEY,
            pct_wifi            NUMERIC,
            pct_ac              NUMERIC,
            pct_kitchen         NUMERIC,
            pct_washer          NUMERIC,
            score_equipamiento  NUMERIC,
            n_listings          INT
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS analytics.catastro_comunas_stats (
            comuna              TEXT PRIMARY KEY,
            total_predios       INT,
            pct_apartamento     NUMERIC,
            area_mediana_apto_m2 NUMERIC,
            avaluo_m2           NUMERIC
        )
    """)


def downgrade() -> None:
    pass
