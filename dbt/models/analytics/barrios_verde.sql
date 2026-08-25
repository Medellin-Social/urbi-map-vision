{{
    config(
        materialized='table',
        schema='analytics'
    )
}}

-- Approximates green coverage per barrio using OSM park centroids from raw.pois.
-- OSM delivers park centroids (not polygons), so each centroid inside a barrio
-- represents one park estimated at 5 000 m² average urban park footprint.
-- For exact polygon intersection, load OSM park polygons separately.

with barrios as (

    select
        id          as barrio_id,
        nombre      as nombre_barrio,
        municipio,
        geometry
    from raw.barrios
    where geometry is not null

),

parques_por_barrio as (

    select
        b.barrio_id,
        count(p.id)                                                             as n_parques,
        round(cast(
            st_area(b.geometry::geography) as numeric
        ), 2)                                                                   as area_barrio_m2
    from barrios b
    left join raw.pois p
           on p.tipo = 'parque'
          and st_within(p.geometry, b.geometry)
    group by b.barrio_id, b.geometry

),

scored as (

    select
        pb.barrio_id,
        pb.n_parques,
        pb.area_barrio_m2,
        -- Proxy: 5 000 m² per park centroid
        round(cast(pb.n_parques * 5000.0 as numeric), 2)                       as area_parques_estimada_m2,
        case
            when pb.area_barrio_m2 > 0
                then round(cast(
                         pb.n_parques * 5000.0 / pb.area_barrio_m2 * 100
                     as numeric), 2)
            else 0
        end                                                                     as indice_verde_pct

    from parques_por_barrio pb

)

select
    s.barrio_id,
    b.nombre_barrio,
    b.municipio,
    s.n_parques,
    s.area_barrio_m2,
    s.area_parques_estimada_m2,
    s.indice_verde_pct,

    case
        when s.indice_verde_pct >= 20   then 'MUY VERDE'
        when s.indice_verde_pct >= 10   then 'VERDE'
        when s.indice_verde_pct >= 5    then 'MODERADO'
        else                                 'POCO VERDE'
    end                                                                         as categoria_verde,

    case
        when s.indice_verde_pct >= 20   then 15
        when s.indice_verde_pct >= 10   then 10
        when s.indice_verde_pct >= 5    then 6
        else                                 2
    end                                                                         as score_verde,

    now()                                                                       as calculado_en

from scored s
join barrios b using (barrio_id)
order by s.indice_verde_pct desc
