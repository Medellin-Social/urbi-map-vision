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

base as (

    select
        bm.barrio_id,
        bm.barrio_nombre                                                         as nombre_barrio,
        bm.comuna,
        null::integer                                                            as estrato,

        -- Mejor yield Airbnb: real si disponible, mock como fallback
        coalesce(ar.yield_airbnb_real_pct, bm.yield_airbnb_pct)                as yield_airbnb_best,
        bm.yield_bruto                                                           as yield_largo,
        bm.yield_renta_media_pct,

        -- Mejor yield entre los tres tipos disponibles
        greatest(
            coalesce(ar.yield_airbnb_real_pct, bm.yield_airbnb_pct),
            bm.yield_bruto,
            bm.yield_renta_media_pct
        )                                                                        as mejor_yield_pct,

        -- Estado precio PBN
        bm.estado_precio,

        -- Seguridad (propagada desde barrios_seguridad via barrios_mercado)
        bm.score_seguridad                                                       as score_seguridad_residente,
        bm.categoria_seguridad,

        -- Conectividad: fuente no disponible aún → NULL → 5 pts por defecto
        null::numeric                                                            as dist_metro_km,

        -- Conteos para score de confiabilidad
        coalesce(bm.n_venta, 0)                                                 as n_venta,
        coalesce(bm.n_arriendo, 0)                                              as n_arriendo,
        coalesce(ar.n_listings_airbnb, bm.airbnb_n_listings, 0)                as n_listings_airbnb,
        coalesce(bm.n_venta, 0)
            + coalesce(bm.n_arriendo, 0)
            + coalesce(ar.n_listings_airbnb, bm.airbnb_n_listings, 0)          as n_datos_total,

        -- Métricas para el panel de Mapbox
        bm.precio_venta_m2_p50                                                  as precio_m2_venta,
        bm.precio_arriendo_p50                                                  as arriendo_p50,
        coalesce(ar.ocupacion_p50_pct, bm.ocupacion_airbnb_pct)                as score_airbnb_ocupacion,
        coalesce(ar.adr_p50_cop, bm.adr_noche_cop)                             as adr_cop

    from mercado bm
    left join airbnb_real ar on bm.barrio_id = ar.barrio_id

),

scored as (

    select
        *,

        -- 1. Yield Score (35 pts máx)
        case
            when mejor_yield_pct is null    then 0
            when mejor_yield_pct >= 12      then 35
            when mejor_yield_pct >= 10      then 30
            when mejor_yield_pct >= 8       then 25
            when mejor_yield_pct >= 6       then 18
            when mejor_yield_pct >= 4       then 10
            else                                 5
        end                                                                      as score_yield,

        -- 2. Estado Precio PBN (25 pts máx)
        case
            when estado_precio = 'BAJO'     then 25
            when estado_precio = 'NORMAL'   then 15
            when estado_precio = 'SOBRE'    then 5
            else                                 0
        end                                                                      as score_precio,

        -- 3. Seguridad (20 pts máx; NULL → 10 puntos neutros)
        case
            when score_seguridad_residente is null
                then 10
            else round((score_seguridad_residente / 100.0 * 20)::numeric, 0)
        end::integer                                                             as score_seguridad,

        -- 4. Conectividad dist_metro_km (15 pts máx; NULL → 5 puntos por falta de fuente)
        case
            when dist_metro_km is null      then 5
            when dist_metro_km <= 0.5       then 15
            when dist_metro_km <= 1.0       then 12
            when dist_metro_km <= 2.0       then 9
            when dist_metro_km <= 3.0       then 6
            else                                 3
        end                                                                      as score_conectividad,

        -- 5. Confiabilidad de datos (5 pts máx)
        case
            when n_datos_total >= 20        then 5
            when n_datos_total >= 10        then 3
            when n_datos_total >= 5         then 2
            else                                 1
        end                                                                      as score_confiabilidad,

        -- Tipo de renta con mejor yield (prioridad: AIRBNB > RENTA_MEDIA > LARGO_PLAZO en empate)
        case
            when mejor_yield_pct is null
                then null
            when yield_airbnb_best is not null
                 and round(yield_airbnb_best::numeric, 4) = round(mejor_yield_pct::numeric, 4)
                then 'AIRBNB'
            when yield_renta_media_pct is not null
                 and round(yield_renta_media_pct::numeric, 4) = round(mejor_yield_pct::numeric, 4)
                then 'RENTA_MEDIA'
            when yield_largo is not null
                then 'LARGO_PLAZO'
            else null
        end                                                                      as mejor_tipo_renta

    from base

),

final as (

    select
        *,
        score_yield
            + score_precio
            + score_seguridad
            + score_conectividad
            + score_confiabilidad                                                as score_total
    from scored

)

select
    barrio_id,
    nombre_barrio,
    comuna,
    estrato,

    score_total,

    case
        when score_total >= 80  then 'EXCELENTE'
        when score_total >= 60  then 'BUENO'
        when score_total >= 40  then 'MODERADO'
        when score_total >= 20  then 'BAJO'
        else                         'MUY BAJO'
    end                                                                          as categoria_inversion,

    case
        when score_total >= 80  then '#10b981'
        when score_total >= 60  then '#00d4ff'
        when score_total >= 40  then '#f59e0b'
        when score_total >= 20  then '#ef4444'
        else                         '#6b7280'
    end                                                                          as color_hex,

    score_yield,
    score_precio,
    score_seguridad,
    score_conectividad,
    score_confiabilidad,

    mejor_yield_pct,
    mejor_tipo_renta,
    estado_precio,
    categoria_seguridad,
    dist_metro_km,
    n_datos_total,

    precio_m2_venta,
    arriendo_p50,
    score_airbnb_ocupacion,
    adr_cop,

    now()                                                                        as calculado_en

from final
order by score_total desc
