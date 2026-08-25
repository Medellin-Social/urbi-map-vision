{{
    config(
        materialized='table',
        schema='analytics'
    )
}}

with mercado as (

    select * from {{ ref('barrios_mercado') }}

),

airbnb_real as (

    select * from {{ ref('barrios_airbnb_real') }}

),

rating_por_barrio as (

    select
        barrio_id,
        round(avg(rating_location)::numeric, 2)    as rating_location_avg
    from {{ source('airbnb', 'airbnb_listings_portal') }}
    where rating_location is not null
      and barrio_id       is not null
    group by barrio_id

),

base as (

    select
        bm.barrio_id,
        bm.barrio_nombre                                                        as nombre_barrio,
        bm.comuna,
        bm.municipio,

        coalesce(ar.yield_airbnb_real_pct, bm.yield_airbnb_pct)               as mejor_yield_airbnb,
        coalesce(ar.n_listings_airbnb, bm.airbnb_n_listings, 0)               as n_listings_airbnb,
        ar.ocupacion_p50_pct / 100.0                                           as ocupacion_p50,
        r.rating_location_avg,
        p.dist_mall_km

    from mercado bm
    left join airbnb_real                   ar on bm.barrio_id = ar.barrio_id
    left join rating_por_barrio              r on bm.barrio_id = r.barrio_id
    left join analytics.barrios_pois_distancia p on bm.barrio_id = p.barrio_id

),

scored as (

    select
        *,

        -- Componente 1: Yield Airbnb (40 pts)
        case
            when mejor_yield_airbnb >= 15               then 40
            when mejor_yield_airbnb >= 12               then 35
            when mejor_yield_airbnb >= 10               then 28
            when mejor_yield_airbnb >= 8                then 20
            when mejor_yield_airbnb >= 6                then 12
            when mejor_yield_airbnb is not null         then 5
            else                                             0
        end                                                                    as yield_score,

        -- Componente 2a: Demanda turística — rating location (15 pts; neutro si sin datos)
        case
            when rating_location_avg >= 4.8             then 15
            when rating_location_avg >= 4.5             then 10
            when rating_location_avg >= 4.0             then 6
            when rating_location_avg is not null        then 2
            else                                             8
        end                                                                    as rating_score,

        -- Componente 2b: Demanda turística — volumen listings (15 pts)
        case
            when n_listings_airbnb >= 100               then 15
            when n_listings_airbnb >= 50                then 10
            when n_listings_airbnb >= 20                then 6
            when n_listings_airbnb >= 5                 then 3
            else                                             2
        end                                                                    as listings_score,

        -- Componente 3: Ocupación real (20 pts; neutro si sin datos)
        case
            when ocupacion_p50 >= 0.60                  then 20
            when ocupacion_p50 >= 0.50                  then 16
            when ocupacion_p50 >= 0.40                  then 12
            when ocupacion_p50 >= 0.30                  then 7
            when ocupacion_p50 is not null              then 3
            else                                             8
        end                                                                    as ocupacion_score,

        -- Componente 4: Conectividad turística — dist al mall (10 pts)
        case
            when dist_mall_km <= 1.0                    then 10
            when dist_mall_km <= 2.0                    then 7
            when dist_mall_km <= 3.0                    then 4
            else                                             2
        end                                                                    as mall_score

    from base

),

final as (

    select
        *,
        yield_score + rating_score + listings_score + ocupacion_score + mall_score  as score_corto
    from scored

)

select
    barrio_id,
    nombre_barrio,
    comuna,
    municipio,

    score_corto,

    case
        when score_corto >= 80  then 'EXCELENTE'
        when score_corto >= 60  then 'BUENO'
        when score_corto >= 40  then 'MODERADO'
        when score_corto >= 20  then 'BAJO'
        else                         'MUY BAJO'
    end                                                                        as categoria_corto,

    case
        when score_corto >= 80  then '#10b981'
        when score_corto >= 60  then '#00d4ff'
        when score_corto >= 40  then '#f59e0b'
        when score_corto >= 20  then '#ef4444'
        else                         '#6b7280'
    end                                                                        as color_corto,

    yield_score,
    rating_score,
    listings_score,
    ocupacion_score,
    mall_score,

    mejor_yield_airbnb,
    n_listings_airbnb,
    ocupacion_p50,
    rating_location_avg,
    dist_mall_km,

    now()                                                                      as calculado_en

from final
order by score_corto desc
