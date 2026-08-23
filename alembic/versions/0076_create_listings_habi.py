"""create raw.listings_habi

New scraped source: habi.co (venta-apartamentos). Same shape as
raw.listings_fincaraiz (0068) for the fields we already had, plus columns
for fields unique to habi's data (found in their Gatsby page-data.json):
precio_anterior/discount_rate (iBuyer flip pricing), url_360 (Matterport),
contacto directo (correo/telefono/contacto_zona), has_three_checks
(habi trust badge), inventory_type_id/property_moment_id (raw discriminator
— own inventory vs aggregated "externo" listing; exact split TBD from real
data distribution once scraped, not guessed upfront).

Nested/variable-shape data (servicios, sitios_interes, icon_details,
caracteristicas) goes in raw_data jsonb, same as fincaraiz's catch-all.

Revision ID: 0076
Revises: 0075
"""
from alembic import op

revision = "0076"
down_revision = "0075"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS raw.listings_habi (
            id                      serial PRIMARY KEY,
            fuente                  text DEFAULT 'habi',
            tipo_operacion          text DEFAULT 'venta',
            tipo_inmueble           text,
            precio                  numeric,
            precio_anterior         numeric,
            discount_rate           numeric,
            area_m2                 numeric,
            habitaciones            integer,
            banos                   integer,
            parqueaderos            smallint,
            piso                    smallint,
            num_ascensores          smallint,
            direccion_raw           text,
            barrio_raw              text,
            url                     text UNIQUE,
            property_nid            bigint UNIQUE,
            property_uuid           text,
            fecha_scraping          timestamptz DEFAULT now(),
            activo                  boolean DEFAULT true,
            barrio_id               integer,
            raw_data                jsonb,
            fecha_publicacion       timestamp,
            dedup_hash              varchar,
            geom                    geometry(Point, 4326),
            lat                     numeric(10,6),
            lon                     numeric(10,6),
            municipio_raw           text,
            estrato_real            integer,
            descripcion             text,
            amenidades              text[],
            fotos                   text[],
            antiguedad              integer,
            administracion          numeric,
            url_360                 text,
            correo_contacto         text,
            telefono_contacto       text,
            contacto_zona           text,
            has_three_checks        boolean,
            inventory_type_id       integer,
            property_moment_id      integer,
            es_inventario_propio    boolean,
            is_private              boolean,
            remodelado              boolean,
            publicado_status        integer
        );
        CREATE INDEX IF NOT EXISTS idx_lh_barrio_id ON raw.listings_habi(barrio_id);
        CREATE INDEX IF NOT EXISTS idx_lh_dedup_hash ON raw.listings_habi(dedup_hash);
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS raw.listings_habi;")
