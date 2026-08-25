{{
    config(
        materialized='table',
        schema='analytics'
    )
}}

with renta_media as (

    select *
    from {{ source('renta_media', 'listings_renta_media') }}
    where barrio_id is not null
      and precio_mes_cop is not null
      and precio_mes_cop >= 1500000
      and (raw_data->>'_mock') is distinct from 'true'

),

-- Arriendo largo plazo (re-computado desde stg_listings para evitar dep circular)
arriendo_largo as (

    select
        barrio_id,
        percentile_cont(0.50) within group (order by precio) as arriendo_p50
    from {{ ref('stg_listings') }}
    where tipo_operacion = 'arriendo'
      and tipo_inmueble   = 'apartamento'
    group by barrio_id

),

por_barrio as (

    select
        barrio_id,
        count(*)                                                              as n_listings_renta_media,
        percentile_cont(0.50) within group (order by precio_mes_cop)         as precio_renta_media_p50_raw,
        percentile_cont(0.50) within group (order by precio_mes_usd)         as precio_renta_media_usd_raw,
        count(*) filter (where fuente = 'flatio')                            as n_flatio,
        count(*) filter (where fuente = 'airbnb_mensual')                    as n_airbnb_mensual,
        count(*) filter (where fuente = 'homads')                            as n_homads
    from renta_media
    group by barrio_id

)

select
    pb.barrio_id,
    b.nombre                                                                  as barrio_nombre,
    b.comuna,
    b.municipio,

    pb.n_listings_renta_media,
    pb.n_flatio,
    pb.n_airbnb_mensual,
    pb.n_homads,

    round(pb.precio_renta_media_p50_raw::numeric, 0)                         as precio_renta_media_p50,
    round(pb.precio_renta_media_usd_raw::numeric, 2)                         as precio_renta_media_usd,

    -- premium_vs_largo_pct: cuánto más cara es renta media vs arriendo tradicional
    -- positivo = el inversor captura ese % extra por alquilar a nómadas vs contratos locales
    case
        when pb.precio_renta_media_p50_raw > 0
         and al.arriendo_p50 > 0
            then round(
                (((pb.precio_renta_media_p50_raw / al.arriendo_p50) - 1.0) * 100)::numeric,
                1
            )
        else null
    end                                                                       as premium_vs_largo_pct,

    round(al.arriendo_p50::numeric, 0)                                        as arriendo_largo_p50,

    now()                                                                     as calculado_en

from por_barrio pb
left join {{ source('geo', 'barrios') }} b  on pb.barrio_id = b.id
left join arriendo_largo              al  on pb.barrio_id = al.barrio_id
where pb.barrio_id is not null
