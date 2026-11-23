"""Programa de agentes (docs/Medellin-Social-Programa-Inmobiliario-ES.md)

Estados públicos: no registrado / registrado / certificado / preferente (barrio|comuna).
Precios USD (confirmados 2026-11-21): registro $25 único; $5 único por anuncio;
certificación $99 único + $25/mes (5 anuncios incluidos); ilimitado $99/mes.
Registro y certificación SE SUMAN. Preferente sigue en realtor_preferido_* (COP).

- agent: registro_pagado_at, cert_cuota_pagada_at, cert_plan, cert_plan_vence.
  Backfill: agentes ya 'activo' quedan con registro pagado (grandfather).
- agent_certificacion: solicitud (trayectoria + examen EASE externo + revisión admin).
  agent.certificado lo recalcula agent_program_service.recalcular_certificado; un
  pago NUNCA sustituye una evaluación pendiente o no aprobada.
- agent_program_pago: ledger idempotente por pago_ref (webhook GHL).
- listing_representacion (+ _evento): vinculación agente↔anuncio por listing_url
  (misma llave que listing_reclamo; propios = listing.id::text), con revisión.
- leads_servicio: "Más información" (realtor de la casa / property manager / administración).

Revision ID: 0131
Revises: 0130
"""
from alembic import op

