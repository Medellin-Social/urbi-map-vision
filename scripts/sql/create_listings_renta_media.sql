-- raw.listings_renta_media — mid-term rental listings for nomads
-- Run: psql $DATABASE_URL -f scripts/sql/create_listings_renta_media.sql

CREATE TABLE IF NOT EXISTS raw.listings_renta_media (
    id                SERIAL PRIMARY KEY,
    fuente            VARCHAR NOT NULL,
    titulo            VARCHAR,
    precio_mes_cop    BIGINT,
    precio_mes_usd    DECIMAL,
    area_m2           DECIMAL,
    habitaciones      INTEGER,
    banos             DECIMAL,
    barrio_raw        VARCHAR,
    barrio_id         INTEGER REFERENCES raw.barrios(id),
    amoblado          BOOLEAN DEFAULT TRUE,
    incluye_servicios BOOLEAN,
    min_noches        INTEGER,
    url               VARCHAR UNIQUE,
    lat               DECIMAL(10,6),
    lon               DECIMAL(10,6),
    fecha_scraping    TIMESTAMP DEFAULT NOW(),
    dedup_hash        VARCHAR UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_lrm_barrio_id      ON raw.listings_renta_media(barrio_id);
CREATE INDEX IF NOT EXISTS idx_lrm_fuente         ON raw.listings_renta_media(fuente);
CREATE INDEX IF NOT EXISTS idx_lrm_precio_mes_cop ON raw.listings_renta_media(precio_mes_cop);
