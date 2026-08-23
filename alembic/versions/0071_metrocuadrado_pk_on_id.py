"""move raw.listings_metrocuadrado primary key from url to id

0063's stub made `url` the primary key (it was the only unique-ish column in
the 4-column stub). The real local table (source of truth, 90k rows) has no
uniqueness constraint on url — duplicate URLs exist there — and uses `id`
(serial) as its actual primary key instead. Backfilling real data into prod
hits "duplicate key value violates unique constraint listings_metrocuadrado_pkey"
on url. Drop that PK; add one on id instead, matching local, plus the
indexes local relies on for the cache refresh's filters/joins (barrio_id,
tipo_operacion, tipo_inmueble, precio, geom, url lookup — non-unique).

Revision ID: 0071
Revises: 0070
"""
from alembic import op

revision = "0071"
down_revision = "0070"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE raw.listings_metrocuadrado DROP CONSTRAINT listings_metrocuadrado_pkey;")
    op.execute("ALTER TABLE raw.listings_metrocuadrado ADD PRIMARY KEY (id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_mq_url ON raw.listings_metrocuadrado (url);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_mq_barrio ON raw.listings_metrocuadrado (barrio_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_mq_tipo_op ON raw.listings_metrocuadrado (tipo_operacion);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_mq_tipo_inm ON raw.listings_metrocuadrado (tipo_inmueble);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_mq_precio ON raw.listings_metrocuadrado (precio);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_mq_geom ON raw.listings_metrocuadrado USING gist (geom);")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS raw.idx_mq_geom;")
    op.execute("DROP INDEX IF EXISTS raw.idx_mq_precio;")
    op.execute("DROP INDEX IF EXISTS raw.idx_mq_tipo_inm;")
    op.execute("DROP INDEX IF EXISTS raw.idx_mq_tipo_op;")
    op.execute("DROP INDEX IF EXISTS raw.idx_mq_barrio;")
    op.execute("DROP INDEX IF EXISTS raw.idx_mq_url;")
    op.execute("ALTER TABLE raw.listings_metrocuadrado DROP CONSTRAINT listings_metrocuadrado_pkey;")
    op.execute("ALTER TABLE raw.listings_metrocuadrado ADD PRIMARY KEY (url);")
