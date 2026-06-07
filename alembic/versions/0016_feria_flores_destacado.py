"""seed: Feria de las Flores 2026 como evento destacado

Revision ID: 0016
Revises: 0015
Create Date: 2026-06-06
"""
from alembic import op

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        INSERT INTO public.eventos (
            fuente, titulo, descripcion, foto_url,
            fecha_inicio, fecha_fin,
            gratuito, precio, moneda,
            url_externo, organizador,
            ciudad_id, barrio_id,
            tipo_audiencia, destacado
        ) VALUES (
            'interno',
            'Feria de las Flores 2026',
            'La celebración más emblemática de Medellín. Silleteros, desfiles, flores y cultura paisa durante 10 días en la ciudad más innovadora de América Latina.',
            'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/Feria_de_las_flores.jpg/1200px-Feria_de_las_flores.jpg',
            '2026-08-01 00:00:00',
            '2026-08-10 23:59:00',
            TRUE, 0, 'COP',
            'https://ferialasflores.com',
            'Alcaldía de Medellín',
            1, NULL,
            'social',
            TRUE
        )
        ON CONFLICT DO NOTHING
    """)


def downgrade() -> None:
    op.execute("""
        DELETE FROM public.eventos
        WHERE fuente = 'interno' AND titulo = 'Feria de las Flores 2026'
    """)
