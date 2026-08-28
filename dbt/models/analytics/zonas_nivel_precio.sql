{{
    config(
        materialized='table',
        schema='analytics'
    )
}}

-- Nivel A/B/C/D por zona (barrio y comuna), usado para escalonar el precio de
-- patrocinio en api/services/zona_sponsor_service.py. Umbrales de score FIJOS
-- (no percentil): la distribución entre niveles queda desigual a propósito,
-- reflejando que la mayoría de zonas del Valle de Aburrá no son premium.
--
-- Sin seguridad: el cliente que paga el patrocinio es el REALTOR, no el
-- comprador — seguridad le importa a quien compra/renta, no a quien decide
-- si le conviene pagar por visibilidad en una zona. El valor de la zona para
-- un realtor es directamente el tamaño de las comisiones (precio) y qué tan
-- activo/grande es el mercado ahí (volumen, población).
--
-- Score = 55% precio_m2 + 20% volumen de datos (n_venta+n_arriendo) + 15%
-- eventos de comunidad (vida/actividad de la zona — más eventos = zona más
-- deseable, atrae más interés de compra, mismo tipo de señal que ya usa
-- Zillow con "walkability") + 10% población (tamaño de mercado/audiencia —
-- raw.poblacion_comuna para Medellín, raw.poblacion_municipio para los 5
-- municipios satélite, ver migración 0081). Todo se normaliza min-max, pero
-- el min/max se calcula SOLO sobre zonas con n_datos >= 10 (piso mínimo) para
-- que un barrio con 1-2 listings no distorsione la escala. Zonas por debajo
-- del piso igual reciben nivel, solo no participan en fijar los extremos.

with poblacion as (

    select
        b.id as barrio_id,
        coalesce(pc.poblacion, pm.poblacion) as poblacion
    from raw.barrios b
    left join raw.poblacion_comuna    pc on pc.comuna    = upper(b.comuna)
    left join raw.poblacion_municipio pm on pm.municipio = upper(b.municipio)

),

eventos as (

    select barrio_id, count(*) as n_eventos
    from public.eventos
    where activo and barrio_id is not null
    group by barrio_id

),

base as (

    select
        bm.barrio_id,
        coalesce(bm.precio_venta_m2_p50, bm.pbn_precio_justo_m2)   as precio_m2_efectivo,
        coalesce(bm.n_venta, 0) + coalesce(bm.n_arriendo, 0)       as n_datos,
        p.poblacion,
        coalesce(ev.n_eventos, 0)                                   as n_eventos
    from {{ ref('barrios_mercado') }} bm
    left join poblacion p on p.barrio_id = bm.barrio_id
    left join eventos   ev on ev.barrio_id = bm.barrio_id
    where coalesce(bm.precio_venta_m2_p50, bm.pbn_precio_justo_m2) is not null

),

anchors as (

    select
        min(precio_m2_efectivo) filter (where n_datos >= 10) as precio_min,
        max(precio_m2_efectivo) filter (where n_datos >= 10) as precio_max,
        min(n_datos)            filter (where n_datos >= 10) as vol_min,
        max(n_datos)            filter (where n_datos >= 10) as vol_max,
        min(poblacion)          filter (where n_datos >= 10) as pob_min,
        max(poblacion)          filter (where n_datos >= 10) as pob_max,
        min(n_eventos)          filter (where n_datos >= 10) as ev_min,
        max(n_eventos)          filter (where n_datos >= 10) as ev_max
    from base

),

barrio_scored as (

    select
        b.barrio_id,
        greatest(0, least(100,
            (b.precio_m2_efectivo - a.precio_min)::numeric / nullif(a.precio_max - a.precio_min, 0) * 100
        ))                                                          as precio_score,
        greatest(0, least(100,
            (b.n_datos - a.vol_min)::numeric / nullif(a.vol_max - a.vol_min, 0) * 100
        ))                                                          as volumen_score,
        greatest(0, least(100,
            (b.poblacion - a.pob_min)::numeric / nullif(a.pob_max - a.pob_min, 0) * 100
        ))                                                          as poblacion_score,
        greatest(0, least(100,
            (b.n_eventos - a.ev_min)::numeric / nullif(a.ev_max - a.ev_min, 0) * 100
        ))                                                          as eventos_score
    from base b
    cross join anchors a

),

