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
        lat,
        lon,
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
        lat,
        lon,
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
        lat,
        lon,
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

-- Coordenadas "fallback": cuando el geocoder de la fuente no ubica un
-- listing, cae a un punto por defecto (centroide de zona/ciudad) en vez de
-- fallar. Un mismo lat/lon compartido por decenas de barrio_raw DISTINTOS
-- (ej. 512 listings, 172 barrios distintos, misma coordenada exacta) no es
-- un edificio real con muchas unidades — es el bug del geocoder. Esto
-- contamina barrios_mercado: precios de El Poblado etiquetados "El Poblado"
-- en el texto pero con esta coordenada caen dentro del polígono de Carpinelo
-- (barrio real, sin relación) y arrastran su mediana de precio_m2 al alza.
-- Verificado 2026-08-28. Umbral > 3 barrios distintos en el mismo punto —
-- un edificio real con varias unidades en venta comparte 1-2 variantes de
-- nombre como mucho, no docenas.
coords_fallback as (

    select lat, lon
    from base
    where lat is not null and lon is not null
    group by lat, lon
    having count(distinct barrio_raw) > 3

),

-- Choque de nombre de barrio entre municipios: algunos nombres de barrio se
-- repiten en más de un municipio del Valle de Aburrá pero raw.barrios solo
-- tiene la fila de Medellín (ej. "La Frontera" — existe en Envigado y en
-- Medellín/Santa Cruz, pero solo la segunda está en nuestra tabla). Un
-- listing cuya dirección dice "La Frontera, Envigado" no tiene otro barrio_id
-- al que matchear por nombre y cae en el de Medellín, inflando su precio_m2
-- con precios de otro municipio. Verificado 2026-08-28 — mismo tipo de
-- contaminación que coords_fallback arriba, cadena de causa distinta.
municipio_mismatch as (

    select b.url
    from base b
    join raw.barrios rb on rb.id = b.barrio_id
    where rb.municipio = 'MEDELLIN'
      and b.direccion_raw ~* '(envigado|itag[uü]i|bello|sabaneta|estrella|caldas|copacabana|girardota|barbosa)'

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
left join coords_fallback cf
    on cf.lat = b.lat and cf.lon = b.lon
left join municipio_mismatch mm
    on mm.url = b.url
where b.precio_m2 between p.p05 and p.p95
  and cf.lat is null
  and mm.url is null
