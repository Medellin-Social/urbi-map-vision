"""Backfill missing agentes columns into prod table

Revision ID: 0035
Revises: 0034
Create Date: 2026-06-18

public.agentes was created by migration 0005 with the old portal schema.
Migration 0020 tried CREATE TABLE IF NOT EXISTS, which was a no-op in prod
because the table already existed. All columns added in 0020 are missing.
"""
from alembic import op

revision = "0035"
down_revision = "0034"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE public.agentes
            ADD COLUMN IF NOT EXISTS nombre_completo       TEXT,
            ADD COLUMN IF NOT EXISTS cedula_numero         TEXT,
            ADD COLUMN IF NOT EXISTS cedula_foto_frente    TEXT,
            ADD COLUMN IF NOT EXISTS cedula_foto_reverso   TEXT,
            ADD COLUMN IF NOT EXISTS foto_perfil           TEXT,
            ADD COLUMN IF NOT EXISTS fecha_nacimiento      DATE,
            ADD COLUMN IF NOT EXISTS rut_documento         TEXT,
            ADD COLUMN IF NOT EXISTS tarjeta_profesional   TEXT,
            ADD COLUMN IF NOT EXISTS inmobiliaria_nombre   TEXT,
            ADD COLUMN IF NOT EXISTS inmobiliaria_nit      TEXT,
            ADD COLUMN IF NOT EXISTS es_independiente      BOOLEAN DEFAULT TRUE,
            ADD COLUMN IF NOT EXISTS anos_experiencia      INT,
            ADD COLUMN IF NOT EXISTS transacciones_cerradas INT,
            ADD COLUMN IF NOT EXISTS especialidad          TEXT[],
            ADD COLUMN IF NOT EXISTS tipo_inmueble         TEXT[],
            ADD COLUMN IF NOT EXISTS precio_rango_min      NUMERIC,
            ADD COLUMN IF NOT EXISTS precio_rango_max      NUMERIC,
            ADD COLUMN IF NOT EXISTS zonas_opera           INT[],
            ADD COLUMN IF NOT EXISTS telefono_verificado   BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS email_verificado      BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS linkedin              TEXT,
            ADD COLUMN IF NOT EXISTS instagram             TEXT,
            ADD COLUMN IF NOT EXISTS sitio_web             TEXT,
            ADD COLUMN IF NOT EXISTS referencia_1_nombre   TEXT,
            ADD COLUMN IF NOT EXISTS referencia_1_telefono TEXT,
            ADD COLUMN IF NOT EXISTS referencia_1_tipo     TEXT,
            ADD COLUMN IF NOT EXISTS referencia_2_nombre   TEXT,
            ADD COLUMN IF NOT EXISTS referencia_2_telefono TEXT,
            ADD COLUMN IF NOT EXISTS referencia_2_tipo     TEXT,
            ADD COLUMN IF NOT EXISTS referencia_3_nombre   TEXT,
            ADD COLUMN IF NOT EXISTS referencia_3_telefono TEXT,
            ADD COLUMN IF NOT EXISTS referencia_3_tipo     TEXT,
            ADD COLUMN IF NOT EXISTS acepta_terminos       BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS acepta_politica       BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS acepta_suspension     BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS firma_timestamp       TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS estado                TEXT DEFAULT 'pendiente',
            ADD COLUMN IF NOT EXISTS motivo_rechazo        TEXT,
            ADD COLUMN IF NOT EXISTS fecha_registro        TIMESTAMPTZ DEFAULT NOW(),
            ADD COLUMN IF NOT EXISTS fecha_aprobacion      TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS aprobado_por          TEXT
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_agentes_estado ON public.agentes(estado)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_agentes_usuario_id ON public.agentes(usuario_id)")


def downgrade() -> None:
    pass
