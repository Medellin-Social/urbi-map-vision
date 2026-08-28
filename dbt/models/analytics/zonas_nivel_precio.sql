{{
    config(
        materialized='table',
        schema='analytics'
    )
}}

-- Nivel A/B/C/D por zona (barrio y comuna), usado para escalonar el precio de
-- patrocinio en api/services/zona_sponsor_service.py. Umbrales de score FIJOS
-- (no percentil): la distribución entre niveles queda desigual a propósito,
-- reflejando que la mayoría de zonas del Valle de Aburrá no son premium.
--
-- Score = 45% precio_m2 + 30% seguridad + 25% volumen de datos (n_venta+n_arriendo).
-- precio_m2 y volumen se normalizan min-max, pero el min/max se calcula SOLO
-- sobre zonas con n_datos >= 10 (piso mínimo) para que un barrio con 1-2
-- listings no distorsione la escala. Zonas por debajo del piso igual reciben
-- nivel, solo no participan en fijar los extremos.

with base as (

    select
        bm.barrio_id,
        coalesce(bm.precio_venta_m2_p50, bm.pbn_precio_justo_m2)   as precio_m2_efectivo,
        coalesce(bm.n_venta, 0) + coalesce(bm.n_arriendo, 0)       as n_datos,
        bm.score_seguridad
    from {{ ref('barrios_mercado') }} bm
    where coalesce(bm.precio_venta_m2_p50, bm.pbn_precio_justo_m2) is not null

),

anchors as (

    select
        min(precio_m2_efectivo) filter (where n_datos >= 10) as precio_min,
        max(precio_m2_efectivo) filter (where n_datos >= 10) as precio_max,
        min(n_datos)            filter (where n_datos >= 10) as vol_min,
        max(n_datos)            filter (where n_datos >= 10) as vol_max
    from base

),

barrio_scored as (

    select
        b.barrio_id,
        greatest(0, least(100,
            (b.precio_m2_efectivo - a.precio_min) / nullif(a.precio_max - a.precio_min, 0) * 100
        ))                                                          as precio_score,
        greatest(0, least(100,
            (b.n_datos - a.vol_min) / nullif(a.vol_max - a.vol_min, 0) * 100
        ))                                                          as volumen_score,
        coalesce(b.score_seguridad, 50)                              as seguridad_score
    from base b
    cross join anchors a

),

barrio_nivel as (

    select
        barrio_id,
        round(0.45 * precio_score + 0.30 * seguridad_score + 0.25 * volumen_score) as score_nivel
    from barrio_scored

),

comuna_nivel as (

    select
        bc.cd_comuna,
        round(sum(bn.score_nivel * base.n_datos) / nullif(sum(base.n_datos), 0)) as score_nivel
    from barrio_nivel bn
    join base                    on base.barrio_id = bn.barrio_id
    join analytics.barrios_cd bc on bc.barrio_id    = bn.barrio_id
    where bc.cd_comuna is not null
    group by bc.cd_comuna

)

select
    'barrio'::text  as zona_nivel,
    barrio_id::text as zona_codigo,
    score_nivel,
    case
        when score_nivel >= 75 then 'A'
        when score_nivel >= 55 then 'B'
        when score_nivel >= 35 then 'C'
        else 'D'
    end as nivel
from barrio_nivel

union all

select
    'comuna'::text  as zona_nivel,
    cd_comuna::text as zona_codigo,
    score_nivel,
    case
        when score_nivel >= 75 then 'A'
        when score_nivel >= 55 then 'B'
        when score_nivel >= 35 then 'C'
        else 'D'
    end as nivel
from comuna_nivel