barrio_nivel as (

    select
        barrio_id,
        round(
            0.55 * precio_score
            + 0.20 * volumen_score
            + 0.15 * coalesce(eventos_score, 0)
            + 0.10 * coalesce(poblacion_score, volumen_score)
        ) as score_nivel
    from barrio_scored

),

-- Nivel de COMUNA se calcula con el agregado propio de la comuna (precio_m2
-- ponderado por volumen, n_datos total, población), normalizado contra las
-- otras 15 comunas — no como promedio de los score_nivel de sus barrios.
-- Promediar scores de barrio ya normalizados (0-100 contra el rango de TODO
-- el Valle de Aburrá) diluye comunas caras pero heterogéneas: El Poblado
-- mezcla barrios en 7-10M/m2 con score_nivel de barrio dispares, y el
-- promedio ponderado nunca pasaba de B aunque el precio_m2 real de la
-- comuna sea, por lejos, el más alto de Medellín. Normalizando la comuna
-- contra el rango de comunas (no de barrios) sí refleja eso.
comuna_base as (

    select
        bc.cd_comuna,
        sum(b.precio_m2_efectivo * b.n_datos)::numeric / nullif(sum(b.n_datos), 0) as precio_m2_comuna,
        sum(b.n_datos)                                                              as n_datos_comuna,
        max(b.poblacion)                                                            as poblacion_comuna,
        sum(b.n_eventos)                                                            as n_eventos_comuna
    from base b
    join analytics.barrios_cd bc on bc.barrio_id = b.barrio_id
    where bc.cd_comuna is not null
    group by bc.cd_comuna

),

comuna_anchors as (

    select
        min(precio_m2_comuna)  as precio_min,
        max(precio_m2_comuna)  as precio_max,
        min(n_datos_comuna)    as vol_min,
        max(n_datos_comuna)    as vol_max,
        min(poblacion_comuna)  as pob_min,
        max(poblacion_comuna)  as pob_max,
        min(n_eventos_comuna)  as ev_min,
        max(n_eventos_comuna)  as ev_max
    from comuna_base

),

comuna_nivel as (

    select
        cb.cd_comuna,
        round(
            0.55 * greatest(0, least(100,
                (cb.precio_m2_comuna - ca.precio_min) / nullif(ca.precio_max - ca.precio_min, 0) * 100
            ))
            + 0.20 * greatest(0, least(100,
                (cb.n_datos_comuna - ca.vol_min)::numeric / nullif(ca.vol_max - ca.vol_min, 0) * 100
            ))
            + 0.15 * greatest(0, least(100,
                (cb.n_eventos_comuna - ca.ev_min)::numeric / nullif(ca.ev_max - ca.ev_min, 0) * 100
            ))
            + 0.10 * coalesce(greatest(0, least(100,
                (cb.poblacion_comuna - ca.pob_min)::numeric / nullif(ca.pob_max - ca.pob_min, 0) * 100
            )), 50)
        ) as score_nivel
    from comuna_base cb
    cross join comuna_anchors ca

)

select
    'barrio'::text  as zona_nivel,
    barrio_id::text as zona_codigo,
    score_nivel,
    case
        when score_nivel >= 75 then 'A'
        when score_nivel >= 55 then 'B'
        when score_nivel >= 35 then 'C'
        else 'D'
    end as nivel
from barrio_nivel

union all

select
    'comuna'::text  as zona_nivel,
    cd_comuna::text as zona_codigo,
    score_nivel,
    case
        when score_nivel >= 75 then 'A'
        when score_nivel >= 55 then 'B'
        when score_nivel >= 35 then 'C'
        else 'D'
    end as nivel
from comuna_nivel
