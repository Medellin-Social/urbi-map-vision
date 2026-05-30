-- URL validation columns for raw listing tables
-- Run: psql $DATABASE_URL -f scripts/sql/add_url_validation_columns.sql

ALTER TABLE raw.listings_fincaraiz
    ADD COLUMN IF NOT EXISTS url_activa              BOOLEAN,
    ADD COLUMN IF NOT EXISTS url_validada_at         TIMESTAMP,
    ADD COLUMN IF NOT EXISTS fecha_primera_vez       TIMESTAMP DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS fecha_ultima_vez_activa TIMESTAMP;

ALTER TABLE raw.listings_metrocuadrado
    ADD COLUMN IF NOT EXISTS url_activa              BOOLEAN,
    ADD COLUMN IF NOT EXISTS url_validada_at         TIMESTAMP,
    ADD COLUMN IF NOT EXISTS fecha_primera_vez       TIMESTAMP DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS fecha_ultima_vez_activa TIMESTAMP;

-- Backfill fecha_primera_vez from existing fecha_scraping where available
UPDATE raw.listings_fincaraiz
SET fecha_primera_vez = fecha_scraping
WHERE fecha_primera_vez IS NULL AND fecha_scraping IS NOT NULL;

UPDATE raw.listings_metrocuadrado
SET fecha_primera_vez = fecha_scraping
WHERE fecha_primera_vez IS NULL AND fecha_scraping IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lf_url_validada_at  ON raw.listings_fincaraiz(url_validada_at);
CREATE INDEX IF NOT EXISTS idx_lm_url_validada_at  ON raw.listings_metrocuadrado(url_validada_at);
