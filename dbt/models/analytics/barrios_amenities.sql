{{
    config(
        materialized='table',
        schema='analytics'
    )
}}

with amenities as (

    select * from {{ ref('stg_airbnb_amenities') }}

),

aggregated as (

    select
        barrio_id,
        count(*)                                                                as n_listings,
        round(cast(avg(flag_wifi::int)    * 100 as numeric), 1)                as pct_wifi,
        round(cast(avg(flag_ac::int)      * 100 as numeric), 1)                as pct_ac,
        round(cast(avg(flag_kitchen::int) * 100 as numeric), 1)                as pct_kitchen,
        round(cast(avg(flag_washer::int)  * 100 as numeric), 1)                as pct_washer
    from amenities
    group by barrio_id

)

select
    a.barrio_id,
    b.nombre                                                                    as nombre_barrio,
    b.municipio,
    a.n_listings,
    a.pct_wifi,
    a.pct_ac,
    a.pct_kitchen,
    a.pct_washer,

    -- score_equipamiento 0-10 pts
    case when a.pct_wifi    >= 90 then 4 else 0 end
  + case when a.pct_kitchen >= 80 then 3 else 0 end
  + case when a.pct_ac      >= 60 then 2 else 0 end
  + case when a.pct_washer  >= 50 then 1 else 0 end                            as score_equipamiento,

    now()                                                                       as calculado_en

from aggregated a
join raw.barrios b on b.id = a.barrio_id
order by score_equipamiento desc
