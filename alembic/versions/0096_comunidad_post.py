"""feat: comunidad_post — contenido self-serve del barrio (fase 1 blog), moderado

Fase 1: embajadores/vecinos publican posts (titulo+cuerpo+imagen+link opcional),
quedan estado='pendiente' hasta que admin aprueba. autor_handle + enlace_url son
la semilla de la fase 2 (embeber/conectar IG/FB).

Revision ID: 0096
Revises: 0095
Create Date: 2026-09-24
"""
from alembic import op

revision = "0096"
down_revision = "0095"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.comunidad_post (
            id           SERIAL PRIMARY KEY,
            autor_nombre VARCHAR NOT NULL,
            autor_email  VARCHAR NOT NULL,
            autor_handle VARCHAR,
            titulo       VARCHAR NOT NULL,
            cuerpo       TEXT    NOT NULL,
            imagen_url   VARCHAR,
            enlace_url   VARCHAR,
            barrio_id    INTEGER REFERENCES raw.barrios(id),
            municipio    VARCHAR,
            categoria    VARCHAR,
            estado       VARCHAR NOT NULL DEFAULT 'pendiente',
            created_at   TIMESTAMP DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_comunidad_post_estado  ON public.comunidad_post(estado)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_comunidad_post_barrio  ON public.comunidad_post(barrio_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS public.comunidad_post")