revision = "0131"
down_revision = "0130"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE agent ADD COLUMN IF NOT EXISTS registro_pagado_at TIMESTAMPTZ")
    op.execute("ALTER TABLE agent ADD COLUMN IF NOT EXISTS cert_cuota_pagada_at TIMESTAMPTZ")
    op.execute("ALTER TABLE agent ADD COLUMN IF NOT EXISTS cert_plan TEXT")
    op.execute("ALTER TABLE agent DROP CONSTRAINT IF EXISTS chk_agent_cert_plan")
    op.execute("ALTER TABLE agent ADD CONSTRAINT chk_agent_cert_plan "
               "CHECK (cert_plan IS NULL OR cert_plan IN ('estandar','ilimitado'))")
    op.execute("ALTER TABLE agent ADD COLUMN IF NOT EXISTS cert_plan_vence TIMESTAMPTZ")
    # zonas de servicio declaradas en el registro (texto libre: barrios/comunas)
    op.execute("ALTER TABLE agent ADD COLUMN IF NOT EXISTS zonas_servicio TEXT[]")
    op.execute("UPDATE agent SET registro_pagado_at = COALESCE(updated_at, created_at, now()) "
               "WHERE estado::text = 'activo' AND registro_pagado_at IS NULL")

    op.execute("""
    CREATE TABLE IF NOT EXISTS agent_certificacion (
        id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id           UUID NOT NULL REFERENCES agent(id) ON DELETE CASCADE,
        anios_experiencia  SMALLINT NOT NULL CHECK (anios_experiencia BETWEEN 0 AND 80),
        n_transacciones    INTEGER  NOT NULL CHECK (n_transacciones BETWEEN 0 AND 100000),
        descripcion        TEXT,
        documentos         JSONB NOT NULL DEFAULT '[]'::jsonb,
        examen_evidencia_url TEXT,
        examen_estado      TEXT NOT NULL DEFAULT 'pendiente'
                           CHECK (examen_estado IN ('pendiente','enviado','aprobado','no_aprobado')),
        revision_estado    TEXT NOT NULL DEFAULT 'enviado'
                           CHECK (revision_estado IN ('enviado','pendiente','aprobado','no_aprobado')),
        revisor_email      TEXT,
        motivo             TEXT,
        aprobado_at        TIMESTAMPTZ,
        created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
    )""")
    # una solicitud viva por agente (las no aprobadas se pueden reenviar creando otra)
    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_certificacion_viva
        ON agent_certificacion(agent_id)
        WHERE examen_estado <> 'no_aprobado' AND revision_estado <> 'no_aprobado'""")

    op.execute("""
    CREATE TABLE IF NOT EXISTS agent_program_pago (
        pago_ref    TEXT PRIMARY KEY,
        agent_id    UUID NOT NULL REFERENCES agent(id) ON DELETE CASCADE,
        producto    TEXT NOT NULL CHECK (producto IN
                    ('registro','cert_cuota','cert_mensual','cert_ilimitado','anuncio')),
        listing_url TEXT,
        monto_usd   NUMERIC NOT NULL,
        payload     JSONB,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )""")
    op.execute("CREATE INDEX IF NOT EXISTS idx_agent_program_pago_agent ON agent_program_pago(agent_id)")

    op.execute("""
    CREATE TABLE IF NOT EXISTS listing_representacion (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        listing_url  TEXT NOT NULL,
        agent_id     UUID NOT NULL REFERENCES agent(id) ON DELETE CASCADE,
        estado       TEXT NOT NULL DEFAULT 'solicitado'
                     CHECK (estado IN ('solicitado','aprobado','rechazado','retirado')),
        cobertura    TEXT NOT NULL DEFAULT 'ninguna'
                     CHECK (cobertura IN ('ninguna','incluido','pago','ilimitado')),
        relacion     TEXT,
        motivo       TEXT,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )""")
    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS uq_listing_representacion_aprobada
        ON listing_representacion(listing_url) WHERE estado = 'aprobado'""")
    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS uq_listing_representacion_viva
        ON listing_representacion(listing_url, agent_id) WHERE estado IN ('solicitado','aprobado')""")
    op.execute("CREATE INDEX IF NOT EXISTS idx_listing_representacion_agent ON listing_representacion(agent_id, estado)")

    op.execute("""
    CREATE TABLE IF NOT EXISTS listing_representacion_evento (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        representacion_id UUID NOT NULL REFERENCES listing_representacion(id) ON DELETE CASCADE,
        accion            TEXT NOT NULL,
        detalle           JSONB,
        actor             TEXT,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    )""")

    op.execute("""
    CREATE TABLE IF NOT EXISTS leads_servicio (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tipo            TEXT NOT NULL CHECK (tipo IN ('realtor_casa','property_manager','administracion')),
        nombre          TEXT NOT NULL,
        email           TEXT,
        telefono        TEXT,
        barrio          TEXT,
        listing_url     TEXT,
        mensaje         TEXT,
        consentimiento  BOOLEAN NOT NULL DEFAULT FALSE,
        estado          TEXT NOT NULL DEFAULT 'nuevo'
                        CHECK (estado IN ('nuevo','contactado','cerrado','descartado')),
        ghl_contact_id  TEXT,
        usuario_id      UUID,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT chk_leads_servicio_contacto CHECK (email IS NOT NULL OR telefono IS NOT NULL)
    )""")
    op.execute("CREATE INDEX IF NOT EXISTS idx_leads_servicio_estado ON leads_servicio(estado, created_at DESC)")

    # listing_reclamo: revisión admin (hoy nadie lo saca de 'pendiente')
    op.execute("ALTER TABLE listing_reclamo ADD COLUMN IF NOT EXISTS revisor_email TEXT")
    op.execute("ALTER TABLE listing_reclamo ADD COLUMN IF NOT EXISTS motivo_resolucion TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE listing_reclamo DROP COLUMN IF EXISTS motivo_resolucion")
    op.execute("ALTER TABLE listing_reclamo DROP COLUMN IF EXISTS revisor_email")
    op.execute("DROP TABLE IF EXISTS leads_servicio")
    op.execute("DROP TABLE IF EXISTS listing_representacion_evento")
    op.execute("DROP TABLE IF EXISTS listing_representacion")
    op.execute("DROP TABLE IF EXISTS agent_program_pago")
    op.execute("DROP TABLE IF EXISTS agent_certificacion")
    op.execute("ALTER TABLE agent DROP COLUMN IF EXISTS zonas_servicio")
    op.execute("ALTER TABLE agent DROP COLUMN IF EXISTS cert_plan_vence")
    op.execute("ALTER TABLE agent DROP CONSTRAINT IF EXISTS chk_agent_cert_plan")
    op.execute("ALTER TABLE agent DROP COLUMN IF EXISTS cert_plan")
    op.execute("ALTER TABLE agent DROP COLUMN IF EXISTS cert_cuota_pagada_at")
    op.execute("ALTER TABLE agent DROP COLUMN IF EXISTS registro_pagado_at")
