{{
    config(
        materialized='table',
        schema='analytics'
    )
}}

/*
  Proyecciones de valorización para Medellín con ajuste por estrato.

  Nivel ciudad: IPVN total Medellín (sin distinción de barrio).
  Ajuste estrato:
    estrato 5-6 (alto)  → baseline × 1.15
    estrato 4   (medio) → baseline × 1.05
    estrato 3   (bajo)  → baseline × 1.00
    estrato 1-2 (bajo)  → baseline × 0.90

  Referencia estrato DANE → sistema:
    DANE "alto"  = estratos 5-6
    DANE "medio" = estrato 4
    DANE "bajo"  = estratos 1-3  (en el modelo usamos factor 1.00 para estrato 3,
                                   0.90 para estratos 1-2 — aplicado en score_largo_plazo)
*/

with serie as (

    select *
    from {{ ref('stg_valorizacion') }}
    where var_promedio_pct is not null

),

-- Último año calendario completo disponible
ultimo_anio as (
    select max(anio) as anio
    from serie
    where trimestre = 'Q4'
),

-- Promedio anual de Q4 a Q4 (solo usar Q4 para métricas anuales limpias)
anual_q4 as (

    select
        anio,
        var_promedio_pct
    from serie
    where trimestre = 'Q4'

),

metricas as (

    select
        -- Promedio últimos 5 años
        round(
            avg(var_promedio_pct) filter (
                where anio >= (select anio - 4 from ultimo_anio)
            )::numeric, 2
        )                                           as var_anual_promedio_5anos,

        -- Promedio últimos 3 años
        round(
            avg(var_promedio_pct) filter (
                where anio >= (select anio - 2 from ultimo_anio)
            )::numeric, 2
        )                                           as var_anual_promedio_3anos,

        -- Último año (Q4 del último año completo)
        max(var_promedio_pct) filter (
            where anio = (select anio from ultimo_anio)
        )                                           as var_ultimo_anio

    from anual_q4

),

tendencia_calc as (

    select
        *,
        case
            when var_ultimo_anio > var_anual_promedio_5anos + 2     then 'ACELERANDO'
            when var_ultimo_anio < var_anual_promedio_5anos - 2     then 'DESACELERANDO'
            else                                                          'ESTABLE'
        end                                                          as tendencia_reciente,

        round((var_anual_promedio_3anos * 3)::numeric, 1)           as proyeccion_3anos_pct,
        round((var_anual_promedio_5anos * 5)::numeric, 1)           as proyeccion_5anos_pct

    from metricas

),

por_estrato as (

    select
        estrato_sistema,
        factor_ajuste,
        t.var_anual_promedio_5anos,
        t.var_anual_promedio_3anos,
        t.var_ultimo_anio,
        t.tendencia_reciente,
        round((t.var_anual_promedio_5anos * factor_ajuste)::numeric, 2)  as var_5anos_ajustado,
        round((t.var_anual_promedio_3anos * factor_ajuste)::numeric, 2)  as var_3anos_ajustado,
        round((t.var_anual_promedio_3anos * factor_ajuste * 3)::numeric, 1) as proyeccion_3anos_pct,
        round((t.var_anual_promedio_5anos * factor_ajuste * 5)::numeric, 1) as proyeccion_5anos_pct

    from tendencia_calc t
    cross join (
        values
            (1, 0.90),
            (2, 0.90),
            (3, 1.00),
            (4, 1.05),
            (5, 1.15),
            (6, 1.15)
    ) as estratos(estrato_sistema, factor_ajuste)

)

select
    estrato_sistema,
    factor_ajuste,
    var_anual_promedio_5anos                       as baseline_5anos_pct,
    var_anual_promedio_3anos                       as baseline_3anos_pct,
    var_ultimo_anio                                as baseline_ultimo_anio_pct,
    var_5anos_ajustado,
    var_3anos_ajustado,
    tendencia_reciente,
    proyeccion_3anos_pct,
    proyeccion_5anos_pct,
    now()                                          as calculado_en
from por_estrato
order by estrato_sistema
