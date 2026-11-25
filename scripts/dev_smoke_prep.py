"""DEV smoke: elige el agente activo con más listings/visitas y le pone un password
conocido para probar login + agenda. Solo DEV. Imprime email + password a usar.
"""
import os
import bcrypt
import psycopg2

PW = "DevSmoke-2026"
c = psycopg2.connect(os.environ["DATABASE_URL"])
cur = c.cursor()
cur.execute(
    """SELECT a.id, u.id, u.email,
              (SELECT count(*) FROM listing l WHERE l.agent_id = a.id) AS nl,
              (SELECT count(*) FROM visita_solicitud v WHERE v.agent_id = a.id) AS nv
       FROM agent a JOIN usuarios u ON u.id = a.usuario_id
       WHERE a.estado = 'activo'
       ORDER BY nv DESC, nl DESC LIMIT 1"""
)
row = cur.fetchone()
if not row:
    print("NO_AGENT")
    raise SystemExit(1)
agent_id, uid, email, nl, nv = row
h = bcrypt.hashpw(PW.encode(), bcrypt.gensalt()).decode()
cur.execute("UPDATE usuarios SET password_hash=%s, activo=TRUE, email_verificado=TRUE WHERE id=%s", (h, uid))
c.commit()
c.close()
print(f"EMAIL={email}")
print(f"PASSWORD={PW}")
print(f"agent={str(agent_id)[:8]} listings={nl} visitas_dir={nv}")
