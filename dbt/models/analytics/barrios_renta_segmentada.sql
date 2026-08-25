{{
    config(
        materialized='table',
        schema='analytics'
    )
}}

{% set usd_to_cop = 4100 %}

with listings as (

    select * from {{ ref('stg_airbnb_segmentado') }}

),

-- Precio de venta directo desde stg_listings para evitar dependencia circular con barrios_mercado
mercado as (

    select
        barrio_id,
        percentile_cont(0.50) within group (order by precio_m2)  as precio_venta_m2_p50,
        avg(area_m2)                                              as area_promedio_m2
    from {{ ref('stg_listings') }}
    where tipo_operacion = 'venta'
    group by barrio_id
    having avg(area_m2) > 0

),

por_barrio_tipo as (

    select
        barrio_id,
        tipo_renta,
        count(*)                                                            as n_listings,

        round(
            cast(percentile_cont(0.50) within group (order by ttm_occupancy) as numeric) * 100,
            1
        )                                                                   as ocupacion_p50,

        round(
            cast(percentile_cont(0.50) within group (order by ttm_avg_rate_usd) as numeric),
            2
        )                                                                   as adr_p50_usd,

        round(
            cast(percentile_cont(0.50) within group (order by ttm_avg_rate_cop) as numeric),
            0
        )                                                                   as adr_p50_cop,

        -- revenue_anual_p50_usd = ADR_p50 × ocupacion_p50 × 365
        round(
            cast(percentile_cont(0.50) within group (order by ttm_avg_rate_usd) as numeric)
            * cast(percentile_cont(0.50) within group (order by ttm_occupancy) as numeric)
            * 365,
            0
        )                                                                   as revenue_anual_p50_usd

    from listings
    group by barrio_id, tipo_renta

)

select
    pbt.barrio_id,
    b.nombre                                                                as barrio_nombre,
    b.comuna,
    b.municipio,
    pbt.tipo_renta,
    pbt.n_listings,
    pbt.ocupacion_p50,
    pbt.adr_p50_usd,
    pbt.adr_p50_cop,
    pbt.revenue_anual_p50_usd,

    -- yield_pct = revenue_anual_p50_usd / valor_inmueble_usd × 100
    -- valor_inmueble_usd = (precio_venta_m2_p50_COP / fx) × area_promedio_m2
    case
        when m.precio_venta_m2_p50 > 0
         and m.area_promedio_m2    > 0
         and pbt.adr_p50_usd       > 0
        then round(
            (
                pbt.adr_p50_usd
                * (pbt.ocupacion_p50 / 100.0)
                * 365.0
                / (
                    (m.precio_venta_m2_p50 / {{ usd_to_cop }}::numeric)
                    * m.area_promedio_m2
                  )
                * 100
            )::numeric,
            2
        )
        else null
    end                                                                     as yield_pct,

    now()                                                                   as calculado_en

from por_barrio_tipo pbt
left join {{ source('geo', 'barrios') }}  b on pbt.barrio_id = b.id
left join mercado                         m on pbt.barrio_id = m.barrio_id
where pbt.barrio_id is not null
order by pbt.barrio_id, pbt.tipo_renta
