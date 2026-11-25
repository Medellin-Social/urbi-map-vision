"""Chequeo read-only de la DB de DEV: versión alembic + columnas nuevas de visitas.
Corre con: railway run -e "Medellin social DEV" -s postgis -- sh -c \
  'export DATABASE_URL="postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@$RAILWAY_TCP_PROXY_DOMAIN:$RAILWAY_TCP_PROXY_PORT/$POSTGRES_DB"; python3 scripts/check_dev_migration.py'
"""
import os
import psycopg2

c = psycopg2.connect(os.environ["DATABASE_URL"])
cur = c.cursor()
cur.execute("SELECT version_num FROM alembic_version")
print("alembic_version:", cur.fetchone()[0])
cur.execute("""SELECT column_name FROM information_schema.columns
               WHERE table_name='visita_solicitud' AND column_name IN ('nota_realtor','origen')""")
cols = sorted(r[0] for r in cur.fetchall())
print("columnas visitas nuevas:", cols, "| OK" if cols == ["nota_realtor", "origen"] else "| FALTAN")
cur.execute("SELECT count(*) FROM visita_solicitud")
print("visitas en DEV:", cur.fetchone()[0])
cur.execute("SELECT count(*) FROM agent WHERE estado='activo'")
print("agentes activos en DEV:", cur.fetchone()[0])
c.close()
