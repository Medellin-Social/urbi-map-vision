{{
    config(
        materialized='table',
        schema='analytics'
    )
}}

/*
  Enriquecimiento de listings con datos catastrales de Medellín.

  El catastro (raw.catastro_medellin, filtrado cd_vig_pred='S') solo tiene
  granularidad de COMUNA, no de barrio. Se agrega avalúo por m² a nivel comuna
  y se une con listings a través de raw.barrios.comuna → catastro.ds_comuna.

  Usa solo predios actualmente vigentes (cd_vig_pred='S'), excluyendo
  históricos/demolidos/subdivididos. raw.catastro_medellin_vigente se fusionó
  2026-08-23 dentro de raw.catastro_medellin (columna cd_vig_pred) — antes
  era su propia tabla íntegramente 'S', ahora hay que filtrar explícito.

  ratio_mercado_catastro = precio_m2_listing / avaluo_m2_catastro_comuna
    > 3.0  → SOBRE_CATASTRO (zona premium / especulación)
    1.5-3.0 → RANGO_NORMAL
    < 1.5  → CERCANO_CATASTRO (oportunidad)

  Solo aplica a Medellín. Listings de otros municipios: ratio = NULL.
*/

with catastro_por_comuna as (
    /*
      Avalúo catastral estimado por comuna, SEPARADO por tipo de inmueble, porque
      mezclar casas (que cargan su lote) con apartamentos infla el $/m² de los aptos
      (El Poblado: 2.24M mezclado → 895k apto puro). Discriminador = SEÑAL DE TIERRA
      (vl_av_lote), más robusto que contar pisos:

        · APTO  (PH, vl_av_lote = 0)  → avalúo = construcción/m² × área.
                 El terreno es común (no individual), así que vl_av_constru es el valor real.
        · CASA  (predio suelto, vl_av_lote > 0) → construcción/m² × área + TIERRA (monto fijo).
                 La tierra va como mediana absoluta del lote, NO dividida entre m² construidos:
                 los lotes de mansión inflarían el $/m² y el avalúo superaría el precio.

      El $/m² efectivo por listing lo arma api/routers/listings.py con el área real
      (la tierra fija se reparte: casa_m2_efectivo = casa_constru_m2 + lote_fijo/área).
    */
    select
        ds_comuna,
        cd_comuna,
        count(*)                                            as n_predios_catastro,
        -- Apartamentos (PH, sin lote individual)
        count(*) filter (where coalesce(vl_av_lote, 0) = 0) as n_apto,
        percentile_cont(0.5) within group (order by vl_av_constru / nm_ar_constru)
            filter (where coalesce(vl_av_lote, 0) = 0)      as avaluo_m2_apto,
        -- Casas (predio suelto con lote): construcción/m² + valor de lote (monto fijo)
        count(*) filter (where coalesce(vl_av_lote, 0) > 0) as n_casa,
        percentile_cont(0.5) within group (order by vl_av_constru / nm_ar_constru)
            filter (where coalesce(vl_av_lote, 0) > 0)      as avaluo_m2_casa_constru,
        percentile_cont(0.5) within group (order by vl_av_lote)
            filter (where coalesce(vl_av_lote, 0) > 0)      as avaluo_lote_casa
    from raw.catastro_medellin
    where cd_vig_pred = 'S'
      and cd_ind_ru_ur = 'U'
      and vl_avaluo_total > 0
      -- SOLO viviendas reales: área 30–400 m², sin parqueaderos (70k filas) ni
      -- matrices de edificio entero / lotes, que hundían el avalúo/m² ~40x. Ver
      -- To-do §1 y scripts/load_catastro_medellin_vigente.py (mismo filtro, sync).
      and nm_ar_constru between 30 and 400
      and ds_uso_tipo ilike '%residencial%'
      and ds_uso_tipo not ilike '%parqueadero%'
      and ds_uso_tipo not ilike '%lote%'
    group by ds_comuna, cd_comuna
),

