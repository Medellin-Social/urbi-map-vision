{{
    config(
        materialized='table',
        schema='staging'
    )
}}

/*
  Serie trimestral de valorización de vivienda nueva en Medellín.
  Combina IPVN DANE + IPVU Banrep (cuando disponible) en una serie limpia.

  Fusionadas 2026-08-23 en una sola tabla raw.indices_precio_vivienda
  (discriminador: fuente='dane' | fuente='banrep_suameca_oac'), antes
  raw.ipvn_dane + raw.ipvu_banrep — cargadas vía scripts/load_ipvn.py y
  scripts/fetch_ipvu_banrep.py (ambos actualizados para escribir a la tabla
  fusionada).

  Nota estrato DANE:
    bajo  = estratos 1, 2, 3
    medio = estrato 4
    alto  = estratos 5, 6
*/

with ipvn as (

    select
        anio,
        trimestre,
        -- Índice total Medellín (base ~2016)
        max(case when estrato = 'total' then indice               end) as ipvn_indice,
        max(case when estrato = 'total' then variacion_anual_pct  end) as var_anual_nueva_pct,
        max(case when estrato = 'total' then variacion_trimestral_pct end) as var_trim_nueva_pct,
        -- Por estrato
        max(case when estrato = 'bajo'  then variacion_anual_pct  end) as var_anual_bajo_pct,
        max(case when estrato = 'medio' then variacion_anual_pct  end) as var_anual_medio_pct,
        max(case when estrato = 'alto'  then variacion_anual_pct  end) as var_anual_alto_pct
    from {{ source('valorizacion', 'indices_precio_vivienda') }}
    where fuente = 'dane'
    group by anio, trimestre

),

ipvu as (

    select
        anio,
        trimestre,
        indice_nominal     as ipvu_indice,
        variacion_anual_pct as var_anual_usada_pct
    from {{ source('valorizacion', 'indices_precio_vivienda') }}
    where fuente like 'banrep%'

),

joined as (

    select
        n.anio,
        n.trimestre,

        -- Periodo canónico YYYY-QN
        n.anio::text || '-' || n.trimestre        as periodo,

        -- Primer día del trimestre
        make_date(
            n.anio,
            case n.trimestre
                when 'Q1' then 1
                when 'Q2' then 4
                when 'Q3' then 7
                when 'Q4' then 10
            end,
            1
        )                                          as fecha_inicio,

        n.ipvn_indice                              as ipvn_medellin,
        u.ipvu_indice                              as ipvu_medellin,

        n.var_anual_nueva_pct,
        u.var_anual_usada_pct,

        -- Promedio IPVN+IPVU cuando ambos disponibles; solo IPVN si IPVU nulo
        case
            when n.var_anual_nueva_pct is not null
             and u.var_anual_usada_pct is not null
            then round(((n.var_anual_nueva_pct + u.var_anual_usada_pct) / 2.0)::numeric, 4)
            else n.var_anual_nueva_pct
        end                                        as var_promedio_pct,

        n.var_anual_bajo_pct,
        n.var_anual_medio_pct,
        n.var_anual_alto_pct,

        case
            when n.var_anual_nueva_pct > 5   then 'SUBIENDO'
            when n.var_anual_nueva_pct >= 0  then 'ESTABLE'
            when n.var_anual_nueva_pct < 0   then 'BAJANDO'
            else                                  null
        end                                        as tendencia

    from ipvn n
    left join ipvu u
        on n.anio = u.anio and n.trimestre = u.trimestre

)

select
    *,
    now() as calculado_en
from joined
order by anio, trimestre
