"""Poblacion por comuna (Medellin) y por municipio (Valle de Aburra).

Fuente: proyecciones DANE / estadisticas municipales oficiales, dato
estatico sin fecha de corte exacta (no hay serie temporal por ahora).
Mismo patron que raw.icfes_municipio: PK de texto en mayusculas.
PK de poblacion_comuna = nombre en mayusculas igual a raw.barrios.comuna
(no el codigo zero-padded de raw.comunas.codigo, que solo se usa para
el join con seguridad en dbt/barrios_seguridad.sql).

Revision ID: 0081
Revises: 0080
"""
from alembic import op

revision = "0081"
down_revision = "0080"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS raw.poblacion_comuna (
            comuna          TEXT PRIMARY KEY,
            codigo          TEXT,
            poblacion       INTEGER NOT NULL,
            fuente          TEXT,
            cargado_en      TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS raw.poblacion_municipio (
            municipio       TEXT PRIMARY KEY,
            poblacion       INTEGER NOT NULL,
            fuente          TEXT,
            cargado_en      TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)

    op.execute("""
        INSERT INTO raw.poblacion_comuna (comuna, codigo, poblacion, fuente) VALUES
            ('POPULAR', '01', 145235, 'DANE/Medellin municipal'),
            ('SANTA CRUZ', '02', 110202, 'DANE/Medellin municipal'),
            ('MANRIQUE', '03', 150000, 'DANE/Medellin municipal'),
            ('ARANJUEZ', '04', 165000, 'DANE/Medellin municipal'),
            ('CASTILLA', '05', 135000, 'DANE/Medellin municipal'),
            ('DOCE DE OCTUBRE', '06', 195000, 'DANE/Medellin municipal'),
            ('ROBLEDO', '07', 178000, 'DANE/Medellin municipal'),
            ('VILLA HERMOSA', '08', 135000, 'DANE/Medellin municipal'),
            ('BUENOS AIRES', '09', 138000, 'DANE/Medellin municipal'),
            ('LA CANDELARIA', '10', 95000, 'DANE/Medellin municipal'),
            ('LAURELES ESTADIO', '11', 125000, 'DANE/Medellin municipal'),
            ('LA AMERICA', '12', 87919, 'DANE/Medellin municipal'),
            ('SAN JAVIER', '13', 175000, 'DANE/Medellin municipal'),
            ('EL POBLADO', '14', 108730, 'DANE/Medellin municipal'),
            ('GUAYABAL', '15', 63589, 'DANE/Medellin municipal'),
            ('BELEN', '16', 217501, 'DANE/Medellin municipal')
        ON CONFLICT (comuna) DO UPDATE SET
            codigo = EXCLUDED.codigo,
            poblacion = EXCLUDED.poblacion,
            fuente = EXCLUDED.fuente,
            cargado_en = now()
    """)

    op.execute("""
        INSERT INTO raw.poblacion_municipio (municipio, poblacion, fuente) VALUES
            ('MEDELLIN', 2441123, 'DANE/municipal'),
            ('BELLO', 482255, 'DANE/municipal'),
            ('ITAGUI', 276936, 'DANE/municipal'),
            ('ENVIGADO', 238173, 'DANE/municipal'),
            ('CALDAS', 80528, 'DANE/municipal'),
            ('COPACABANA', 70171, 'DANE/municipal'),
            ('LA ESTRELLA', 62344, 'DANE/municipal'),
            ('GIRARDOTA', 54219, 'DANE/municipal'),
            ('SABANETA', 53914, 'DANE/municipal'),
            ('BARBOSA', 50052, 'DANE/municipal')
        ON CONFLICT (municipio) DO UPDATE SET
            poblacion = EXCLUDED.poblacion,
            fuente = EXCLUDED.fuente,
            cargado_en = now()
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS raw.poblacion_comuna")
    op.execute("DROP TABLE IF EXISTS raw.poblacion_municipio")
