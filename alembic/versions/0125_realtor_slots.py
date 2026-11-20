"""Realtor directory — 20 posiciones por zona con rotación ponderada

Revision ID: 0125
Revises: 0124
Create Date: 2026-11-16

Modelo nuevo del directorio público de realtors (ver docs/FLUJO_REALTOR.md §6).
Cada zona (community) tiene hasta 20 posiciones. El primer suscriptor toma la
posición 1 (precio más BAJO, peso más ALTO = más visible); cada siguiente toma la
siguiente posición con precio mayor, hasta la 20.

Dos tablas:
  - realtor_slot_config : precios y pesos POR POSICIÓN, zona-agnóstico, EDITABLE
    (no viven en código; se ajustan por UPDATE/panel sin deploy). peso > 0
    obligatorio → ninguna posición queda invisible en la rotación.
  - realtor_slot        : las suscripciones (un agente ocupando una posición en una
    zona). UNIQUE parcial (community_id, zona_nivel, posicion) WHERE estado='activa'
    es el guard de concurrencia del pago: dos pagos no pueden tomar la misma posición.

community_id ≡ zona_codigo (misma convención polimórfica que sponsorship, 0047):
barrio_id::text | cd_comuna | municipio; zona_nivel desambigua.

Seed: 20 filas de config con precio PLACEHOLDER (0, aún no definido por negocio) y
peso decreciente 20..1. Es carril "schema + backfill de una vez" (CLAUDE.md): los
precios/pesos reales son UPDATEs de datos posteriores, no cambios de código.
"""
from alembic import op

revision = "0125"
down_revision = "0124"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS realtor_slot_config (
            posicion       SMALLINT PRIMARY KEY CHECK (posicion BETWEEN 1 AND 20),
            precio_mensual NUMERIC  NOT NULL DEFAULT 0 CHECK (precio_mensual >= 0),
            peso           NUMERIC  NOT NULL CHECK (peso > 0)
        )
    """)
    # Seed idempotente de las 20 posiciones: precio placeholder (0), peso 20..1.
    op.execute("""
        INSERT INTO realtor_slot_config (posicion, precio_mensual, peso)
        SELECT g, 0, (21 - g)::numeric
        FROM generate_series(1, 20) AS g
        ON CONFLICT (posicion) DO NOTHING
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS realtor_slot (
            id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            community_id      TEXT        NOT NULL,
            zona_nivel        TEXT        NOT NULL DEFAULT 'barrio',
            posicion          SMALLINT    NOT NULL REFERENCES realtor_slot_config(posicion),
            agent_id          UUID        NOT NULL REFERENCES agent(id) ON DELETE RESTRICT,
            estado            TEXT        NOT NULL DEFAULT 'activa'
                              CHECK (estado IN ('activa', 'pausada', 'cancelada')),
            fecha_suscripcion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    # Una posición la ocupa un solo agente a la vez (guard de carrera del pago).
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_realtor_slot_pos "
        "ON realtor_slot (community_id, zona_nivel, posicion) WHERE estado = 'activa'"
    )
    # Un agente ocupa a lo sumo una posición activa por zona.
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_realtor_slot_agent "
        "ON realtor_slot (community_id, zona_nivel, agent_id) WHERE estado = 'activa'"
    )
    # Listado de la zona (posiciones activas) para el orden público.
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_realtor_slot_community "
        "ON realtor_slot (community_id, zona_nivel, estado)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS realtor_slot")
    op.execute("DROP TABLE IF EXISTS realtor_slot_config")
