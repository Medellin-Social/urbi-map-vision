"""extended onboarding: new perfil_inversor columns + leads table

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-28
"""
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Ensure unique constraint on usuario_id so ON CONFLICT works on all envs
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'perfil_inversor_usuario_id_key'
                  AND conrelid = 'perfil_inversor'::regclass
            ) THEN
                ALTER TABLE perfil_inversor
                ADD CONSTRAINT perfil_inversor_usuario_id_key UNIQUE (usuario_id);
            END IF;
        EXCEPTION WHEN others THEN NULL;
        END $$;
    """)

    op.execute("""
        ALTER TABLE perfil_inversor
        ADD COLUMN IF NOT EXISTS tipo_usuario             VARCHAR DEFAULT 'investor',
        ADD COLUMN IF NOT EXISTS n_unidades               VARCHAR,
        ADD COLUMN IF NOT EXISTS tipo_gestion             VARCHAR,
        ADD COLUMN IF NOT EXISTS target_inquilino         VARCHAR,
        ADD COLUMN IF NOT EXISTS amoblado                 VARCHAR,
        ADD COLUMN IF NOT EXISTS tipo_pago                VARCHAR,
        ADD COLUMN IF NOT EXISTS horizonte_inversion      VARCHAR,
        ADD COLUMN IF NOT EXISTS primera_propiedad        BOOLEAN DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS wants_agent              BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS onboarding_completado_at TIMESTAMP
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS leads (
            id          SERIAL PRIMARY KEY,
            usuario_id  INTEGER UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
            estado      VARCHAR DEFAULT 'nuevo',
            asignado_a  VARCHAR,
            notas       TEXT,
            created_at  TIMESTAMP DEFAULT NOW()
        )
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_leads_usuario ON leads(usuario_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_leads_estado ON leads(estado, created_at DESC)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS leads")
    op.execute("""
        ALTER TABLE perfil_inversor
        DROP COLUMN IF EXISTS tipo_usuario,
        DROP COLUMN IF EXISTS n_unidades,
        DROP COLUMN IF EXISTS tipo_gestion,
        DROP COLUMN IF EXISTS target_inquilino,
        DROP COLUMN IF EXISTS amoblado,
        DROP COLUMN IF EXISTS tipo_pago,
        DROP COLUMN IF EXISTS horizonte_inversion,
        DROP COLUMN IF EXISTS primera_propiedad,
        DROP COLUMN IF EXISTS wants_agent,
        DROP COLUMN IF EXISTS onboarding_completado_at
    """)
