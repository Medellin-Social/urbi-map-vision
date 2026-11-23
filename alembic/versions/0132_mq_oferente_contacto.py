"""metrocuadrado: captura de contacto/agencia para atribución de listings

El scraper MC migró al payload SPA, donde cada listing trae ya el contacto del
oferente SIN enmascarar: contactPhone, whatsapp, midempresa (=company_id estable),
OwnerType (Inmobiliaria/Persona natural), moferente (bucket) y mnumero_contactos.
El nombre de la agencia (company_name) se resuelve con 1 fetch a la ficha por
company_id único. Se guarda para atribuir cada inmueble a su realtor/agencia.

realtor_key = llave de atribución: 'co:<company_id>' para agencias, 'ph:<tel>'
(normalizado, sin prefijo 57) para particulares que no tienen company_id.

GOTCHA que motiva esta migración: el upsert de listings existentes NO lo hace el
ON CONFLICT del INSERT sino el trigger BEFORE INSERT raw.fn_upsert_listing_by_url()
(hace su propio UPDATE y RETURN NULL). Esa función sólo tocaba un subset de
columnas → los campos nuevos nunca se actualizaban en re-scrapes. Aquí se añaden
las columnas Y se amplía la función para incluirlas.

Dato personal (Ley 1581): guardar OK, NO exponer el teléfono en el mapa público;
OwnerType deja separable la clase 'Persona natural'.

Revision ID: 0132
Revises: 0131
Create Date: 2026-11-23
"""
from alembic import op

revision = "0132"
down_revision = "0131"
branch_labels = None
depends_on = None

_ADD_COLUMNS = """
ALTER TABLE raw.listings_metrocuadrado ADD COLUMN IF NOT EXISTS contacto_phone    TEXT;
ALTER TABLE raw.listings_metrocuadrado ADD COLUMN IF NOT EXISTS contacto_whatsapp TEXT;
ALTER TABLE raw.listings_metrocuadrado ADD COLUMN IF NOT EXISTS company_id        TEXT;
ALTER TABLE raw.listings_metrocuadrado ADD COLUMN IF NOT EXISTS company_name      TEXT;
ALTER TABLE raw.listings_metrocuadrado ADD COLUMN IF NOT EXISTS oferente_bucket   TEXT;
ALTER TABLE raw.listings_metrocuadrado ADD COLUMN IF NOT EXISTS num_contactos     INTEGER;
ALTER TABLE raw.listings_metrocuadrado ADD COLUMN IF NOT EXISTS realtor_key       TEXT;
CREATE INDEX IF NOT EXISTS idx_mq_company ON raw.listings_metrocuadrado(company_id);
CREATE INDEX IF NOT EXISTS idx_mq_realtor ON raw.listings_metrocuadrado(realtor_key);
"""

# Misma función que 0022, con los campos de oferente/contacto añadidos al UPDATE.
_FUNCTION = """
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
            precio            = COALESCE(NEW.precio, precio),
            area_m2           = COALESCE(NEW.area_m2, area_m2),
            habitaciones      = COALESCE(NEW.habitaciones, habitaciones),
            banos             = COALESCE(NEW.banos, banos),
            lat               = COALESCE(NEW.lat, lat),
            lon               = COALESCE(NEW.lon, lon),
            fotos             = COALESCE(NEW.fotos, fotos),
            barrio_id         = COALESCE(NEW.barrio_id, barrio_id),
            barrio_raw        = COALESCE(NEW.barrio_raw, barrio_raw),
            fecha_scraping    = NEW.fecha_scraping,
            dedup_hash        = COALESCE(NEW.dedup_hash, dedup_hash),
            raw_data          = COALESCE(NEW.raw_data, raw_data),
            contacto_phone    = COALESCE(NEW.contacto_phone, contacto_phone),
            contacto_whatsapp = COALESCE(NEW.contacto_whatsapp, contacto_whatsapp),
            company_id        = COALESCE(NEW.company_id, company_id),
            company_name      = COALESCE(NEW.company_name, company_name),
            oferente_bucket   = COALESCE(NEW.oferente_bucket, oferente_bucket),
            num_contactos     = COALESCE(NEW.num_contactos, num_contactos),
            realtor_key       = COALESCE(NEW.realtor_key, realtor_key)
        WHERE id = existing_id;
        RETURN NULL;
    END IF;

    RETURN NEW;
END;
$$;
"""


def upgrade() -> None:
    op.execute(_ADD_COLUMNS)
    op.execute(_FUNCTION)


def downgrade() -> None:
    pass
