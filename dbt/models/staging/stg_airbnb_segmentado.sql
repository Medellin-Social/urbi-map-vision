{{
    config(
        materialized='table',
        schema='staging'
    )
}}

{% set usd_to_cop = 4100 %}

with source as (

    select
        listing_id,
        barrio_id,
        room_type,
        bedrooms,
        baths,
        ttm_occupancy,
        ttm_avg_rate                                                        as ttm_avg_rate_usd,
        coalesce(
            ttm_avg_rate_native,
            ttm_avg_rate * {{ usd_to_cop }}
        )                                                                   as ttm_avg_rate_cop,
        ttm_revenue                                                         as ttm_revenue_usd,
        ttm_avg_min_nights,
        ttm_avg_length_of_stay
    from {{ source('airbnb', 'airbnb_listings_portal') }}
    where barrio_id              is not null
      and ttm_occupancy          is not null
      and ttm_avg_rate           is not null
      and ttm_avg_length_of_stay is not null
      and ttm_occupancy          > 0
      and ttm_avg_rate           > 0

)

select
    listing_id,
    barrio_id,
    room_type,
    bedrooms,
    baths,
    ttm_occupancy,
    ttm_avg_rate_usd,
    ttm_avg_rate_cop,
    ttm_revenue_usd,
    ttm_avg_min_nights,
    ttm_avg_length_of_stay,

    case
        when ttm_avg_length_of_stay <  7  then 'renta_corta'
        when ttm_avg_length_of_stay < 30  then 'renta_media'
        else                                   'renta_larga_airbnb'
    end                                                                     as tipo_renta,

    (ttm_avg_min_nights >= 28)                                              as flag_mensual

from source
