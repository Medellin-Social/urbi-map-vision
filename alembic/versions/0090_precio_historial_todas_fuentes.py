"""feat: extiende trigger de historial de precio a casadolcecasa y habi

raw.listings_precio_historial (0018) solo trackeaba fincaraiz y
metrocuadrado. casadolcecasa (0066) y habi (0076) se crearon después y
nunca recibieron el trigger. Reusa raw.fn_track_precio_cambio() —
ambas tablas ya tienen columnas precio/url/fuente compatibles.

listings_premium y listings_renta_media (precio_cop/precio_mes_cop) no
son alembic-managed (se crean vía ensure_table() en scraping/vrbo y
scraping/renta_media) — su trigger se agrega ahí mismo, no aquí.

Revision ID: 0090
Revises: 0089
"""
from alembic import op

revision = "0090"
down_revision = "0089"
branch_labels = None
depends_on = None

_TABLES = ["casadolcecasa", "habi"]


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
