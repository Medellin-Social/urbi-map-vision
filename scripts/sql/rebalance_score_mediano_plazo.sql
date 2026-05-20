-- Rebalance analytics.score_mediano_plazo
-- New weights (100 pts total):
--   yield_renta_media: 45 pts  (was 25, now primary driver — investor focus)
--   precio_justo PBN:  25 pts  (unchanged)
--   demanda_zona:      20 pts  (was 30 "infraestructura nómada", renamed + reduced)
--   seguridad:         10 pts  (was 12)
--   REMOVED: verde (10 pts) and equipamiento (5 pts) — not relevant for investor decision

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
        seg.score                           AS seguridad_score
    FROM analytics.barrios_mercado          bm
    LEFT JOIN analytics.barrios_pois_distancia poi ON bm.barrio_id = poi.barrio_id
    LEFT JOIN analytics.barrios_seguridad   seg ON bm.barrio_id = seg.barrio_id
),

-- 1. Yield renta media (45 pts)
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
                -- proxy: yield_bruto * 1.2 as renta media proxy
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

-- 2. Precio justo PBN (25 pts)
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

-- 3. Demanda de zona (20 pts) — cafés + coworking + gimnasios
demanda_score AS (
    SELECT
        barrio_id,
        -- cafés (8 pts max)
        CASE
            WHEN n_cafes_500m >= 15 THEN 8
            WHEN n_cafes_500m >= 8  THEN 5
            WHEN n_cafes_500m >= 3  THEN 2
            ELSE 0
        END
        -- coworking (7 pts max)
        + CASE
            WHEN n_coworking_1km >= 2 THEN 7
            WHEN n_coworking_1km >= 1 THEN 4
            ELSE 0
        END
        -- gimnasios (5 pts max)
        + CASE
            WHEN n_gimnasios_1km >= 3 THEN 5
            WHEN n_gimnasios_1km >= 1 THEN 3
            ELSE 0
        END                                 AS nomada_score
    FROM base
),

-- 4. Seguridad percibida (10 pts)
seg_score AS (
    SELECT
        barrio_id,
        CASE
            WHEN seguridad_score >= 80 THEN 10
            WHEN seguridad_score >= 60 THEN 7
            WHEN seguridad_score >= 40 THEN 4
            WHEN seguridad_score IS NULL THEN 5  -- neutral when no data
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
    0                                       AS pts_verde,  -- removed, kept for API compat
    0                                       AS pts_equip,  -- removed, kept for API compat
    (ys.yield_medio_score
        + ps.pbn_score
        + ds.nomada_score
        + ss.seg_medio_score)               AS score_mediano
FROM base b
JOIN yield_score   ys ON b.barrio_id = ys.barrio_id
JOIN pbn_score     ps ON b.barrio_id = ps.barrio_id
JOIN demanda_score ds ON b.barrio_id = ds.barrio_id
JOIN seg_score     ss ON b.barrio_id = ss.barrio_id;
