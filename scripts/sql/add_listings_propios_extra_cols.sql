-- Migration: extend listings_propios for direct-publish flow
-- Run once. All columns are nullable so existing rows are unaffected.

ALTER TABLE public.listings_propios
  ADD COLUMN IF NOT EXISTS user_id          INTEGER,
  ADD COLUMN IF NOT EXISTS nombre_contacto  VARCHAR,
  ADD COLUMN IF NOT EXISTS telefono         VARCHAR,
  ADD COLUMN IF NOT EXISTS email_contacto   VARCHAR,
  ADD COLUMN IF NOT EXISTS horario_contacto VARCHAR,
  ADD COLUMN IF NOT EXISTS area_lote_m2     DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS antiguedad       VARCHAR,
  ADD COLUMN IF NOT EXISTS mascotas         VARCHAR DEFAULT 'consultar',
  ADD COLUMN IF NOT EXISTS permite_airbnb   VARCHAR DEFAULT 'no_se',
  ADD COLUMN IF NOT EXISTS administracion_cop NUMERIC,
  ADD COLUMN IF NOT EXISTS fuente           VARCHAR DEFAULT 'propio',
  ADD COLUMN IF NOT EXISTS fecha_publicacion TIMESTAMP DEFAULT NOW();

-- FK to usuarios (soft — no cascade)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'listings_propios_user_id_fkey'
  ) THEN
    ALTER TABLE public.listings_propios
      ADD CONSTRAINT listings_propios_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Index for dashboard queries
CREATE INDEX IF NOT EXISTS idx_listings_propios_user_id ON public.listings_propios(user_id);
CREATE INDEX IF NOT EXISTS idx_listings_propios_estado  ON public.listings_propios(estado);
