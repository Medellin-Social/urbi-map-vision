{{
    config(
        materialized='view',
        schema='staging'
    )
}}

-- Parses the amenities text field from raw.airbnb_listings_portal.
-- Handles both comma-separated strings and JSON arrays by lowercasing and
-- searching for keyword substrings (robust to both formats).

with source as (

    select
        listing_id,
        barrio_id,
        lower(coalesce(amenities, ''))  as amenities_lower
    from {{ source('airbnb', 'airbnb_listings_portal') }}
    where barrio_id is not null

)

select
    listing_id,
    barrio_id,

    (amenities_lower like '%wifi%'
     or amenities_lower like '%internet%')                                      as flag_wifi,

    (amenities_lower like '%air_conditioning%'
     or amenities_lower like '%air conditioning%'
     or amenities_lower like '%"ac"%'
     or amenities_lower like '% ac,%'
     or amenities_lower like '%,ac,%'
     or amenities_lower like '%,ac"'
     or amenities_lower like '%[ac]%')                                          as flag_ac,

    (amenities_lower like '%kitchen%')                                          as flag_kitchen,

    (amenities_lower like '%washer%'
     or amenities_lower like '%washing_machine%'
     or amenities_lower like '%washing machine%')                               as flag_washer,

    (amenities_lower like '%heating%')                                          as flag_heating,

    (amenities_lower like '%hot_water%'
     or amenities_lower like '%hot water%')                                     as flag_hot_water

from source
