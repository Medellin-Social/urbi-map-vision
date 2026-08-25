{{
    config(
        materialized='table',
        schema='analytics'
    )
}}

-- Top 10 barrios por yield_renta_media_pct con comparativa de los 3 yields.
-- Diseñado para el inversor extranjero que quiere comparar estrategias de renta.

select
    row_number() over (order by bm.yield_renta_media_pct desc nulls last) as ranking,

    bm.barrio_nombre                                                        as barrio,
    bm.municipio,

    bm.yield_renta_media_pct                                               as yield_media_pct,
    bm.yield_airbnb_pct,
    bm.yield_bruto                                                         as yield_largo_pct,

    bm.premium_vs_largo_pct,

    rm.n_listings_renta_media                                              as n_listings,

    bm.precio_renta_media_usd,
    bm.categoria_seguridad,
    bm.zona_turistica

from {{ ref('barrios_mercado') }} bm
left join {{ ref('barrios_renta_media') }} rm on bm.barrio_id = rm.barrio_id
where bm.yield_renta_media_pct is not null
order by bm.yield_renta_media_pct desc nulls last
limit 10
