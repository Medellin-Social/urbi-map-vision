{{
    config(
        materialized='table',
        schema='analytics'
    )
}}

with mercado as (

    select * from {{ ref('barrios_mercado') }}

),

corto as (

    select * from {{ ref('score_corto_plazo') }}

),

mediano as (

    select * from {{ ref('score_mediano_plazo') }}

),

largo as (

    select * from {{ ref('score_largo_plazo') }}

),

liquidez as (

    select
        barrio_id,
        liquidez_score,
        categoria_liquidez,
        tiempo_estimado_venta,
        nota_metodologia
    from {{ ref('barrios_liquidez') }}

),

verde as (

    select
        barrio_id,
        indice_verde_pct,
        categoria_verde,
        score_verde
    from {{ ref('barrios_verde') }}

),

equip as (

    select
        barrio_id,
        pct_wifi,
        pct_ac,
        pct_kitchen,
        pct_washer,
        score_equipamiento
    from {{ ref('barrios_amenities') }}

)

select
    b.barrio_id,
    b.barrio_nombre                                                            as nombre_barrio,
    b.comuna,
    b.municipio,

    -- Score corto plazo (Airbnb)
    c.score_corto,
    c.categoria_corto,
    c.color_corto,
    c.yield_score                                                              as pts_yield_airbnb,

    -- Score mediano plazo (Nómadas)
    m.score_mediano,
    m.categoria_mediano,
    m.color_mediano,
    m.yield_medio_score                                                        as pts_yield_medio,

    -- Score largo plazo (Arriendo tradicional)
    l.score_largo,
    l.categoria_largo,
    l.color_largo,
    l.yield_largo_score                                                        as pts_yield_largo,

    -- Perfil recomendado: el score más alto gana
    case
        when c.score_corto >= coalesce(m.score_mediano, 0)
         and c.score_corto >= coalesce(l.score_largo, 0)
            then 'AIRBNB'
        when coalesce(m.score_mediano, 0) >= coalesce(l.score_largo, 0)
            then 'NOMADAS'
        else 'ARRIENDO_LARGO'
    end                                                                        as perfil_recomendado,

    -- Métricas clave para el panel
    b.precio_venta_m2_p50                                                     as precio_m2_venta_p50,
    b.precio_arriendo_p50                                                     as arriendo_p50,
    b.estado_precio,
    b.yield_airbnb_pct,
    b.yield_bruto                                                             as yield_bruto_pct,
    b.yield_renta_media_pct,

    -- Liquidez
    lq.liquidez_score,
    lq.categoria_liquidez,
    lq.tiempo_estimado_venta,
    lq.nota_metodologia,

    -- Verde
    v.indice_verde_pct,
    v.categoria_verde,
    v.score_verde,

    -- Equipamiento Airbnb
    eq.pct_wifi,
    eq.pct_ac,
    eq.pct_kitchen,
    eq.pct_washer,
    eq.score_equipamiento,

    now()                                                                      as calculado_en

from mercado b
left join corto    c  using (barrio_id)
left join mediano  m  using (barrio_id)
left join largo    l  using (barrio_id)
left join liquidez lq using (barrio_id)
left join verde    v  using (barrio_id)
left join equip    eq using (barrio_id)
where b.barrio_id is not null
order by c.score_corto desc nulls last
