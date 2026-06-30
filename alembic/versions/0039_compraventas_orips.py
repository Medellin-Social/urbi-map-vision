"""raw.compraventas_orips + analytics.compraventas_municipio_stats matview

Revision ID: 0039
Revises: 0038
Create Date: 2026-06-29

Compraventas de registro SNR (Valle de Aburrá), data histórica estática.
- raw.compraventas_orips: tabla inmutable, TODAS las filas sin filtrar
  (la carga vive en scripts/load_compraventas_orips.py).
- analytics.compraventas_municipio_stats: matview de stats nominales por
  (municipio, anio) + rollup por municipio (anio NULL) vía GROUPING SETS.
  Filtro de stats (NO toca raw): piso 20M COP, techo global p99.9, excluye
  NULL/0. Stats en pesos CORRIENTES — la deflación IPC a pesos reales es un
  paso posterior para el simulador, NO se hace aquí.

Se crea WITH NO DATA: el REFRESH lo hace el script de carga tras insertar.
NO se refresca en cache.py (data estática, refresh manual cuando llegue SNR).
"""
from alembic import op

revision = "0039"
down_revision = "0038"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS raw")
    op.execute("CREATE SCHEMA IF NOT EXISTS analytics")

    op.execute("""
        CREATE TABLE IF NOT EXISTS raw.compraventas_orips (
            id                SERIAL PRIMARY KEY,
            anio              INTEGER,
            fecha_registro    DATE,
            municipio         TEXT,
            tipo_inmueble     TEXT,
            area_m2           NUMERIC,
            valor_cop         BIGINT,
            oficina_registro  TEXT,
            fecha_carga       TIMESTAMP DEFAULT NOW()
        )
    """)

    op.execute("""
        CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.compraventas_municipio_stats AS
        WITH techo AS (
            SELECT percentile_cont(0.999) WITHIN GROUP (ORDER BY valor_cop) AS p999
            FROM raw.compraventas_orips
            WHERE valor_cop IS NOT NULL AND valor_cop > 0
        ),
        filtrado AS (
            SELECT municipio, anio, valor_cop
            FROM raw.compraventas_orips, techo
            WHERE valor_cop >= 20000000          -- piso: inmueble completo
              AND valor_cop <= techo.p999        -- techo de cordura (outlier $732B)
        )
        SELECT
            municipio,
            anio,                                 -- NULL = rollup todos los años
            COUNT(*)                                                        AS n_transacciones,
            percentile_cont(0.5)  WITHIN GROUP (ORDER BY valor_cop)::bigint AS valor_mediana,
            percentile_cont(0.25) WITHIN GROUP (ORDER BY valor_cop)::bigint AS valor_p25,
            percentile_cont(0.75) WITHIN GROUP (ORDER BY valor_cop)::bigint AS valor_p75,
            ROUND(AVG(valor_cop))::bigint                                   AS valor_promedio
        FROM filtrado
        GROUP BY GROUPING SETS ((municipio, anio), (municipio))
        WITH NO DATA
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_compraventas_stats_muni_anio
            ON analytics.compraventas_municipio_stats (municipio, anio)
    """)


def downgrade() -> None:
    op.execute("DROP MATERIALIZED VIEW IF EXISTS analytics.compraventas_municipio_stats")
    op.execute("DROP TABLE IF EXISTS raw.compraventas_orips")
