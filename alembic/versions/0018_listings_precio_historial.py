"""feat: tabla raw.listings_precio_historial + triggers para rastrear cambios de precio

Revision ID: 0018
Revises: 0017
Create Date: 2026-06-08
"""
from alembic import op

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS raw.listings_precio_historial (
            id              serial PRIMARY KEY,
            listing_url     text   NOT NULL,
            fuente          text   NOT NULL,
            precio_anterior numeric NOT NULL,
            precio_nuevo    numeric NOT NULL,
            fecha_cambio    date   NOT NULL DEFAULT CURRENT_DATE,
            created_at      timestamp NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_lph_url
            ON raw.listings_precio_historial (listing_url);
        CREATE INDEX IF NOT EXISTS idx_lph_fecha
            ON raw.listings_precio_historial (fecha_cambio DESC);
    """)

    # Trigger function shared by both raw listing tables
    op.execute("""
        CREATE OR REPLACE FUNCTION raw.fn_track_precio_cambio()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF OLD.precio IS DISTINCT FROM NEW.precio
               AND OLD.precio IS NOT NULL
               AND NEW.precio IS NOT NULL
               AND NEW.precio > 0
            THEN
                INSERT INTO raw.listings_precio_historial
                    (listing_url, fuente, precio_anterior, precio_nuevo, fecha_cambio)
                VALUES
                    (NEW.url, NEW.fuente, OLD.precio, NEW.precio, CURRENT_DATE)
                ON CONFLICT DO NOTHING;
            END IF;
            RETURN NEW;
        END;
        $$;
    """)

    op.execute("""
        DROP TRIGGER IF EXISTS trg_precio_cambio_fincaraiz
            ON raw.listings_fincaraiz;
        CREATE TRIGGER trg_precio_cambio_fincaraiz
            BEFORE UPDATE OF precio ON raw.listings_fincaraiz
            FOR EACH ROW EXECUTE FUNCTION raw.fn_track_precio_cambio();
    """)

    op.execute("""
        DROP TRIGGER IF EXISTS trg_precio_cambio_metrocuadrado
            ON raw.listings_metrocuadrado;
        CREATE TRIGGER trg_precio_cambio_metrocuadrado
            BEFORE UPDATE OF precio ON raw.listings_metrocuadrado
            FOR EACH ROW EXECUTE FUNCTION raw.fn_track_precio_cambio();
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_precio_cambio_fincaraiz ON raw.listings_fincaraiz;")
    op.execute("DROP TRIGGER IF EXISTS trg_precio_cambio_metrocuadrado ON raw.listings_metrocuadrado;")
    op.execute("DROP FUNCTION IF EXISTS raw.fn_track_precio_cambio();")
    op.execute("DROP TABLE IF EXISTS raw.listings_precio_historial;")
