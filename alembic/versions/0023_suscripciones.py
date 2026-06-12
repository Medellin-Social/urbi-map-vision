"""suscripciones_usuario table + plan column on usuarios

Revision ID: 0023
Revises: 0022
Create Date: 2026-06-10
"""
from alembic import op

revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None

_UP = """
ALTER TABLE public.usuarios
ADD COLUMN IF NOT EXISTS plan VARCHAR DEFAULT 'free';

CREATE TABLE IF NOT EXISTS public.suscripciones_usuario (
    id                      SERIAL PRIMARY KEY,
    usuario_id              INT REFERENCES public.usuarios(id) ON DELETE CASCADE,
    plan                    VARCHAR NOT NULL CHECK (plan IN ('pro', 'agente')),
    estado                  VARCHAR DEFAULT 'pendiente'
                                CHECK (estado IN ('pendiente', 'activa', 'cancelada', 'vencida')),
    moneda                  VARCHAR DEFAULT 'COP' CHECK (moneda IN ('COP', 'USD')),
    precio                  NUMERIC,
    stripe_customer_id      TEXT,
    stripe_subscription_id  TEXT,
    stripe_price_id         TEXT,
    wompi_subscription_id   TEXT,
    wompi_customer_id       TEXT,
    wompi_referencia        TEXT,
    fecha_inicio            TIMESTAMPTZ,
    fecha_fin               TIMESTAMPTZ,
    fecha_creacion          TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW(),
    cancelacion_solicitada  BOOLEAN DEFAULT FALSE,
    UNIQUE(usuario_id, plan)
);

CREATE INDEX IF NOT EXISTS idx_susc_usuario_id ON public.suscripciones_usuario(usuario_id);
CREATE INDEX IF NOT EXISTS idx_susc_stripe_sub ON public.suscripciones_usuario(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_susc_wompi_sub ON public.suscripciones_usuario(wompi_subscription_id);
CREATE INDEX IF NOT EXISTS idx_susc_wompi_ref ON public.suscripciones_usuario(wompi_referencia);
"""

_DOWN = """
DROP TABLE IF EXISTS public.suscripciones_usuario;
ALTER TABLE public.usuarios DROP COLUMN IF EXISTS plan;
"""


def upgrade() -> None:
    op.execute(_UP)


def downgrade() -> None:
    op.execute(_DOWN)
