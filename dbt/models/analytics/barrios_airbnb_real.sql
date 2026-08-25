{{
    config(
        materialized='table',
        schema='analytics'
    )
}}

-- Tasa de cambio USD→COP: public.trm (fetch_trm.py, semanal, TRM oficial
-- datos.gov.co) — antes constante hardcodeada 4100, fusionado 2026-08-23
-- junto con scripts/compute_barrios_airbnb.py para leer la misma fuente.
with trm as (

    select valor as usd_to_cop
    from {{ source('finanzas', 'trm') }}
    where moneda = 'USD'

),

listings as (

    select
        l.listing_id,
        l.barrio_id,
        l.room_type,
        l.bedrooms,
        l.ttm_occupancy,
        l.ttm_avg_rate                                             as adr_usd,
        l.ttm_avg_rate_native                                      as adr_cop_native,
        -- Si native rate no está disponible, derivar con fx vigente
        coalesce(
            l.ttm_avg_rate_native,
            l.ttm_avg_rate * trm.usd_to_cop
        )                                                          as adr_cop,
        l.ttm_revenue                                              as revenue_usd,
        l.ttm_revpar                                               as revpar_usd,
        l.num_reviews,
        l.rating_overall,
        l.superhost,
        l.professional_management
    from {{ source('airbnb', 'airbnb_listings_portal') }} l
    cross join trm
    where l.barrio_id is not null
      and l.ttm_occupancy  is not null
      and l.ttm_avg_rate   is not null
      and l.ttm_occupancy  > 0
      and l.ttm_avg_rate   > 0

),

-- Mock: datos estimados previos de raw.airbnb_barrios (para comparación)
mock as (

    select distinct on (barrio_id)
        barrio_id,
        n_listings                                                  as mock_n_listings,
        ocupacion_pct                                               as mock_ocupacion_pct,
        adr_cop                                                     as mock_adr_cop,
        ingresos_anuales_estimados                                  as mock_ingresos_anuales_cop
    from {{ source('airbnb', 'airbnb_barrios') }}
    where barrio_id is not null
    order by barrio_id, fecha_consulta desc

),

-- Aggregate real metrics per barrio
por_barrio as (

    select
        barrio_id,
        count(*)                                                     as n_listings_airbnb,
        count(*) filter (where room_type = 'entire_home')           as n_entire_home,
        count(*) filter (where room_type = 'private_room')          as n_private_room,
        count(*) filter (where superhost = true)                    as n_superhosts,

        -- Occupancy medians (real data)
        round(
            cast(percentile_cont(0.50) within group (order by ttm_occupancy) as numeric) * 100,
            1
        )                                                            as ocupacion_p50_pct,
        round(
            cast(percentile_cont(0.25) within group (order by ttm_occupancy) as numeric) * 100,
            1
        )                                                            as ocupacion_p25_pct,
        round(
            cast(percentile_cont(0.75) within group (order by ttm_occupancy) as numeric) * 100,
            1
        )                                                            as ocupacion_p75_pct,

        -- ADR medians
        round(
            cast(percentile_cont(0.50) within group (order by adr_usd) as numeric),
            2
        )                                                            as adr_p50_usd,
        round(
            cast(percentile_cont(0.50) within group (order by adr_cop) as numeric),
            0
        )                                                            as adr_p50_cop,

        -- Annual revenue estimate per listing (median)
        round(
            cast(
                percentile_cont(0.50) within group (order by adr_usd) as numeric
            )
            * cast(
                percentile_cont(0.50) within group (order by ttm_occupancy) as numeric
            )
            * 365,
            0
        )                                                            as ingresos_anuales_p50_usd,

        -- Ratings
        round(avg(rating_overall)::numeric, 2)                      as rating_promedio,
        round(avg(num_reviews)::numeric, 0)                         as reviews_promedio

    from listings
    group by barrio_id

),

-- Join with sale price data from barrios_mercado for yield calculation
mercado as (

    select
        barrio_id,
        precio_venta_m2_p50,
        area_promedio_m2
    from {{ ref('barrios_mercado') }}
    where precio_venta_m2_p50 is not null
      and area_promedio_m2    is not null
      and area_promedio_m2    > 0

)

select
    pb.barrio_id,
    b.nombre                                                         as barrio_nombre,
    b.comuna,
    b.municipio,

    -- Real listing counts
    pb.n_listings_airbnb,
    pb.n_entire_home,
    pb.n_private_room,
    pb.n_superhosts,

    -- Real occupancy (%)
    pb.ocupacion_p25_pct,
    pb.ocupacion_p50_pct,
    pb.ocupacion_p75_pct,

    -- Real ADR
    pb.adr_p50_usd,
    pb.adr_p50_cop,

    -- Real annual revenue estimate (median listing, USD)
    pb.ingresos_anuales_p50_usd,
    round(pb.ingresos_anuales_p50_usd * t.usd_to_cop)               as ingresos_anuales_p50_cop,

    -- Real Airbnb yield
    -- = (ADR_p50 × ocupacion_p50 × 365) / (precio_m2_p50 × area_promedio) × 100
    case
        when m.precio_venta_m2_p50 > 0
         and m.area_promedio_m2    > 0
         and pb.adr_p50_usd        > 0
        then round(
            (
                pb.adr_p50_usd
                * (pb.ocupacion_p50_pct / 100.0)
                * 365.0
                / (
                    (m.precio_venta_m2_p50 / t.usd_to_cop::numeric)
                    * m.area_promedio_m2
                  )
                * 100
            )::numeric,
            2
        )
        else null
    end                                                              as yield_airbnb_real_pct,

    -- Ratings
    pb.rating_promedio,
    pb.reviews_promedio,

    -- Sale price context (from barrios_mercado)
    m.precio_venta_m2_p50                                           as precio_venta_m2_p50_cop,
    m.area_promedio_m2,

    -- COMPARACIÓN vs MOCK (datos estimados anteriores)
    mk.mock_n_listings,
    mk.mock_ocupacion_pct,
    mk.mock_adr_cop,
    mk.mock_ingresos_anuales_cop,

    -- Diff real vs mock
    pb.ocupacion_p50_pct - mk.mock_ocupacion_pct                    as diff_ocupacion_pct,
    pb.adr_p50_cop - mk.mock_adr_cop                                as diff_adr_cop,

    now()                                                            as calculado_en

from por_barrio pb
cross join trm                            t
left join {{ source('geo', 'barrios') }}  b  on pb.barrio_id = b.id
left join mercado                          m  on pb.barrio_id = m.barrio_id
left join mock                            mk  on pb.barrio_id = mk.barrio_id
where pb.barrio_id is not null
order by pb.n_listings_airbnb desc
