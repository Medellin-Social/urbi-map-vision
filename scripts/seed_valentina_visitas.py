"""LOCAL ONLY — pone password a realtor.test@example.com (Valentina Test) y le
siembra visitas en todos los estados para revisar la sección de visitas del
dashboard. Idempotente: borra las visitas del agente y las recrea. No tocar prod.
"""
import os
from datetime import datetime, timedelta

import bcrypt
import psycopg2
from dotenv import load_dotenv

load_dotenv()
PW = "Valentina-2026"
EMAIL = "realtor.test@example.com"

conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor()

# 1) usuario + password
cur.execute("SELECT id FROM usuarios WHERE email=%s ORDER BY id LIMIT 1", (EMAIL,))
uid = cur.fetchone()[0]
h = bcrypt.hashpw(PW.encode(), bcrypt.gensalt()).decode()
cur.execute("UPDATE usuarios SET password_hash=%s, activo=TRUE, email_verificado=TRUE WHERE id=%s", (h, uid))

# 2) agente canónico (igual que _agent_del_usuario: activo primero, más viejo)
cur.execute("SELECT id FROM agent WHERE usuario_id=%s ORDER BY (estado='activo') DESC, created_at ASC LIMIT 1", (uid,))
agent = cur.fetchone()[0]

# 3) 2 listings publicados del agente (para títulos lindos; fallback a cualquiera)
cur.execute("SELECT id::text FROM listing WHERE agent_id=%s AND estado='publicado' AND deleted_at IS NULL LIMIT 2", (agent,))
ls = [r[0] for r in cur.fetchall()]
if not ls:
    cur.execute("SELECT id::text FROM listing WHERE agent_id=%s LIMIT 2", (agent,))
    ls = [r[0] for r in cur.fetchall()]
L1 = ls[0]
L2 = ls[1] if len(ls) > 1 else ls[0]

# 4) limpiar visitas previas del agente y recrear
cur.execute("DELETE FROM visita_solicitud WHERE agent_id=%s", (agent,))

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
        (listing, nombre, tel, email, fecha, msg, estado, resultado, nota, origen, agent, *calif, creada),
    )

visitas = [
    # Por confirmar (inbox): una vencida (sin responder 9h) + una fresca
    (L1, "Andrés Gómez",  "3001234567", "andres@example.com", now + timedelta(days=2, hours=10), "¿Puedo este viernes a las 10am?", "pendiente",  None,         None,                                                     "mapa",   FULL,  now - timedelta(hours=9)),
    (L1, "Sara Vélez",    None,         "sara@example.com",   now + timedelta(days=3),            None,                              "pendiente",  None,         None,                                                     "mapa",   NONE4, now - timedelta(hours=3)),
    # Confirmadas (calendario): hoy + mañana
    (L1, "Juan Ríos",     "3012223344", "juan@example.com",   now + timedelta(hours=4),           None,                              "confirmada", None,         None,                                                     "mapa",   ("vivir", "200-500M", "1-3m", "en_tramite"), now - timedelta(hours=30)),
    (L2, "Marcela Díaz",  "3009998877", None,                 now + timedelta(days=1, hours=5),   "Confirmo para mañana.",            "confirmada", None,         None,                                                     "mapa",   NONE4, now - timedelta(hours=40)),
    # Historial: oferta, interesado, manual, no asistió
    (L1, "Camilo Ruiz",   "3017654321", None,                 now - timedelta(days=2),            None,                              "realizada",  "oferta",     "Ofrece $590M, pide dejar la cocina integral.",           "mapa",   FULL,  now - timedelta(days=3)),
    (L2, "Ana Torres",    None,         "ana@example.com",    now - timedelta(days=4),            None,                              "realizada",  "interesado", "Le gustó; compara con otra en Envigado, decide esta semana.", "mapa", ("vivir", "200-500M", "3-6m", "no"), now - timedelta(days=5)),
    (L1, "Valeria Gómez", "3005551212", None,                 now - timedelta(days=1),            None,                              "realizada",  "oferta",     "Contacto mío; hará oferta formal el lunes.",             "manual", ("invertir", ">1000M", "ya", "contado"), now - timedelta(days=1, hours=2)),
    (L2, "Diego Salazar", None,         None,                 now - timedelta(days=6),            None,                              "no_asistio", None,         None,                                                     "mapa",   NONE4, now - timedelta(days=7)),
]
for v in visitas:
    ins(*v)

conn.commit()
cur.execute("SELECT count(*) FROM visita_solicitud WHERE agent_id=%s", (agent,))
n = cur.fetchone()[0]
conn.close()
print(f"OK — {EMAIL} / {PW} | agente {str(agent)[:8]} | {n} visitas creadas")
