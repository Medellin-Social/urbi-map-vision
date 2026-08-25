{{
    config(
        materialized='table',
        schema='analytics'
    )
}}

with consolidado as (

    select
        barrio_id,
        nombre_barrio,
        comuna,
        municipio,
        score_corto,
        score_mediano,
        score_largo,
        yield_airbnb_pct,
        yield_bruto_pct,
        estado_precio
    from {{ ref('barrios_score_consolidado') }}

),

liquidez as (

    select
        barrio_id,
        liquidez_score,
        categoria_liquidez,
        tiempo_estimado_venta
    from {{ ref('barrios_liquidez') }}

),

mercado as (

    select
        barrio_id,
        yield_bruto,
        diferencia_total_pct
    from {{ ref('barrios_mercado') }}

),

base as (

    select
        c.*,
        l.liquidez_score,
        l.categoria_liquidez,
        l.tiempo_estimado_venta,
        -- yield_bruto: prefer barrios_mercado direct field, fallback to consolidado
        coalesce(m.yield_bruto, c.yield_bruto_pct)  as yield_efectivo,
        m.diferencia_total_pct
    from consolidado c
    left join liquidez l using (barrio_id)
    left join mercado  m using (barrio_id)

),

detectado as (

    select
        *,
        case
            when (estado_precio = 'BAJO' and coalesce(score_largo, 0) >= 55)
              or (coalesce(yield_efectivo, 0) >= 8 and estado_precio != 'SOBRE')
              or (coalesce(score_largo, 0) >= 75 and coalesce(liquidez_score, 0) >= 45)
            then true
            else false
        end as oportunidad_detectada,

        -- tipo_oportunidad por orden de prioridad
        case
            when estado_precio = 'BAJO' and coalesce(score_largo, 0) >= 55
                then 'PRECIO BAJO MERCADO'
            when coalesce(yield_efectivo, 0) >= 8 and estado_precio != 'SOBRE'
                then 'ALTO RENDIMIENTO'
            when coalesce(score_largo, 0) >= 75 and coalesce(liquidez_score, 0) >= 45
                then 'INVERSIÓN SEGURA'
            else null
        end as tipo_oportunidad,

        -- score_relevante según tipo
        case
            when estado_precio = 'BAJO' and coalesce(score_largo, 0) >= 55
                then score_largo
            when coalesce(yield_efectivo, 0) >= 8 and estado_precio != 'SOBRE'
                then score_corto
            when coalesce(score_largo, 0) >= 75 and coalesce(liquidez_score, 0) >= 45
                then score_largo
            else coalesce(score_largo, score_corto, score_mediano)
        end as score_relevante

    from base

)

select
    barrio_id,
    nombre_barrio,
    comuna,
    municipio,
    oportunidad_detectada,
    tipo_oportunidad,

    -- descripcion_oportunidad
    case
        when tipo_oportunidad = 'PRECIO BAJO MERCADO'
            then 'Cotiza ' ||
                 round(abs(coalesce(diferencia_total_pct, 10.0))::numeric, 1) ||
                 '% bajo precio justo según arriendo de la zona'
        when tipo_oportunidad = 'ALTO RENDIMIENTO'
            then 'Yield ' || round(yield_efectivo::numeric, 1) ||
                 '% — superior al promedio de Medellín (6.8%)'
        when tipo_oportunidad = 'INVERSIÓN SEGURA'
            then 'Score alto + mercado activo. Tiempo estimado de venta: ' ||
                 coalesce(tiempo_estimado_venta, 'N/D')
        else null
    end as descripcion_oportunidad,

    score_relevante,
    score_largo,
    score_corto,
    score_mediano,
    liquidez_score,
    categoria_liquidez,
    tiempo_estimado_venta,
    estado_precio,
    round(yield_efectivo::numeric, 2)   as yield_bruto_pct,

    now() as calculado_en

from detectado
where barrio_id is not null
