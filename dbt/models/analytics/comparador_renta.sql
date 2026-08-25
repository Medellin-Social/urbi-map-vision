{{
    config(
        materialized='view',
        schema='analytics'
    )
}}

with pivot as (

    select
        barrio_id,
        barrio_nombre,
        comuna,
        municipio,

        -- Renta corta (<7 días avg stay)
        max(case when tipo_renta = 'renta_corta'       then yield_pct      end) as yield_corta,
        max(case when tipo_renta = 'renta_corta'       then ocupacion_p50  end) as occ_corta,
        max(case when tipo_renta = 'renta_corta'       then adr_p50_usd    end) as adr_corta,
        max(case when tipo_renta = 'renta_corta'       then n_listings     end) as n_corta,

        -- Renta media (7-29 días avg stay)
        max(case when tipo_renta = 'renta_media'       then yield_pct      end) as yield_media,
        max(case when tipo_renta = 'renta_media'       then ocupacion_p50  end) as occ_media,
        max(case when tipo_renta = 'renta_media'       then adr_p50_usd    end) as adr_media,
        max(case when tipo_renta = 'renta_media'       then n_listings     end) as n_media,

        -- Renta larga Airbnb (>=30 días avg stay)
        max(case when tipo_renta = 'renta_larga_airbnb' then yield_pct     end) as yield_larga,
        max(case when tipo_renta = 'renta_larga_airbnb' then ocupacion_p50 end) as occ_larga,
        max(case when tipo_renta = 'renta_larga_airbnb' then adr_p50_usd   end) as adr_larga,
        max(case when tipo_renta = 'renta_larga_airbnb' then n_listings    end) as n_larga,

        count(distinct tipo_renta)                                              as tipos_con_datos

    from {{ ref('barrios_renta_segmentada') }}
    where yield_pct is not null
    group by barrio_id, barrio_nombre, comuna, municipio

)

select
    barrio_id,
    barrio_nombre,
    comuna,
    municipio,

    yield_corta,
    occ_corta,
    adr_corta,
    n_corta,

    yield_media,
    occ_media,
    adr_media,
    n_media,

    yield_larga,
    occ_larga,
    adr_larga,
    n_larga,

    tipos_con_datos,

    -- mejor_opcion: tipo con mayor yield (null si empate exacto — raro con decimales)
    case
        when greatest(
            coalesce(yield_corta, -1),
            coalesce(yield_media, -1),
            coalesce(yield_larga, -1)
        ) < 0 then null
        when yield_corta >= coalesce(yield_media, -1)
         and yield_corta >= coalesce(yield_larga, -1)
            then 'renta_corta'
        when yield_media >= coalesce(yield_corta, -1)
         and yield_media >= coalesce(yield_larga, -1)
            then 'renta_media'
        else 'renta_larga_airbnb'
    end                                                                     as mejor_opcion

from pivot
where tipos_con_datos >= 2
order by coalesce(yield_corta, yield_media, yield_larga) desc nulls last
