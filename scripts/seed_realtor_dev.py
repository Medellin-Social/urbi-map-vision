"""Crea un realtor ACTIVO completo (usuario verificado + agency independiente +
agent activo + agency_member owner + 2 listings publicados + visitas) para poder
testear el flujo del dashboard end-to-end en un env donde no existe.

Idempotente: ON CONFLICT en todo; borra y recrea las visitas del agente.
Creds por env (con defaults): REALTOR_EMAIL / REALTOR_PW / REALTOR_NOMBRE.

Uso LOCAL:   DATABASE_URL=... python scripts/seed_realtor_dev.py
Uso DEV:     railway run -e "Medellin social DEV" -s postgis -- sh -c \
  'export DATABASE_URL="postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@$RAILWAY_TCP_PROXY_DOMAIN:$RAILWAY_TCP_PROXY_PORT/$POSTGRES_DB"; python scripts/seed_realtor_dev.py'

NO apunta a prod a propósito: el DATABASE_URL lo inyecta el caller.
"""
import os
from datetime import datetime, timedelta

import bcrypt
import psycopg2
from dotenv import load_dotenv

load_dotenv()

EMAIL = os.getenv("REALTOR_EMAIL", "qa.realtor@example.com")
PW = os.getenv("REALTOR_PW", "QaRealtor-2026")
NOMBRE = os.getenv("REALTOR_NOMBRE", "QA Realtor")
TEL = os.getenv("REALTOR_TEL", "3001112233")
# El Poblado, Medellín (lon, lat) — geom NOT NULL del listing
LON, LAT = -75.5679, 6.2086

conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor()

# 1) usuario verificado + activo (ON CONFLICT: resetea password/verificado)
h = bcrypt.hashpw(PW.encode(), bcrypt.gensalt()).decode()
cur.execute(
    """
    INSERT INTO usuarios (email, password_hash, nombre, email_verificado, activo, origen_registro)
    VALUES (%s, %s, %s, TRUE, TRUE, 'seed')
    ON CONFLICT (email) DO UPDATE
      SET password_hash = EXCLUDED.password_hash, email_verificado = TRUE, activo = TRUE
    RETURNING id
    """,
    (EMAIL, h, NOMBRE),
)
uid = cur.fetchone()[0]

# 2) agency independiente (sin unique natural → busca o crea por nombre)
agency_nombre = f"{NOMBRE} (independiente)"
cur.execute("SELECT id FROM agency WHERE nombre = %s LIMIT 1", (agency_nombre,))
row = cur.fetchone()
if row:
    agency_id = row[0]
else:
    cur.execute(
        "INSERT INTO agency (nombre, tipo) VALUES (%s, 'independiente') RETURNING id",
        (agency_nombre,),
    )
    agency_id = cur.fetchone()[0]

# 3) agent ACTIVO ligado al usuario (ON CONFLICT email: lo activa y lo religa)
slug_agent = EMAIL.split("@")[0].replace(".", "-") + "-qa"
cur.execute(
    """
    INSERT INTO agent (usuario_id, email, nombre, telefono, estado, slug)
    VALUES (%s, %s, %s, %s, 'activo', %s)
    ON CONFLICT (email) DO UPDATE
      SET estado = 'activo', usuario_id = COALESCE(agent.usuario_id, EXCLUDED.usuario_id)
    RETURNING id
    """,
    (uid, EMAIL, NOMBRE, TEL, slug_agent),
)
agent_id = cur.fetchone()[0]

# 4) agency_member owner (idempotente)
cur.execute(
    """
    INSERT INTO agency_member (agency_id, agent_id, rol)
    VALUES (%s, %s, 'owner')
    ON CONFLICT (agency_id, agent_id) DO UPDATE SET rol = 'owner'
    """,
    (agency_id, agent_id),
)

