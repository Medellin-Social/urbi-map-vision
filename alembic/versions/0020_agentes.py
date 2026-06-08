"""Portal de Agentes — tabla agentes

Revision ID: 0020
Revises: 0019
Create Date: 2026-06-08
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS agentes (
            id                    SERIAL PRIMARY KEY,
            usuario_id            INT REFERENCES public.usuarios(id),

            -- Sección 1: Identidad
            nombre_completo       TEXT NOT NULL,
            cedula_numero         TEXT UNIQUE NOT NULL,
            cedula_foto_frente    TEXT,
            cedula_foto_reverso   TEXT,
            foto_perfil           TEXT,
            fecha_nacimiento      DATE,

            -- Sección 2: Legal y fiscal
            rut_documento         TEXT,
            tarjeta_profesional   TEXT,
            inmobiliaria_nombre   TEXT,
            inmobiliaria_nit      TEXT,
            es_independiente      BOOLEAN DEFAULT TRUE,

            -- Sección 3: Experiencia
            anos_experiencia      INT,
            transacciones_cerradas INT,
            especialidad          TEXT[],
            tipo_inmueble         TEXT[],
            precio_rango_min      NUMERIC,
            precio_rango_max      NUMERIC,
            zonas_opera           INT[],

            -- Sección 4: Contacto
            telefono              TEXT NOT NULL,
            telefono_verificado   BOOLEAN DEFAULT FALSE,
            email                 TEXT NOT NULL,
            email_verificado      BOOLEAN DEFAULT FALSE,
            whatsapp              TEXT,
            linkedin              TEXT,
            instagram             TEXT,
            sitio_web             TEXT,

            -- Sección 5: Referencias
            referencia_1_nombre   TEXT,
            referencia_1_telefono TEXT,
            referencia_1_tipo     TEXT,
            referencia_2_nombre   TEXT,
            referencia_2_telefono TEXT,
            referencia_2_tipo     TEXT,
            referencia_3_nombre   TEXT,
            referencia_3_telefono TEXT,
            referencia_3_tipo     TEXT,

            -- Sección 6: Términos
            acepta_terminos       BOOLEAN DEFAULT FALSE,
            acepta_politica       BOOLEAN DEFAULT FALSE,
            acepta_suspension     BOOLEAN DEFAULT FALSE,
            firma_timestamp       TIMESTAMPTZ,

            -- Control
            estado                TEXT DEFAULT 'pendiente',
            motivo_rechazo        TEXT,
            fecha_registro        TIMESTAMPTZ DEFAULT NOW(),
            fecha_aprobacion      TIMESTAMPTZ,
            aprobado_por          TEXT
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_agentes_estado ON agentes(estado)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_agentes_usuario_id ON agentes(usuario_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS agentes")
