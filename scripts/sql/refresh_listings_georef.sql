-- Refresh analytics.listings_georef to include VRBO (and all listings_premium sources).
-- Run after: python scraping/vrbo/vrbo_scraper.py
-- Or trigger via API: the hourly cache refresh (api/cache.py) handles this automatically.
--
-- Manual run:
--   psql $DATABASE_URL -f scripts/sql/refresh_listings_georef.sql
--
-- This is the Step 5 substitute for dbt (not configured in this project).

BEGIN;
TRUNCATE analytics.listings_georef;

INSERT INTO analytics.listings_georef (url, lat, lon, url_activa, estrato_real, refreshed_at)
SELECT DISTINCT ON (l.url)
    l.url,
    l.lat,
    l.lon,
    COALESCE(lm.url_activa, lf.url_activa)               AS url_activa,
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
ORDER BY l.url;

COMMIT;

-- Verify coverage by source
SELECT
    CASE
        WHEN url LIKE '%vrbo.com%' THEN 'vrbo'
        WHEN url LIKE '%medellinliving%' THEN 'medellinliving'
        WHEN url LIKE '%metrocuadrado%' THEN 'metrocuadrado'
        WHEN url LIKE '%fincaraiz%' THEN 'fincaraiz'
        ELSE 'other'
    END AS fuente,
    COUNT(*) AS n_listings_georef
FROM analytics.listings_georef
GROUP BY 1
ORDER BY 2 DESC;
