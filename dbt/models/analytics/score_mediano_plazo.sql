{{
    config(
        materialized='table',
        schema='analytics'
    )
}}

with mercado as (

    select * from {{ ref('barrios_mercado') }}

),

seguridad as (

    select * from {{ ref('barrios_seguridad') }}

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

pois as (

    select
        barrio_id,
        indice_nomada,
        n_yoga_1km
    from analytics.barrios_pois_distancia

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
        score_equipamiento
    from {{ ref('barrios_amenities') }}

),

base as (

    select
        bm.barrio_id,
        bm.barrio_nombre                                                        as nombre_barrio,
        bm.comuna,
        bm.municipio,

        coalesce(bm.yield_renta_media_pct, bm.yield_renta_media_airbnb_pct)    as yield_nomada,
        bm.yield_renta_media_pct,
        bm.yield_renta_media_airbnb_pct,
        bm.estado_precio,
        r.rating_location_avg,
        seg.tendencia,
        p.indice_nomada,
        p.n_yoga_1km,
        v.indice_verde_pct,
        v.categoria_verde,
        coalesce(v.score_verde, 2)                                              as score_verde,
        coalesce(e.score_equipamiento, 0)                                       as score_equipamiento

    from mercado bm
    left join seguridad                       seg on bm.barrio_id = seg.barrio_id
    left join rating_por_barrio                 r on bm.barrio_id = r.barrio_id
    left join pois                              p on bm.barrio_id = p.barrio_id
    left join verde                             v on bm.barrio_id = v.barrio_id
    left join equip                             e on bm.barrio_id = e.barrio_id

),

normalized as (

    select
        *,
        max(indice_nomada) over ()    as max_indice_nomada
    from base

),

scored as (

    select
        *,

        -- Componente 1: Yield inversor — renta media o Airbnb segmento medio (25 pts)
        case
            when yield_nomada >= 12             then 25
            when yield_nomada >= 10             then 20
            when yield_nomada >= 8              then 15
            when yield_nomada >= 6              then 10
            when yield_nomada >= 4              then 5
            when yield_nomada is not null       then 2
            else                                     0
        end                                                                    as yield_medio_score,

        -- Componente 2: Atractivo nómada — indice_nomada normalizado 0-30
        -- yoga ya integrado en indice_nomada por load_pois.py
        case
            when indice_nomada is not null
             and max_indice_nomada > 0
                then round(indice_nomada / max_indice_nomada * 30)
            else 0
        end                                                                    as nomada_score,

        -- Componente 3: Precio justo PBN (18 pts)
        case
            when estado_precio = 'BAJO'         then 18
            when estado_precio = 'NORMAL'       then 11
            when estado_precio = 'SOBRE'        then 3
            else                                     0
        end                                                                    as pbn_score,

        -- Componente 4: Seguridad percibida nómada — rating Airbnb + tendencia (12 pts)
        case
            when rating_location_avg >= 4.8 and tendencia = 'BAJANDO'  then 12
            when rating_location_avg >= 4.8                             then 10
            when rating_location_avg >= 4.5 and tendencia = 'BAJANDO'  then 8
            when rating_location_avg >= 4.5                             then 6
            when rating_location_avg >= 4.0                             then 4
            when rating_location_avg is null and tendencia = 'BAJANDO' then 6
            when rating_location_avg is null                            then 5
            else                                                              2
        end                                                                    as seg_medio_score,

        -- Componente 5: Índice verde (10 pts) — score_verde ya calculado en barrios_verde
        score_verde                                                            as verde_score,

        -- Componente 6: Score equipamiento Airbnb (5 pts max) — escalado a 5 desde 10
        round(cast(score_equipamiento * 0.5 as numeric))                       as equip_score

    from normalized

),

final as (

    select
        *,
        yield_medio_score + nomada_score + pbn_score + seg_medio_score
          + verde_score + equip_score                                           as score_mediano
    from scored

)

select
    barrio_id,
    nombre_barrio,
    comuna,
    municipio,

    score_mediano,

    case
        when score_mediano >= 80    then 'EXCELENTE PARA NÓMADAS'
        when score_mediano >= 60    then 'BUENO PARA NÓMADAS'
        when score_mediano >= 40    then 'MODERADO'
        when score_mediano >= 20    then 'BAJO'
        else                             'MUY BAJO'
    end                                                                        as categoria_mediano,

    case
        when score_mediano >= 80    then '#10b981'
        when score_mediano >= 60    then '#00d4ff'
        when score_mediano >= 40    then '#f59e0b'
        when score_mediano >= 20    then '#ef4444'
        else                             '#6b7280'
    end                                                                        as color_mediano,

    yield_medio_score,
    nomada_score,
    pbn_score,
    seg_medio_score,
    verde_score                                                                as pts_verde,
    equip_score                                                                as pts_equip,

    yield_nomada,
    yield_renta_media_pct,
    yield_renta_media_airbnb_pct,
    estado_precio,
    indice_nomada,
    n_yoga_1km                                                                 as n_yoga,
    indice_verde_pct,
    categoria_verde                                                            as categoria,
    rating_location_avg,
    tendencia,

    now()                                                                      as calculado_en

from final
order by score_mediano desc
