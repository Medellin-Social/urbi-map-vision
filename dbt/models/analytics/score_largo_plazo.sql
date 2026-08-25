{{
    config(
        materialized='table',
        schema='analytics'
    )
}}

/*
  Score Arriendo Tradicional 0-100 por barrio. Perfil inversor largo plazo.

  Componentes y pesos (suman 100):
    PBN estado precio        → 30 pts  (era 35)
    Yield bruto largo        → 25 pts  (era 30)
    Seguridad residente      → 25 pts  (igual)
    Conectividad metro       → 10 pts  (igual)
    Valorización histórica   → 10 pts  (NUEVO — IPVN DANE + ajuste estrato)
*/

with mercado as (

    select * from {{ ref('barrios_mercado') }}

),

valorizacion as (

    select
        estrato_sistema,
        tendencia_reciente,
        var_5anos_ajustado
    from {{ ref('proyecciones_valorizacion') }}

),

base as (

    select
        bm.barrio_id,
        bm.barrio_nombre                                                        as nombre_barrio,
        bm.comuna,
        bm.municipio,

        bm.estado_precio,
        bm.yield_bruto                                                         as yield_bruto_pct,
        bm.score_seguridad                                                     as score_seguridad_residente,
        p.dist_metro_km,

        -- Estrato dominante por área intersectada — manzana level (raw.estratos_manzana)
        e.estrato                                                              as estrato_barrio

    from mercado bm
    left join analytics.barrios_pois_distancia p  on bm.barrio_id = p.barrio_id
    left join raw.barrios rb                       on rb.id = bm.barrio_id
    left join lateral (
        select em.estrato
        from raw.estratos_manzana em
        where em.geometry is not null
          and ST_Intersects(rb.geometry, em.geometry)
        order by ST_Area(ST_Intersection(rb.geometry, em.geometry)) desc
        limit 1
    ) e on true

),

base_con_valorizacion as (

    select
        b.*,
        v.tendencia_reciente,
        v.var_5anos_ajustado

    from base b
    left join valorizacion v
        -- Join por estrato: NULL estrato barrio → usa estrato 3 (factor 1.0, baseline)
        on v.estrato_sistema = coalesce(b.estrato_barrio, 3)

),

scored as (

    select
        *,

        -- Componente 1: Estado precio PBN (30 pts — reducido de 35)
        case
            when estado_precio = 'BAJO'             then 30
            when estado_precio = 'NORMAL'           then 17
            when estado_precio = 'SOBRE'            then 4
            else                                         0
        end                                                                    as pbn_largo_score,

        -- Componente 2: Yield largo plazo (25 pts — reducido de 30)
        case
            when yield_bruto_pct >= 10              then 25
            when yield_bruto_pct >= 8               then 20
            when yield_bruto_pct >= 6               then 15
            when yield_bruto_pct >= 4               then 8
            when yield_bruto_pct is not null        then 3
            else                                         0
        end                                                                    as yield_largo_score,

        -- Componente 3: Seguridad residente (25 pts — igual)
        round(coalesce(score_seguridad_residente, 50) / 100.0 * 25)::integer  as seg_largo_score,

        -- Componente 4: Conectividad residencial — metro (10 pts — igual)
        case
            when dist_metro_km <= 0.5               then 10
            when dist_metro_km <= 1.0               then 8
            when dist_metro_km <= 2.0               then 6
            when dist_metro_km <= 3.0               then 4
            else                                         2
        end                                                                    as metro_largo_score,

        -- Componente 5: Valorización histórica IPVN (10 pts — NUEVO)
        -- Basado en tendencia_reciente de proyecciones_valorizacion
        -- NULL tendencia (sin datos) → 5 pts neutros
        case
            when tendencia_reciente = 'ACELERANDO'    then 10
            when tendencia_reciente = 'ESTABLE'       then 6
            when tendencia_reciente = 'DESACELERANDO' then 2
            else                                           5
        end                                                                    as valorizacion_score

    from base_con_valorizacion

),

final as (

    select
        *,
        pbn_largo_score + yield_largo_score + seg_largo_score
            + metro_largo_score + valorizacion_score                           as score_largo
    from scored

)

select
    barrio_id,
    nombre_barrio,
    comuna,
    municipio,

    score_largo,

    case
        when score_largo >= 80  then 'EXCELENTE'
        when score_largo >= 60  then 'BUENO'
        when score_largo >= 40  then 'MODERADO'
        when score_largo >= 20  then 'BAJO'
        else                         'MUY BAJO'
    end                                                                        as categoria_largo,

    case
        when score_largo >= 80  then '#10b981'
        when score_largo >= 60  then '#00d4ff'
        when score_largo >= 40  then '#f59e0b'
        when score_largo >= 20  then '#ef4444'
        else                         '#6b7280'
    end                                                                        as color_largo,

    pbn_largo_score,
    yield_largo_score,
    seg_largo_score,
    metro_largo_score,
    valorizacion_score,

    estado_precio,
    yield_bruto_pct,
    score_seguridad_residente,
    dist_metro_km,
    tendencia_reciente                                                         as tendencia_valorizacion,
    var_5anos_ajustado                                                         as var_anual_5anos_pct,
    estrato_barrio,

    now()                                                                      as calculado_en

from final
order by score_largo desc
