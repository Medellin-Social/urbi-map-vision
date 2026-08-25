{{
    config(
        materialized='table',
        schema='analytics'
    )
}}

with listings_venta as (

    select
        barrio_id,
        fecha_publicacion,
        dias_en_mercado
    from {{ ref('stg_listings') }}
    where tipo_operacion = 'venta'

),

liquidez_base as (

    select
        barrio_id,
        count(*)                                                                           as n_listings_venta_total,
        percentile_cont(0.25) within group (order by dias_en_mercado)                     as dias_mercado_p25,
        percentile_cont(0.50) within group (order by dias_en_mercado)                     as dias_mercado_p50,
        count(*) filter (where dias_en_mercado < 30)  * 100.0 / count(*)                  as pct_frescos,
        count(*) filter (where dias_en_mercado > 90)  * 100.0 / count(*)                  as pct_antiguos,
        count(*) filter (where fecha_publicacion is not null) * 1.0 / count(*)            as pct_listings_con_fecha
    from listings_venta
    group by barrio_id

),

mercado as (

    select barrio_id, precio_venta_m2_p50
    from {{ ref('barrios_mercado') }}

),

airbnb as (

    select barrio_id, n_listings_airbnb
    from {{ ref('barrios_airbnb_real') }}

),

scored as (

    select
        l.barrio_id,
        m.precio_venta_m2_p50,
        l.n_listings_venta_total,
        round(l.dias_mercado_p25::numeric, 1)          as dias_mercado_p25,
        round(l.dias_mercado_p50::numeric, 1)          as dias_mercado_p50,
        round(l.pct_frescos::numeric, 1)               as pct_frescos,
        round(l.pct_antiguos::numeric, 1)              as pct_antiguos,
        l.pct_listings_con_fecha,
        coalesce(a.n_listings_airbnb, 0)               as n_listings_airbnb,

        -- a) Rotación real (40 pts)
        case
            when l.dias_mercado_p50 is null     then 15
            when l.dias_mercado_p50 <= 15       then 40
            when l.dias_mercado_p50 <= 30       then 32
            when l.dias_mercado_p50 <= 60       then 22
            when l.dias_mercado_p50 <= 90       then 12
            when l.dias_mercado_p50 <= 180      then 6
            else 2
        end as score_rotacion,

        -- b) Listings frescos (20 pts)
        case
            when l.pct_frescos is null          then 8
            when l.pct_frescos >= 50            then 20
            when l.pct_frescos >= 30            then 14
            when l.pct_frescos >= 15            then 8
            else 3
        end as score_frescos,

        -- c) Volumen mercado (25 pts)
        case
            when l.n_listings_venta_total >= 30 then 25
            when l.n_listings_venta_total >= 15 then 18
            when l.n_listings_venta_total >= 8  then 12
            when l.n_listings_venta_total >= 4  then 6
            else 3
        end as score_volumen,

        -- d) Interés zona (15 pts)
        case
            when coalesce(a.n_listings_airbnb, 0) >= 50 then 15
            when coalesce(a.n_listings_airbnb, 0) >= 20 then 10
            when coalesce(a.n_listings_airbnb, 0) >= 10 then 6
            else 3
        end as score_interes

    from liquidez_base l
    left join mercado m using (barrio_id)
    left join airbnb  a using (barrio_id)

)

select
    barrio_id,
    precio_venta_m2_p50,
    n_listings_venta_total,
    dias_mercado_p25,
    dias_mercado_p50,
    pct_frescos,
    pct_antiguos,
    pct_listings_con_fecha,
    n_listings_airbnb,
    score_rotacion + score_frescos + score_volumen + score_interes   as liquidez_score,

    case
        when (score_rotacion + score_frescos + score_volumen + score_interes) >= 70 then 'ALTA'
        when (score_rotacion + score_frescos + score_volumen + score_interes) >= 45 then 'MEDIA'
        when (score_rotacion + score_frescos + score_volumen + score_interes) >= 25 then 'BAJA'
        else 'MUY BAJA'
    end as categoria_liquidez,

    case
        when (score_rotacion + score_frescos + score_volumen + score_interes) >= 70 then '1-3 meses'
        when (score_rotacion + score_frescos + score_volumen + score_interes) >= 45 then '3-6 meses'
        when (score_rotacion + score_frescos + score_volumen + score_interes) >= 25 then '6-12 meses'
        else '+12 meses'
    end as tiempo_estimado_venta,

    case
        when pct_listings_con_fecha >= 0.5
            then 'Basado en tiempo real de publicación de listings activos en Fincaraíz y Metrocuadrado.'
        else 'Basado en volumen de mercado activo. Liquidez real disponible próximamente con datos de transacciones (SNR).'
    end as nota_metodologia,

    now() as calculado_en

from scored
where barrio_id is not null