listings_base as (
    select
        lu.listing_uid,
        lu.fuente,
        lu.tier,
        lu.tipo_operacion,
        lu.tipo_inmueble,
        lu.precio_cop,
        lu.precio_m2,
        lu.area_m2,
        lu.habitaciones,
        lu.banos,
        lu.barrio_raw,
        lu.barrio_id,
        lu.lat,
        lu.lon,
        lu.geom,
        lu.url,
        lu.n_duplicados,
        lu.precio_variable,
        lu.fecha_scraping
    from {{ ref('stg_listings_unificado') }} lu
    where lu.tipo_inmueble in ('apartamento', 'casa')
),

-- Unir barrios con su nombre de comuna para el join catastral
listings_con_barrio as (
    select
        lb.*,
        b.comuna                                            as barrio_comuna,
        b.municipio                                         as barrio_municipio
    from listings_base lb
    left join raw.barrios b on b.id = lb.barrio_id
),

enriched as (
    select
        lcb.listing_uid,
        lcb.fuente,
        lcb.tier,
        lcb.tipo_operacion,
        lcb.tipo_inmueble,
        lcb.precio_cop,
        lcb.precio_m2,
        lcb.area_m2,
        lcb.habitaciones,
        lcb.banos,
        lcb.barrio_raw,
        lcb.barrio_id,
        lcb.barrio_comuna,
        lcb.lat,
        lcb.lon,
        lcb.geom,
        lcb.url,
        lcb.n_duplicados,
        lcb.precio_variable,
        lcb.fecha_scraping,

        -- Componentes catastrales por comuna (los lee api/routers/listings.py para
        -- armar el $/m² efectivo con el área real del listing).
        cat.cd_comuna,
        cat.n_predios_catastro,
        cat.n_apto,
        cat.avaluo_m2_apto,
        cat.n_casa,
        cat.avaluo_m2_casa_constru,
        cat.avaluo_lote_casa,

        -- $/m² efectivo según tipo (guard: mínimo 20 predios del tipo en la comuna).
        -- Apto: construcción pura. Casa: construcción + tierra fija repartida sobre el área.
        case
            when lcb.tipo_inmueble = 'casa'
             and cat.n_casa >= 20 and lcb.area_m2 > 0
            then round((cat.avaluo_m2_casa_constru + cat.avaluo_lote_casa / lcb.area_m2)::numeric)
            when lcb.tipo_inmueble = 'apartamento'
             and cat.n_apto >= 20
            then round(cat.avaluo_m2_apto::numeric)
            else null
        end                                                 as avaluo_m2_catastro

    from listings_con_barrio lcb
    left join catastro_por_comuna cat
           on upper(cat.ds_comuna) = upper(lcb.barrio_comuna)
          and lcb.barrio_municipio ilike '%medellin%'
),

final as (
    select
        e.*,
        case when e.avaluo_m2_catastro is not null then 'comuna' else null end as catastro_nivel,

        -- Ratio mercado / catastro (solo venta). Con el avalúo corregido (más bajo),
        -- la mediana real sube a ~8–10x (el catastro de Medellín está muy desactualizado).
        case
            when e.tipo_operacion = 'venta'
             and e.avaluo_m2_catastro > 0
             and e.precio_m2 is not null
            then round((e.precio_m2 / e.avaluo_m2_catastro)::numeric, 2)
            else null
        end                                                 as ratio_mercado_catastro,

        -- Bandas recalibradas a la distribución real post-corrección (p50 ≈ 8–9x).
        case
            when e.tipo_operacion != 'venta'
              or e.precio_m2 is null
              or e.avaluo_m2_catastro is null then null
            when e.precio_m2 / e.avaluo_m2_catastro > 14.0 then 'SOBRE_CATASTRO'
            when e.precio_m2 / e.avaluo_m2_catastro < 5.0  then 'CERCANO_CATASTRO'
            else 'RANGO_NORMAL'
        end                                                 as categoria_precio_catastro
    from enriched e
)

select * from final
