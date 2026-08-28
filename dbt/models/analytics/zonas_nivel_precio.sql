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
-- Score = 35% precio_m2 + 25% seguridad + 20% volumen de datos (n_venta+n_arriendo)
-- + 20% población (tamaño de mercado/audiencia — raw.poblacion_comuna para
-- Medellín, raw.poblacion_municipio para los 5 municipios satélite, ver
-- migración 0081). precio_m2/volumen/población se normalizan min-max, pero
-- el min/max se calcula SOLO sobre zonas con n_datos >= 10 (piso mínimo) para
-- que un barrio con 1-2 listings no distorsione la escala. Zonas por debajo
-- del piso igual reciben nivel, solo no participan en fijar los extremos.

with poblacion as (

    select
        b.id as barrio_id,
        coalesce(pc.poblacion, pm.poblacion) as poblacion
    from raw.barrios b
    left join raw.poblacion_comuna    pc on pc.comuna    = upper(b.comuna)
    left join raw.poblacion_municipio pm on pm.municipio = upper(b.municipio)

),

base as (

    select
        bm.barrio_id,
        coalesce(bm.precio_venta_m2_p50, bm.pbn_precio_justo_m2)   as precio_m2_efectivo,
        coalesce(bm.n_venta, 0) + coalesce(bm.n_arriendo, 0)       as n_datos,
        bm.score_seguridad,
        p.poblacion
    from {{ ref('barrios_mercado') }} bm
    left join poblacion p on p.barrio_id = bm.barrio_id
    where coalesce(bm.precio_venta_m2_p50, bm.pbn_precio_justo_m2) is not null

),

anchors as (

    select
        min(precio_m2_efectivo) filter (where n_datos >= 10) as precio_min,
        max(precio_m2_efectivo) filter (where n_datos >= 10) as precio_max,
        min(n_datos)            filter (where n_datos >= 10) as vol_min,
        max(n_datos)            filter (where n_datos >= 10) as vol_max,
        min(poblacion)          filter (where n_datos >= 10) as pob_min,
        max(poblacion)          filter (where n_datos >= 10) as pob_max
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
        greatest(0, least(100,
            (b.poblacion - a.pob_min) / nullif(a.pob_max - a.pob_min, 0) * 100
        ))                                                          as poblacion_score,
        coalesce(b.score_seguridad, 50)                              as seguridad_score
    from base b
    cross join anchors a

),

barrio_nivel as (

    select
        barrio_id,
        round(
            0.35 * precio_score
            + 0.25 * seguridad_score
            + 0.20 * volumen_score
            + 0.20 * coalesce(poblacion_score, volumen_score)
        ) as score_nivel
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
