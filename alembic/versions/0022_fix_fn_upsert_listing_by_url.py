"""fix fn_upsert_listing_by_url: remove precio_m2 ref (column doesn't exist), add fotos

Revision ID: 0022
Revises: 0021
Create Date: 2026-06-09
"""
from alembic import op

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None

_FIX_FUNCTION = """
CREATE OR REPLACE FUNCTION raw.fn_upsert_listing_by_url()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    existing_id INT;
BEGIN
    IF NEW.url IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT id INTO existing_id
    FROM raw.listings_metrocuadrado
    WHERE url = NEW.url AND activo = TRUE
    LIMIT 1;

    IF existing_id IS NOT NULL THEN
        UPDATE raw.listings_metrocuadrado
        SET
            precio         = COALESCE(NEW.precio, precio),
            area_m2        = COALESCE(NEW.area_m2, area_m2),
            habitaciones   = COALESCE(NEW.habitaciones, habitaciones),
            banos          = COALESCE(NEW.banos, banos),
            lat            = COALESCE(NEW.lat, lat),
            lon            = COALESCE(NEW.lon, lon),
            fotos          = COALESCE(NEW.fotos, fotos),
            barrio_id      = COALESCE(NEW.barrio_id, barrio_id),
            barrio_raw     = COALESCE(NEW.barrio_raw, barrio_raw),
            fecha_scraping = NEW.fecha_scraping,
            dedup_hash     = COALESCE(NEW.dedup_hash, dedup_hash),
            raw_data       = COALESCE(NEW.raw_data, raw_data)
        WHERE id = existing_id;
        RETURN NULL;
    END IF;

    RETURN NEW;
END;
$$;
"""


def upgrade() -> None:
    op.execute(_FIX_FUNCTION)


def downgrade() -> None:
    pass
