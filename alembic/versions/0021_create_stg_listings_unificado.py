"""create staging.stg_listings_unificado if not present

Revision ID: 0021
Revises: 0020
Create Date: 2026-06-09

stg_listings_unificado is normally managed by dbt.
This migration bootstraps the table on environments where dbt hasn't run
(e.g. Railway production after DB reset), so the listings API endpoint works.
The table is refreshed hourly by api/cache.py.
"""
from alembic import op

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None

_CREATE_STUBS = """
-- Create stub tables for sources managed by scrapers (not alembic).
-- These ensure migration 0021 works on Railway where scrapers haven't run yet.
CREATE TABLE IF NOT EXISTS raw.listings_premium (
    id            SERIAL PRIMARY KEY,
    fuente        VARCHAR NOT NULL,
    fuente_tipo   VARCHAR DEFAULT 'portal',
    tipo_operacion VARCHAR,
    tipo_inmueble  VARCHAR,
    precio_cop    BIGINT,
    precio_usd    BIGINT,
    area_m2       NUMERIC,
    habitaciones  INTEGER,
    banos         NUMERIC,
    barrio_raw    VARCHAR,
    barrio_id     INTEGER,
    direccion_raw VARCHAR,
    lat           NUMERIC(10,6),
    lon           NUMERIC(10,6),
    geom          GEOMETRY(Point,4326),
    url           VARCHAR,
    fotos         TEXT[],
    fecha_scraping TIMESTAMPTZ DEFAULT now(),
    dedup_hash    VARCHAR,
    UNIQUE(dedup_hash)
);

CREATE TABLE IF NOT EXISTS raw.listings_renta_media (
    id            SERIAL PRIMARY KEY,
    fuente        TEXT NOT NULL,
    precio_mes_cop NUMERIC(12,0),
    area_m2       NUMERIC(8,2),
    habitaciones  INTEGER,
    banos         NUMERIC,
    barrio_raw    TEXT,
    barrio_id     INTEGER,
    lat           NUMERIC(10,6),
    lon           NUMERIC(10,6),
    url           TEXT,
    fecha_scraping TIMESTAMPTZ DEFAULT now(),
    dedup_hash    VARCHAR
);
"""

