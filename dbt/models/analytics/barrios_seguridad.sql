{{
    config(
        materialized='table',
        schema='analytics'
    )
}}

with seguridad as (

    select * from {{ ref('stg_seguridad') }}

),

-- Asignar comuna a cada barrio vía centroide espacial
-- raw.barrios.comuna está vacío; la única fuente es la geometría
barrios_con_comuna as (

    select
        b.id    as barrio_id,
        b.nombre as nombre_barrio,
        c.codigo as codigo_comuna,
        c.nombre as nombre_comuna
    from {{ source('geo', 'barrios') }}  b
    join {{ source('geo', 'comunas') }}  c
        on ST_Within(ST_Centroid(b.geometry), c.geometry)

),

ranked as (

    select
        bc.barrio_id,
        bc.nombre_barrio,
        bc.nombre_comuna                                                          as comuna,
        bc.codigo_comuna,
        s.zona_turistica,
        s.casos_residente_3anios,
        s.casos_residente_por_1000hab,
        s.casos_totales_3anios,
        s.casos_por_1000hab,
        -- score principal para el producto: no infla por tráfico peatonal
        s.score_seguridad_residente,
        rank() over (order by s.score_seguridad_residente desc nulls last)       as ranking_seguridad,
        -- score de contexto: densidad delictiva general (útil para zonas turísticas)
        s.score_seguridad_transito,
        s.tendencia
    from barrios_con_comuna bc
    left join seguridad s on s.codigo = bc.codigo_comuna

)

select
    *,

    case
        when score_seguridad_residente >= 80 then 'MUY SEGURO'
        when score_seguridad_residente >= 60 then 'SEGURO'
        when score_seguridad_residente >= 40 then 'MODERADO'
        when score_seguridad_residente >= 20 then 'PRECAUCIÓN'
        when score_seguridad_residente is not null then 'ALTO RIESGO'
    end                                                                             as categoria_seguridad,

    case
        when score_seguridad_residente >= 50 then null
        when zona_turistica
            then 'Zona de alto tráfico turístico. Hurtos principalmente a vehículos y residencias de alto valor. Tendencia: mejorando.'
        else 'Criminalidad residencial por encima del promedio de la ciudad.'
    end                                                                             as nota_seguridad

from ranked
