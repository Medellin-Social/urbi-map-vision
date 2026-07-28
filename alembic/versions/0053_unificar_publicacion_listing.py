"""Unificar publicación: listing absorbe listings_propios + eje verificado.

Revision ID: 0053
Revises: 0052
Create Date: 2026-07-14

Modelo nuevo "publica primero, verifica después":
- agency_id/agent_id → NULLABLE: un owner publica sin realtor asignado. El
  asignador (paso 5) los llena luego. Desbloquea el flujo directo de /publicar.
- verificado (flag ortogonal al estado, B1 del doc UNIFICACION_PUBLICACION):
  el listing entra al mapa como 'publicado' sin verificar; el realtor hace due
  diligence y levanta verificado=true. NO se mezcla con listing_estado.
- Columnas ricas migradas de listings_propios (amoblado, amenidades, mascotas,
  permite_airbnb, area_lote_m2, contacto, destacado, vistas).
- Enum listing_tipo_inmueble ampliado: apartaestudio, bodega, otro (los que lp
  permitía y no cabían).

Todo aditivo/aflojante (DROP NOT NULL, ADD COLUMN IF NOT EXISTS, ADD VALUE):
seguro de aplicar sin tocar filas existentes. El backfill de listings_propios
y el retiro del UNION _lp del cache van en un paso posterior, no aquí.
"""
from alembic import op

revision = "0053"
down_revision = "0052"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. FK realtor nullable — owner publica sin realtor (bloqueante #1 del doc).
    op.execute("ALTER TABLE listing ALTER COLUMN agency_id DROP NOT NULL")
    op.execute("ALTER TABLE listing ALTER COLUMN agent_id  DROP NOT NULL")

    # 2. Eje verificado (flag separado del estado).
    op.execute("""
        ALTER TABLE listing
            ADD COLUMN IF NOT EXISTS verificado     BOOLEAN     NOT NULL DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS verificado_at  TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS verificado_por UUID REFERENCES agent(id) ON DELETE SET NULL
    """)

    # 3. Columnas ricas absorbidas de listings_propios.
    #    owner_id: dueño en publicación directa (sin realtor). El flujo realtor
    #    liga owner vía intake.listing_id; este es para el owner que publica solo.
    op.execute("""
        ALTER TABLE listing
            ADD COLUMN IF NOT EXISTS owner_id         UUID REFERENCES owner(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS amoblado         BOOLEAN,
            ADD COLUMN IF NOT EXISTS amenidades       TEXT[],
            ADD COLUMN IF NOT EXISTS mascotas         BOOLEAN,
            ADD COLUMN IF NOT EXISTS permite_airbnb   BOOLEAN,
            ADD COLUMN IF NOT EXISTS area_lote_m2     NUMERIC,
            ADD COLUMN IF NOT EXISTS nombre_contacto  TEXT,
            ADD COLUMN IF NOT EXISTS telefono         TEXT,
            ADD COLUMN IF NOT EXISTS email_contacto   TEXT,
            ADD COLUMN IF NOT EXISTS horario_contacto TEXT,
            ADD COLUMN IF NOT EXISTS destacado        BOOLEAN NOT NULL DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS vistas           INTEGER NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS declaraciones    JSONB
    """)

    # 4. Ampliar enum tipo_inmueble. ADD VALUE no corre dentro de transacción →
    #    autocommit_block (alembic) lo saca del BEGIN implícito.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE listing_tipo_inmueble ADD VALUE IF NOT EXISTS 'apartaestudio'")
        op.execute("ALTER TYPE listing_tipo_inmueble ADD VALUE IF NOT EXISTS 'bodega'")
        op.execute("ALTER TYPE listing_tipo_inmueble ADD VALUE IF NOT EXISTS 'otro'")

    # Índice parcial: el mapa filtra por 'publicado'; verificado se lee mucho.
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_listing_publicado_verif "
        "ON listing(verificado) WHERE estado = 'publicado'"
    )


def downgrade() -> None:
    # ponytail: no se revierte ADD VALUE del enum (Postgres no soporta DROP VALUE
    # sin recrear el tipo). Filas con los valores nuevos quedarían huérfanas si se
    # bajara; asumimos forward-only para el enum, como el resto de enums del repo.
    op.execute("DROP INDEX IF EXISTS idx_listing_publicado_verif")
    op.execute("""
        ALTER TABLE listing
            DROP COLUMN IF EXISTS owner_id,
            DROP COLUMN IF EXISTS amoblado,
            DROP COLUMN IF EXISTS amenidades,
            DROP COLUMN IF EXISTS mascotas,
            DROP COLUMN IF EXISTS permite_airbnb,
            DROP COLUMN IF EXISTS area_lote_m2,
            DROP COLUMN IF EXISTS nombre_contacto,
            DROP COLUMN IF EXISTS telefono,
            DROP COLUMN IF EXISTS email_contacto,
            DROP COLUMN IF EXISTS horario_contacto,
            DROP COLUMN IF EXISTS destacado,
            DROP COLUMN IF EXISTS vistas,
            DROP COLUMN IF EXISTS declaraciones,
            DROP COLUMN IF EXISTS verificado,
            DROP COLUMN IF EXISTS verificado_at,
            DROP COLUMN IF EXISTS verificado_por
    """)
    # No se re-imponen los NOT NULL de agency_id/agent_id: filas nuevas de owner
    # podrían tener NULL y el re-NOT-NULL fallaría. Forward-only también.
