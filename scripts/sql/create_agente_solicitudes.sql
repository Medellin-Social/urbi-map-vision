-- Solicitudes de propietario a agente para gestionar su listing
CREATE TABLE IF NOT EXISTS public.agente_solicitudes (
    id          SERIAL PRIMARY KEY,
    listing_id  INTEGER NOT NULL REFERENCES public.listings_propios(id) ON DELETE CASCADE,
    agente_id   INTEGER NOT NULL REFERENCES public.agentes(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
    estado      VARCHAR DEFAULT 'pendiente'
                CHECK (estado IN ('pendiente', 'aceptada', 'rechazada')),
    mensaje     TEXT,
    created_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP DEFAULT NOW()
);

-- Un propietario no puede enviar dos solicitudes al mismo agente para el mismo listing
CREATE UNIQUE INDEX IF NOT EXISTS idx_solicitudes_listing_agente
    ON public.agente_solicitudes(listing_id, agente_id);

CREATE INDEX IF NOT EXISTS idx_solicitudes_agente_id
    ON public.agente_solicitudes(agente_id);

CREATE INDEX IF NOT EXISTS idx_solicitudes_user_id
    ON public.agente_solicitudes(user_id);
