"""Consolidación agentes fase 1 — backfill columnas nuevas desde viejas

Revision ID: 0043
Revises: 0042
Create Date: 2026-06-30

public.agentes arrastra esquema DUAL: columnas viejas (0005) + nuevas (0020/0035).
Esta migración rellena las NUEVAS desde las VIEJAS solo donde la nueva está vacía.
Idempotente y NO destructiva: no pisa datos nuevos, no borra columnas viejas.
El drop de columnas viejas va en una migración separada (fase 3).
"""
from alembic import op

revision = "0043"
down_revision = "0042"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Datos: vieja → nueva, solo donde la nueva está vacía.
    op.execute("""
        UPDATE public.agentes
           SET nombre_completo = TRIM(COALESCE(nombre,'') || ' ' || COALESCE(apellido,''))
         WHERE (nombre_completo IS NULL OR nombre_completo = '')
           AND TRIM(COALESCE(nombre,'') || ' ' || COALESCE(apellido,'')) <> ''
    """)
    op.execute("""
        UPDATE public.agentes
           SET inmobiliaria_nombre = agencia
         WHERE (inmobiliaria_nombre IS NULL OR inmobiliaria_nombre = '')
           AND COALESCE(agencia,'') <> ''
    """)
    op.execute("""
        UPDATE public.agentes
           SET zonas_opera = barrios_especializados
         WHERE (zonas_opera IS NULL OR cardinality(zonas_opera) = 0)
           AND barrios_especializados IS NOT NULL
           AND cardinality(barrios_especializados) > 0
    """)
    op.execute("""
        UPDATE public.agentes
           SET foto_perfil = foto_url
         WHERE (foto_perfil IS NULL OR foto_perfil = '')
           AND COALESCE(foto_url,'') <> ''
    """)

    # estado: solo filas con estado NULL. No pisa estado existente (respeta 'rechazado').
    # verif+activo viejo → 'aprobado'; resto → 'pendiente'.
    op.execute("""
        UPDATE public.agentes
           SET estado = CASE
                          WHEN verificado IS TRUE AND activo IS TRUE THEN 'aprobado'
                          ELSE 'pendiente'
                        END
         WHERE estado IS NULL
    """)


def downgrade() -> None:
    # Backfill no destructivo: no hay nada que revertir (las viejas siguen intactas).
    pass