# 5) 2 listings publicados del agente (slug unique → idempotente)
listings = [
    (f"{slug_agent}-apto-poblado", "Apartamento QA en El Poblado", "El Poblado", "venta", 620_000_000, "apartamento", 95, 3, 2),
    (f"{slug_agent}-oficina-poblado", "Oficina QA zona financiera", "El Poblado", "venta", 320_000_000, "oficina", 60, 0, 1),
]
listing_ids = []
for slug, titulo, barrio, operacion, precio, tipo, area, hab, ban in listings:
    cur.execute(
        """
        INSERT INTO listing (slug, agency_id, agent_id, estado, geom, operacion, precio,
                             tipo_inmueble, titulo, barrio, area_m2, habitaciones, banos)
        VALUES (%s, %s, %s, 'publicado',
                ST_SetSRID(ST_MakePoint(%s, %s), 4326),
                %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (slug) DO UPDATE SET estado = 'publicado', agent_id = EXCLUDED.agent_id
        RETURNING id::text
        """,
        (slug, agency_id, agent_id, LON, LAT, operacion, precio, tipo, titulo, barrio, area, hab, ban),
    )
    listing_ids.append(cur.fetchone()[0])
L1, L2 = listing_ids[0], listing_ids[1]

# 6) visitas en todos los estados (borra las previas del agente y recrea)
cur.execute("DELETE FROM visita_solicitud WHERE agent_id = %s", (agent_id,))
now = datetime.now()
FULL = ("invertir", "500-1000M", "ya", "aprobado")
NONE4 = (None, None, None, None)

def ins(listing, nombre, tel, email, fecha, msg, estado, resultado, nota, origen, calif, creada):
    cur.execute(
        """INSERT INTO visita_solicitud
           (listing_url, usuario_id, nombre, telefono, email, fecha_visita, mensaje,
            estado, resultado, nota_realtor, origen, agent_id,
            intencion, presupuesto, plazo, credito, created_at, updated_at)
           VALUES (%s,NULL,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())""",
        (listing, nombre, tel, email, fecha, msg, estado, resultado, nota, origen, agent_id, *calif, creada),
    )

visitas = [
    (L1, "Andrés Gómez",  "3001234567", "andres@example.com", now + timedelta(days=2, hours=10), "¿Puedo este viernes?", "pendiente",  None,         None,                                        "mapa",   FULL,  now - timedelta(hours=9)),
    (L1, "Sara Vélez",    None,         "sara@example.com",   now + timedelta(days=3),            None,                   "pendiente",  None,         None,                                        "mapa",   NONE4, now - timedelta(hours=3)),
    (L1, "Juan Ríos",     "3012223344", "juan@example.com",   now + timedelta(hours=4),           None,                   "confirmada", None,         None,                                        "mapa",   ("vivir", "200-500M", "1-3m", "en_tramite"), now - timedelta(hours=30)),
    (L2, "Marcela Díaz",  "3009998877", None,                 now + timedelta(days=1, hours=5),   "Confirmo mañana.",     "confirmada", None,         None,                                        "mapa",   NONE4, now - timedelta(hours=40)),
    (L1, "Camilo Ruiz",   "3017654321", None,                 now - timedelta(days=2),            None,                   "realizada",  "oferta",     "Ofrece $590M, deja la cocina.",             "mapa",   FULL,  now - timedelta(days=3)),
    (L2, "Ana Torres",    None,         "ana@example.com",    now - timedelta(days=4),            None,                   "realizada",  "interesado", "Compara con otra, decide esta semana.",     "mapa",   ("vivir", "200-500M", "3-6m", "no"), now - timedelta(days=5)),
    (L1, "Valeria Gómez", "3005551212", None,                 now - timedelta(days=1),            None,                   "realizada",  "oferta",     "Contacto mío; oferta formal el lunes.",     "manual", ("invertir", ">1000M", "ya", "contado"), now - timedelta(days=1, hours=2)),
    (L2, "Diego Salazar", None,         None,                 now - timedelta(days=6),            None,                   "no_asistio", None,         None,                                        "mapa",   NONE4, now - timedelta(days=7)),
]
for v in visitas:
    ins(*v)

conn.commit()
cur.execute("SELECT count(*) FROM visita_solicitud WHERE agent_id = %s", (agent_id,))
nv = cur.fetchone()[0]
conn.close()
print(f"OK realtor activo creado:")
print(f"  email    = {EMAIL}")
print(f"  password = {PW}")
print(f"  agent    = {str(agent_id)[:8]}  agency = {str(agency_id)[:8]}")
print(f"  listings = {len(listing_ids)}  visitas = {nv}")
