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

oficial as (

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
        s.score_seguridad_transito,
        s.tendencia,
        case
            when s.score_seguridad_residente >= 50 then null
            when s.zona_turistica
                then 'Zona de alto tráfico turístico. Hurtos principalmente a vehículos y residencias de alto valor. Tendencia: mejorando.'
            else 'Criminalidad residencial por encima del promedio de la ciudad.'
        end                                                                       as nota_seguridad
    from barrios_con_comuna bc
    left join seguridad s on s.codigo = bc.codigo_comuna

),

-- Municipios satélite del Valle de Aburrá sin fuente oficial de criminalidad por
-- barrio. Estimado municipal (mismos valores que scripts/load_seguridad_otros_municipios.py,
-- derivados de tasas de homicidio Policía Nacional 2022) — antes se cargaban por script
-- Python aparte, pero dbt recrea esta tabla cada corrida (materialized='table' =
-- DROP+CREATE) y los borraba. Viven acá para que sobrevivan al run nocturno.
perfiles_municipio (municipio, score_base) as (
    values
        ('BELLO',       54),
        ('ENVIGADO',    90),
        ('ITAGUI',      76),
        ('LA ESTRELLA', 90),
        ('SABANETA',    90)
),

barrios_satelite as (

    select
        b.id      as barrio_id,
        b.nombre  as nombre_barrio,
        b.municipio,
        ST_Centroid(b.geometry) as centro
    from {{ source('geo', 'barrios') }} b
    where upper(b.municipio) in (select municipio from perfiles_municipio)

),

-- Estación de policía a <1km del centroide del barrio: única fuente de bump.
policia_cercana as (

    select
        bs.barrio_id,
        min(ST_Distance(bs.centro::geography, p.geometry::geography)) as dist_m
    from barrios_satelite bs
    join {{ source('geo', 'pois') }} p on p.tipo = 'estacion_policia'
    group by bs.barrio_id

),

estimado as (

    select
        bs.barrio_id,
        bs.nombre_barrio,
        bs.municipio                                                              as comuna,
        bs.municipio                                                              as codigo_comuna,
        false                                                                      as zona_turistica,
        null::numeric                                                              as casos_residente_3anios,
        null::numeric                                                              as casos_residente_por_1000hab,
        null::numeric                                                              as casos_totales_3anios,
        null::numeric                                                              as casos_por_1000hab,
        -- Bump +5 SOLO por ser score estimado (sin dato oficial) y tener estación de
        -- policía a <1km. Nunca aplica a comunas de Medellín con dato real (CTE oficial).
        least(100, pm.score_base
            + case when pc.dist_m is not null and pc.dist_m < 1000 then 5 else 0 end
        )                                                                          as score_seguridad_residente,
        greatest(0, pm.score_base - 5)                                             as score_seguridad_transito,
        'ESTABLE'                                                                  as tendencia,
        'Estimado municipal (sin dato oficial de comuna).'
            || case when pc.dist_m is not null and pc.dist_m < 1000
                    then ' Ajustado al alza por estación de policía a menos de 1 km.'
                    else '' end                                                    as nota_seguridad
    from barrios_satelite bs
    join perfiles_municipio pm on pm.municipio = upper(bs.municipio)
    left join policia_cercana pc on pc.barrio_id = bs.barrio_id

),

unido as (

    select * from oficial
    union all
    select * from estimado

),

ranked as (

    select
        *,
        rank() over (order by score_seguridad_residente desc nulls last) as ranking_seguridad
    from unido

)

select
    *,

    case
        when score_seguridad_residente >= 80 then 'MUY SEGURO'
        when score_seguridad_residente >= 60 then 'SEGURO'
        when score_seguridad_residente >= 40 then 'MODERADO'
        when score_seguridad_residente >= 20 then 'PRECAUCIÓN'
        when score_seguridad_residente is not null then 'ALTO RIESGO'
    end                                                                             as categoria_seguridad

from ranked
