"""fix: adjunta trigger de historial de precio a fincaraiz/metrocuadrado en prod

0018 creó fn_track_precio_cambio() y adjuntó el trigger a listings_fincaraiz
y listings_metrocuadrado, pero guardado con IF EXISTS: en prod esas dos
tablas no existían todavía en ese punto de la cadena de migraciones (se
crean después, como stub vacío, en 0068/0063 — "no triggers" explícito en
su docstring). El guard se saltó silenciosamente y nadie volvió a
adjuntarlo. Resultado: raw.listings_precio_historial nunca recibió una
sola fila en prod. Local no lo sufre porque esas tablas ya tenían datos
reales desde antes de que 0018 existiera.

Mismo patrón que 0090 (casadolcecasa/habi) — reusa fn_track_precio_cambio(),
DROP TRIGGER IF EXISTS primero por si ya existe (local).

Revision ID: 0091
Revises: 0090
"""
from alembic import op

revision = "0091"
down_revision = "0090"
branch_labels = None
depends_on = None

_TABLES = ["fincaraiz", "metrocuadrado"]


def upgrade() -> None:
    for name in _TABLES:
        table = f"listings_{name}"
        op.execute(f"""
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'raw'
                      AND table_name = '{table}'
                      AND table_type = 'BASE TABLE'
                ) THEN
                    EXECUTE 'DROP TRIGGER IF EXISTS trg_precio_cambio_{name} ON raw.{table}';
                    EXECUTE 'CREATE TRIGGER trg_precio_cambio_{name}
                        BEFORE UPDATE OF precio ON raw.{table}
                        FOR EACH ROW EXECUTE FUNCTION raw.fn_track_precio_cambio()';
                END IF;
            END $$;
        """)


def downgrade() -> None:
    for name in _TABLES:
        op.execute(f"DROP TRIGGER IF EXISTS trg_precio_cambio_{name} ON raw.listings_{name};")