_CREATE_STG = """
CREATE SCHEMA IF NOT EXISTS staging;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'staging'
      AND table_name   = 'stg_listings_unificado'
  ) THEN
    CREATE TABLE staging.stg_listings_unificado AS
    WITH todas_fuentes AS (

        SELECT
            id::text || '_fc'      AS listing_uid,
            'fincaraiz'            AS fuente,
            'standard'             AS tier,
            tipo_operacion,
            tipo_inmueble,
            precio                 AS precio_cop,
            NULL::bigint           AS precio_usd,
            area_m2,
            habitaciones,
            banos::numeric         AS banos,
            barrio_raw,
            barrio_id,
            direccion_raw,
            lat::double precision,
            lon::double precision,
            geom,
            url,
            fotos,
            fecha_scraping,
            dedup_hash,
            estrato_real
        FROM raw.listings_fincaraiz
        WHERE activo = true
          AND precio > 0
          AND area_m2 > 0

        UNION ALL

        SELECT
            id::text || '_mq'      AS listing_uid,
            'metrocuadrado'        AS fuente,
            'standard'             AS tier,
            tipo_operacion,
            tipo_inmueble,
            precio                 AS precio_cop,
            NULL::bigint           AS precio_usd,
            area_m2,
            habitaciones,
            banos::numeric         AS banos,
            barrio_raw,
            barrio_id,
            direccion_raw,
            lat,
            lon,
            geom,
            url,
            fotos,
            fecha_scraping,
            dedup_hash,
            COALESCE(estrato_real, estrato) AS estrato_real
        FROM raw.listings_metrocuadrado
        WHERE activo = true
          AND precio > 0
          AND area_m2 > 0

        UNION ALL

        SELECT
            id::text || '_pr'                  AS listing_uid,
            fuente,
            COALESCE(fuente_tipo, 'standard')  AS tier,
            tipo_operacion,
            tipo_inmueble,
            precio_cop,
            precio_usd,
            area_m2,
            habitaciones,
            banos,
            barrio_raw,
            barrio_id,
            direccion_raw,
            lat::double precision,
            lon::double precision,
            geom,
            url,
            fotos,
            fecha_scraping,
            dedup_hash,
            NULL::integer AS estrato_real
        FROM raw.listings_premium
        WHERE precio_cop > 0
          AND area_m2 > 0

        UNION ALL

        SELECT
            id::text || '_rm'      AS listing_uid,
            fuente,
            'renta_media'          AS tier,
            'arriendo'             AS tipo_operacion,
            'apartamento'          AS tipo_inmueble,
            precio_mes_cop         AS precio_cop,
            NULL::bigint           AS precio_usd,
            area_m2,
            habitaciones,
            banos,
            barrio_raw,
            barrio_id,
            NULL::text             AS direccion_raw,
            lat::double precision,
            lon::double precision,
            CASE
                WHEN lat IS NOT NULL AND lon IS NOT NULL
                THEN ST_SetSRID(ST_MakePoint(lon::float, lat::float), 4326)
            END                    AS geom,
            url,
            NULL::text[]           AS fotos,
            fecha_scraping,
            dedup_hash,
            NULL::integer          AS estrato_real
        FROM raw.listings_renta_media
        WHERE precio_mes_cop > 0
          AND area_m2 > 0

    ),

    con_geo AS (
        SELECT
            listing_uid, fuente, tier,
            tipo_operacion, tipo_inmueble,
            precio_cop, precio_usd,
            area_m2, habitaciones, banos,
            barrio_raw, barrio_id,
            direccion_raw, lat, lon, geom,
            url, fotos, fecha_scraping, estrato_real,

            MIN(precio_cop) OVER (PARTITION BY
                ROUND(lat::numeric, 3), ROUND(lon::numeric, 3),
                tipo_operacion, tipo_inmueble, habitaciones,
                (ROUND(area_m2::numeric / 5) * 5)
            ) AS precio_min_cluster,

            MAX(precio_cop) OVER (PARTITION BY
                ROUND(lat::numeric, 3), ROUND(lon::numeric, 3),
                tipo_operacion, tipo_inmueble, habitaciones,
                (ROUND(area_m2::numeric / 5) * 5)
            ) AS precio_max_cluster,

            COUNT(*) OVER (PARTITION BY
                ROUND(lat::numeric, 3), ROUND(lon::numeric, 3),
                tipo_operacion, tipo_inmueble, habitaciones,
                (ROUND(area_m2::numeric / 5) * 5)
            ) AS n_duplicados,

            ROW_NUMBER() OVER (
                PARTITION BY
                    ROUND(lat::numeric, 3), ROUND(lon::numeric, 3),
                    tipo_operacion, tipo_inmueble, habitaciones,
                    (ROUND(area_m2::numeric / 5) * 5)
                ORDER BY
                    CASE tier
                        WHEN 'agencia_premium' THEN 1
                        WHEN 'renta_media'     THEN 2
                        WHEN 'standard'        THEN 3
                        ELSE                        4
                    END,
                    fecha_scraping DESC NULLS LAST
            ) AS _rn
        FROM todas_fuentes
        WHERE geom IS NOT NULL
    ),

    sin_geo AS (
        SELECT
            listing_uid, fuente, tier,
            tipo_operacion, tipo_inmueble,
            precio_cop, precio_usd,
            area_m2, habitaciones, banos,
            barrio_raw, barrio_id,
            direccion_raw, lat, lon, geom,
            url, fotos, fecha_scraping, estrato_real,
            precio_cop AS precio_min_cluster,
            precio_cop AS precio_max_cluster,

            COUNT(*) OVER (PARTITION BY
                COALESCE(
                    dedup_hash,
                    COALESCE(barrio_id::text, barrio_raw, 'x') || '|' ||
                    COALESCE(tipo_operacion, '?') || '|' ||
                    COALESCE(tipo_inmueble, '?')  || '|' ||
                    COALESCE(habitaciones::text, '?') || '|' ||
                    (ROUND(area_m2::numeric / 5) * 5)::text
                )
            ) AS n_duplicados,

            ROW_NUMBER() OVER (
                PARTITION BY
                    COALESCE(
                        dedup_hash,
                        COALESCE(barrio_id::text, barrio_raw, 'x') || '|' ||
                        COALESCE(tipo_operacion, '?') || '|' ||
                        COALESCE(tipo_inmueble, '?')  || '|' ||
                        COALESCE(habitaciones::text, '?') || '|' ||
                        (ROUND(area_m2::numeric / 5) * 5)::text
                    )
                ORDER BY
                    CASE tier
                        WHEN 'agencia_premium' THEN 1
                        WHEN 'renta_media'     THEN 2
                        WHEN 'standard'        THEN 3
                        ELSE                        4
                    END,
                    fecha_scraping DESC NULLS LAST
            ) AS _rn
        FROM todas_fuentes
        WHERE geom IS NULL
    )

    SELECT
        listing_uid, fuente, tier,
        tipo_operacion, tipo_inmueble,
        precio_cop, precio_usd,
        precio_min_cluster, precio_max_cluster,
        CASE
            WHEN n_duplicados > 1
             AND precio_min_cluster IS DISTINCT FROM precio_max_cluster
            THEN true ELSE false
        END AS precio_variable,
        area_m2,
        CASE WHEN area_m2 > 0 THEN precio_cop / area_m2 END AS precio_m2,
        habitaciones, banos,
        barrio_raw, barrio_id,
        direccion_raw, lat, lon, geom,
        url, fotos, fecha_scraping, n_duplicados, estrato_real
    FROM con_geo WHERE _rn = 1

    UNION ALL

    SELECT
        listing_uid, fuente, tier,
        tipo_operacion, tipo_inmueble,
        precio_cop, precio_usd,
        precio_min_cluster, precio_max_cluster,
        false AS precio_variable,
        area_m2,
        CASE WHEN area_m2 > 0 THEN precio_cop / area_m2 END AS precio_m2,
        habitaciones, banos,
        barrio_raw, barrio_id,
        direccion_raw, lat, lon, geom,
        url, fotos, fecha_scraping, n_duplicados, estrato_real
    FROM sin_geo WHERE _rn = 1;

    -- Indexes that the API and cache.py depend on
    CREATE INDEX idx_stg_barrio_id ON staging.stg_listings_unificado (barrio_id);
    CREATE INDEX idx_stg_url       ON staging.stg_listings_unificado (url);
    CREATE INDEX idx_stg_precio    ON staging.stg_listings_unificado (precio_cop);
  END IF;
END $$;
"""

