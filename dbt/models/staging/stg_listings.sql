{{
    config(
        materialized='table',
        schema='staging'
    )
}}

with fincaraiz as (
    select
        id,
        fuente,
        tipo_operacion,
        tipo_inmueble,
        precio,
        area_m2,
        habitaciones,
        banos,
        direccion_raw,
        barrio_raw,
        barrio_id,
        url,
        fecha_scraping,
        activo,
        fecha_publicacion,
        dedup_hash
    from {{ source('fincaraiz', 'listings_fincaraiz') }}
    where activo = true
      and precio > 0
      and precio != 11111111   -- placeholder cuando precio no disponible en la fuente
      and area_m2 > 0
      and barrio_id is not null
),

metrocuadrado as (
    select
        id,
        fuente,
        tipo_operacion,
        tipo_inmueble,
        precio,
        area_m2,
        habitaciones,
        banos,
        direccion_raw,
        barrio_raw,
        barrio_id,
        url,
        fecha_scraping,
        activo,
        fecha_publicacion,
        dedup_hash
    from {{ source('metrocuadrado', 'listings_metrocuadrado') }}
    where activo = true
      and precio > 0
      and precio != 11111111   -- placeholder cuando precio no disponible en la fuente
      and area_m2 > 0
      and barrio_id is not null
),

combined as (
    select * from fincaraiz
    union all
    select * from metrocuadrado
),

-- Deduplicar cross-fuente por dedup_hash.
-- Si mismo hash en ambas fuentes: preferir metrocuadrado (tiene lat/lon directo).
-- Fallback para rows sin hash: particionar por características físicas.
deduped as (
    select *,
        row_number() over (
            partition by
                coalesce(
                    dedup_hash,
                    barrio_id::text || '|' ||
                    tipo_operacion || '|' ||
                    tipo_inmueble || '|' ||
                    coalesce(habitaciones::text, '0') || '|' ||
                    round(area_m2::numeric, -1)::text || '|' ||
                    (round((precio / nullif(area_m2, 0))::numeric / 500) * 500)::text
                )
            order by
                case fuente when 'metrocuadrado' then 1 else 2 end,
                fecha_scraping desc nulls last
        ) as _rn
    from combined
),

base as (
    select
        id,
        fuente,
        tipo_operacion,
        tipo_inmueble,
        precio,
        area_m2,
        habitaciones,
        banos,
        direccion_raw,
        barrio_raw,
        barrio_id,
        url,
        fecha_scraping,
        activo,
        case
            when area_m2 > 0 then precio / area_m2
            else null
        end as precio_m2,
        fecha_publicacion,
        coalesce(
            current_date - fecha_publicacion,
            current_date - fecha_scraping::date
        )::integer as dias_en_mercado,

        case
            when tipo_operacion = 'venta' then round(precio * 0.97)
            else null
        end as precio_venta_real,

        case
            when tipo_operacion = 'arriendo' then round(precio * 0.90)
            else null
        end as precio_arriendo_real
    from deduped
    where _rn = 1
),

-- Percentil 5 y 95 de precio_m2 por tipo_operacion para filtrar outliers
percentiles as (

    select
        tipo_operacion,
        percentile_cont(0.05) within group (order by precio_m2) as p05,
        percentile_cont(0.95) within group (order by precio_m2) as p95
    from base
    where precio_m2 is not null
    group by tipo_operacion

)

select b.*
from base b
inner join percentiles p
    on b.tipo_operacion = p.tipo_operacion
where b.precio_m2 between p.p05 and p.p95
