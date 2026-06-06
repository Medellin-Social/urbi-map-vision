-- Step 6: Verify VRBO coverage by municipality
-- Run: psql $DATABASE_URL -f scripts/sql/verify_vrbo_coverage.sql

-- Total VRBO listings in raw.listings_premium
SELECT 'VRBO total en raw.listings_premium' AS metric, COUNT(*) AS valor
FROM raw.listings_premium
WHERE fuente = 'vrbo'

UNION ALL

SELECT 'VRBO con coordenadas', COUNT(*)
FROM raw.listings_premium
WHERE fuente = 'vrbo' AND lat IS NOT NULL AND lat != 0

UNION ALL

SELECT 'VRBO con barrio_id', COUNT(*)
FROM raw.listings_premium
WHERE fuente = 'vrbo' AND barrio_id IS NOT NULL

UNION ALL

SELECT 'VRBO en listings_georef (visibles en API)', COUNT(*)
FROM analytics.listings_georef
WHERE url LIKE '%vrbo.com%';

-- Coverage by municipality
SELECT
    b.municipio,
    COUNT(*) AS n_vrbo,
    AVG(lp.precio_cop / 30)::int AS precio_noche_cop_avg,
    AVG(lp.precio_cop)::int AS precio_mes_cop_avg,
    ROUND(AVG(lp.habitaciones)::numeric, 1) AS hab_avg,
    SUM(CASE WHEN lp.lat IS NOT NULL THEN 1 ELSE 0 END) AS con_coords,
    SUM(CASE WHEN lp.barrio_id IS NOT NULL THEN 1 ELSE 0 END) AS con_barrio
FROM raw.listings_premium lp
JOIN raw.barrios b ON b.id = lp.barrio_id
WHERE lp.fuente = 'vrbo'
GROUP BY b.municipio
ORDER BY n_vrbo DESC;

-- Comparison: Airbnb vs VRBO price by barrio (top 10 barrios)
SELECT
    b.nombre AS barrio,
    b.municipio,
    COUNT(lp.id) AS n_vrbo,
    AVG(lp.precio_cop)::int AS vrbo_mes_cop,
    AVG(lrm.precio_mes_cop)::int AS airbnb_mes_cop,
    ROUND(
        (AVG(lp.precio_cop) - AVG(lrm.precio_mes_cop)) / NULLIF(AVG(lrm.precio_mes_cop), 0) * 100
    , 1) AS vrbo_vs_airbnb_pct
FROM raw.listings_premium lp
JOIN raw.barrios b ON b.id = lp.barrio_id
LEFT JOIN raw.listings_renta_media lrm
    ON lrm.barrio_id = lp.barrio_id AND lrm.fuente = 'airbnb_mensual'
WHERE lp.fuente = 'vrbo'
GROUP BY b.id, b.nombre, b.municipio
HAVING COUNT(lp.id) >= 3
ORDER BY n_vrbo DESC
LIMIT 15;