_REFRESH_GEOREF = """
INSERT INTO analytics.listings_georef (url, lat, lon, url_activa, estrato_real, refreshed_at)
SELECT DISTINCT ON (l.url)
    l.url,
    l.lat,
    l.lon,
    COALESCE(lm.url_activa, lf.url_activa) AS url_activa,
    COALESCE(l.estrato_real, lm.estrato_real, lf.estrato_real) AS estrato_real,
    now()
FROM staging.stg_listings_unificado l
LEFT JOIN raw.listings_metrocuadrado lm ON lm.url = l.url AND l.fuente = 'metrocuadrado'
LEFT JOIN raw.listings_fincaraiz lf     ON lf.url = l.url AND l.fuente = 'fincaraiz'
JOIN raw.barrios b                      ON b.id = l.barrio_id
WHERE l.precio_cop >= 500000
  AND NOT (l.tipo_operacion = 'arriendo' AND l.precio_cop > 50000000)
  AND NOT (l.tipo_operacion = 'venta'    AND l.precio_cop > 50000000000)
  AND l.lat IS NOT NULL AND l.lat != 0
  AND ST_DWithin(
      ST_SetSRID(ST_MakePoint(l.lon, l.lat), 4326)::geography,
      b.geometry::geography,
      2000
  )
ORDER BY l.url
ON CONFLICT (url) DO UPDATE
    SET lat = EXCLUDED.lat,
        lon = EXCLUDED.lon,
        url_activa = EXCLUDED.url_activa,
        estrato_real = EXCLUDED.estrato_real,
        refreshed_at = EXCLUDED.refreshed_at
"""


def upgrade() -> None:
    op.execute(_CREATE_STUBS)
    op.execute(_CREATE_STG)
    # Refresh georef so listings appear on the map (was empty if stg was missing)
    op.execute(_REFRESH_GEOREF)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS staging.stg_listings_unificado")
