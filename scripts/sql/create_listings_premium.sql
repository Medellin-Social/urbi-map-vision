-- raw.listings_premium — premium and vacation-rental listings
-- Sources: medellinliving (agencia), vrbo (vacation rental), future sources
-- Run: psql $DATABASE_URL -f scripts/sql/create_listings_premium.sql

CREATE TABLE IF NOT EXISTS raw.listings_premium (
    id                SERIAL PRIMARY KEY,
    fuente            VARCHAR NOT NULL,
    tipo_operacion    VARCHAR,           -- 'arriendo', 'venta'
    tipo_inmueble     VARCHAR,           -- 'apartamento', 'casa', 'cabaña'
    titulo            VARCHAR,
    precio_cop        BIGINT,
    precio_usd        DECIMAL(12,2),
    area_m2           DECIMAL(10,2),
    habitaciones      INTEGER,
    banos             DECIMAL(4,1),
    barrio_raw        VARCHAR,
    barrio_id         INTEGER REFERENCES raw.barrios(id),
    url               VARCHAR UNIQUE NOT NULL,
    lat               DECIMAL(10,6),
    lon               DECIMAL(10,6),
    fecha_scraping    TIMESTAMP DEFAULT NOW(),
    fecha_publicacion TIMESTAMP,
    dedup_hash        VARCHAR UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_lp_barrio_id      ON raw.listings_premium(barrio_id);
CREATE INDEX IF NOT EXISTS idx_lp_fuente         ON raw.listings_premium(fuente);
CREATE INDEX IF NOT EXISTS idx_lp_tipo_operacion ON raw.listings_premium(tipo_operacion);
CREATE INDEX IF NOT EXISTS idx_lp_precio_cop     ON raw.listings_premium(precio_cop);
CREATE INDEX IF NOT EXISTS idx_lp_coords         ON raw.listings_premium(lat, lon)
    WHERE lat IS NOT NULL AND lon IS NOT NULL;
