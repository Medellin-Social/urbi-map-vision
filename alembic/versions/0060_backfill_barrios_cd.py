"""Backfill analytics.barrios_cd from hardcoded commune name→cd mapping

Revision ID: 0060
Revises: 0059
Create Date: 2026-07-28

On fresh DB (no catastro_medellin), migration 0004 skips the barrios_cd INSERT.
This migration backfills it from raw.barrios.comuna using known Medellin
commune codes from the static GeoJSON files.
Only runs when barrios_cd is empty to avoid clobbering catastro-derived data.
"""
from alembic import op

revision = "0060"
down_revision = "0059"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM analytics.barrios_cd LIMIT 1) THEN
                INSERT INTO analytics.barrios_cd (barrio_id, cd_comuna)
                SELECT
                    b.id,
                    CASE UPPER(TRIM(b.comuna))
                        WHEN 'POPULAR'          THEN 1
                        WHEN 'SANTA CRUZ'       THEN 2
                        WHEN 'MANRIQUE'         THEN 3
                        WHEN 'ARANJUEZ'         THEN 4
                        WHEN 'CASTILLA'         THEN 5
                        WHEN 'DOCE DE OCTUBRE'  THEN 6
                        WHEN 'ROBLEDO'          THEN 7
                        WHEN 'VILLA HERMOSA'    THEN 8
                        WHEN 'BUENOS AIRES'     THEN 9
                        WHEN 'LA CANDELARIA'    THEN 10
                        WHEN 'LAURELES'         THEN 11
                        WHEN 'LAURELES ESTADIO' THEN 11
                        WHEN 'LA AMERICA'       THEN 12
                        WHEN 'SAN JAVIER'       THEN 13
                        WHEN 'EL POBLADO'       THEN 14
                        WHEN 'GUAYABAL'         THEN 15
                        WHEN 'BELEN'            THEN 16
                    END
                FROM raw.barrios b
                WHERE b.municipio = 'MEDELLIN'
                  AND b.comuna IS NOT NULL
                ON CONFLICT (barrio_id) DO NOTHING;
            END IF;
        END $$;
    """)


def downgrade() -> None:
    pass
