{{
    config(
        materialized='table',
        schema='staging'
    )
}}

-- Población por comuna (DANE 2023, proyecciones municipio de Medellín)
-- Solo comunas urbanas 01-16; corregimientos excluidos por falta de datos de mercado.
with poblacion as (

    select codigo, poblacion from (values
        ('01', 124724),
        ('02', 110985),
        ('03', 163504),
        ('04', 160420),
        ('05', 157313),
        ('06', 188386),
        ('07', 183086),
        ('08', 130442),
        ('09', 135025),
        ('10',  72373),
        ('11', 121408),
        ('12',  99124),
        ('13', 135066),
        ('14', 128406),
        ('15',  88021),
        ('16', 204275)
    ) as t(codigo, poblacion)

),

-- Zonas donde el alto tráfico de no-residentes infla artificialmente los números
-- globales de criminalidad pero no refleja el riesgo real para quien vive ahí.
zona_turistica as (

    select codigo from (values
        ('10'),   -- La Candelaria / Centro
        ('11'),   -- Laureles Estadio
        ('14')    -- El Poblado
    ) as t(codigo)

),

-- Últimos 3 años disponibles, excluyendo registros sin comuna asignada
criminalidad as (

    select
        lpad(geo_codigo, 2, '0')      as codigo_comuna,
        conducta,
        anio,
        cantidad_casos
    from {{ source('seguridad', 'criminalidad') }}
    where geo_nivel = 'comuna'
      and periodo_tipo = 'anual'
      and geo_codigo != 'SIN DATO'
      and geo_codigo ~ '^[0-9]+$'
      and anio >= (
          select max(anio) - 2
          from {{ source('seguridad', 'criminalidad') }}
          where geo_nivel = 'comuna' and periodo_tipo = 'anual'
      )

),

anio_max as (

    select
        max(anio) as anio_actual,
        max(anio) - 1 as anio_anterior
    from criminalidad

),

por_comuna as (

    select
        c.codigo_comuna,

        -- Todos los delitos (base para score_transito y tendencia)
        sum(c.cantidad_casos)                                                       as casos_totales_3anios,
        sum(case when c.anio = am.anio_actual   then c.cantidad_casos else 0 end)   as casos_anio_actual,
        sum(case when c.anio = am.anio_anterior then c.cantidad_casos else 0 end)   as casos_anio_anterior,

        -- Delitos que afectan directamente a residentes: hurto a residencia + homicidio
        sum(case
            when c.conducta in ('Hurto a residencia', 'Homicidio')
            then c.cantidad_casos else 0
        end)                                                                        as casos_residente_3anios,
        sum(case
            when c.conducta in ('Hurto a residencia', 'Homicidio')
             and c.anio = am.anio_actual
            then c.cantidad_casos else 0
        end)                                                                        as casos_residente_anio_actual,
        sum(case
            when c.conducta in ('Hurto a residencia', 'Homicidio')
             and c.anio = am.anio_anterior
            then c.cantidad_casos else 0
        end)                                                                        as casos_residente_anio_anterior

    from criminalidad c
    cross join anio_max am
    group by c.codigo_comuna

),

joined as (

    select
        com.id                                                                      as comuna_id,
        com.codigo,
        com.nombre,
        (zt.codigo is not null)                                                     as zona_turistica,
        pc.casos_totales_3anios,
        pc.casos_anio_actual,
        pc.casos_anio_anterior,
        pc.casos_residente_3anios,
        pc.casos_residente_anio_actual,
        pc.casos_residente_anio_anterior,
        p.poblacion,
        round(
            (pc.casos_totales_3anios::numeric / nullif(p.poblacion, 0)) * 1000, 1
        )                                                                           as casos_por_1000hab,
        round(
            (pc.casos_residente_3anios::numeric / nullif(p.poblacion, 0)) * 1000, 2
        )                                                                           as casos_residente_por_1000hab
    from por_comuna pc
    join {{ source('geo', 'comunas') }} com   on com.codigo = pc.codigo_comuna
    left join poblacion p                     on p.codigo   = pc.codigo_comuna
    left join zona_turistica zt               on zt.codigo  = pc.codigo_comuna

),

scored as (

    select
        *,
        -- Scoring transito (todos los delitos): mantener igual que antes
        min(casos_por_1000hab)          over () as min_transito,
        max(casos_por_1000hab)          over () as max_transito,
        -- Scoring residente (hurto residencia + homicidio)
        min(casos_residente_por_1000hab) over () as min_residente,
        max(casos_residente_por_1000hab) over () as max_residente
    from joined

)

select
    comuna_id,
    codigo,
    nombre,
    zona_turistica,
    casos_totales_3anios,
    casos_residente_3anios,
    casos_por_1000hab,
    casos_residente_por_1000hab,

    -- score_seguridad_residente: señal principal para el inversor
    -- Basado solo en hurto a residencia + homicidio; no infla por tráfico peatonal
    round(
        100.0 - (
            (casos_residente_por_1000hab - min_residente)
            / nullif(max_residente - min_residente, 0)
            * 100.0
        )
    )::integer                                                                      as score_seguridad_residente,

    -- score_seguridad_transito: densidad delictiva general (contexto, no señal principal)
    round(
        100.0 - (
            (casos_por_1000hab - min_transito)
            / nullif(max_transito - min_transito, 0)
            * 100.0
        )
    )::integer                                                                      as score_seguridad_transito,

    -- Tendencia basada en delitos residentes (más relevante para el inversor)
    case
        when casos_residente_anio_anterior = 0
            then 'ESTABLE'
        when (casos_residente_anio_actual - casos_residente_anio_anterior)::numeric
             / nullif(casos_residente_anio_anterior, 0) > 0.05
            then 'SUBIENDO'
        when (casos_residente_anio_actual - casos_residente_anio_anterior)::numeric
             / nullif(casos_residente_anio_anterior, 0) < -0.05
            then 'BAJANDO'
        else 'ESTABLE'
    end                                                                             as tendencia

from scored
