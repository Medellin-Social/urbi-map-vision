-- Migration 0023: subscription infrastructure
-- Run manually or via alembic

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
    -- Stripe
    stripe_customer_id      TEXT,
    stripe_subscription_id  TEXT,
    stripe_price_id         TEXT,
    -- Wompi
    wompi_subscription_id   TEXT,
    wompi_customer_id       TEXT,
    wompi_referencia        TEXT,
    -- Control
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
