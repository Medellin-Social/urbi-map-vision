"""Seed Laureles para testear ruteo de leads por sponsorship (DEV, idempotente).

Crea 3 cuentas + inventario:
  1. Realtor COMUNA  — agent activo + agency + sponsorship(comuna, '11').
  2. Realtor BARRIO  — agent activo + agency + sponsorship(barrio, '270' = LAURELES).
  3. Suscriptor normal — usuario plan='pro' (sin agent). Agenda visitas y publica
     su listing propio (ninguna de esas dos acciones gatea por plan hoy).

A cada realtor le ASIGNA 10 listings REALES de la base (clonados de
staging.stg_listings_unificado, el mismo set que sirve el mapa) a su tabla
`listing` con agent_id → aparecen en "Mis listings". Comuna 11 (A) y barrio 270 (B).

Sponsorship = modelo EXCLUSIVO que rutea leads (NO realtor_preferido_slot, que es
el carrusel). Exclusividad app-enforced (no hay unique en (zona_nivel,zona_codigo))
→ el seed CANCELA sponsorships activos de OTRA agencia en la tupla exacta.

Idempotente: ON CONFLICT en todo; slugs deterministas para los listings.

Uso DEV:
  railway run -e "Medellin social DEV" -s postgis -- sh -c \
    'export DATABASE_URL="postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@$RAILWAY_TCP_PROXY_DOMAIN:$RAILWAY_TCP_PROXY_PORT/$POSTGRES_DB"; python scripts/seed_laureles_realtors_dev.py'
"""
import os

import bcrypt
import psycopg2
from dotenv import load_dotenv

load_dotenv()

PW_REALTOR = os.getenv("REALTOR_PW", "Laureles-2026")
PW_SUB = os.getenv("SUB_PW", "Suscriptor-2026")
COMUNA_LAURELES = "11"          # cd_comuna Laureles-Estadio
BARRIO_LAURELES = "270"         # raw.barrios.id del barrio LAURELES
PRECIO_COMUNA = 1_000_000       # zona_sponsor_service.PRECIO_COMUNA
PRECIO_BARRIO = 200_000         # zona_sponsor_service.PRECIO_BARRIO
# enum listing_tipo_inmueble — staging trae extras (consultorio, casa_lote...) que
# romperían el cast; nos quedamos con los válidos (cubren >99%).
TIPOS_VALIDOS = ("apartamento", "casa", "local", "oficina", "lote", "finca", "apartaestudio", "bodega", "otro")

conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor()


def upsert_usuario(email, pw, nombre, plan):
    h = bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()
    cur.execute(
        """
        INSERT INTO usuarios (email, password_hash, nombre, email_verificado, activo, origen_registro, plan)
        VALUES (%s, %s, %s, TRUE, TRUE, 'seed', %s)
        ON CONFLICT (email) DO UPDATE
          SET password_hash = EXCLUDED.password_hash, email_verificado = TRUE,
              activo = TRUE, plan = EXCLUDED.plan
        RETURNING id
        """,
        (email, h, nombre, plan),
    )
    return cur.fetchone()[0]


def ensure_agency(nombre):
    cur.execute("SELECT id FROM agency WHERE nombre = %s LIMIT 1", (nombre,))
    row = cur.fetchone()
    if row:
        return row[0]
    cur.execute("INSERT INTO agency (nombre, tipo) VALUES (%s, 'independiente') RETURNING id", (nombre,))
    return cur.fetchone()[0]


def ensure_agent(uid, email, nombre, tel):
    slug = email.split("@")[0].replace(".", "-")
    cur.execute(
        """
        INSERT INTO agent (usuario_id, email, nombre, telefono, estado, slug)
        VALUES (%s, %s, %s, %s, 'activo', %s)
        ON CONFLICT (email) DO UPDATE
          SET estado = 'activo', usuario_id = COALESCE(agent.usuario_id, EXCLUDED.usuario_id)
        RETURNING id
        """,
        (uid, email, nombre, tel, slug),
    )
    return cur.fetchone()[0]


def ensure_member(agency_id, agent_id):
    cur.execute(
        "INSERT INTO agency_member (agency_id, agent_id, rol) VALUES (%s, %s, 'owner') "
        "ON CONFLICT (agency_id, agent_id) DO UPDATE SET rol = 'owner'",
        (agency_id, agent_id),
    )


def ensure_sponsorship(agency_id, nivel, codigo, precio):
    """Deja a ESTA agency como único patrocinador activo de la tupla."""
    cur.execute(
        "UPDATE sponsorship SET estado = 'cancelada', updated_at = NOW() "
        "WHERE zona_nivel = %s::sponsorship_zona_nivel AND zona_codigo = %s "
        "AND estado = 'activa' AND agency_id <> %s",
        (nivel, codigo, agency_id),
    )
    cleared = cur.rowcount
    cur.execute(
        "SELECT id FROM sponsorship WHERE zona_nivel = %s::sponsorship_zona_nivel "
        "AND zona_codigo = %s AND agency_id = %s AND estado = 'activa' LIMIT 1",
        (nivel, codigo, agency_id),
    )
    row = cur.fetchone()
    if row:
        return row[0], cleared
    cur.execute(
        "INSERT INTO sponsorship (agency_id, zona_nivel, zona_codigo, tier, precio_mensual, "
        "fecha_inicio, fecha_fin, estado) "
        "VALUES (%s, %s::sponsorship_zona_nivel, %s, %s, %s, CURRENT_DATE, "
        "CURRENT_DATE + INTERVAL '365 days', 'activa') RETURNING id",
        (agency_id, nivel, codigo, nivel, precio),
    )
    return cur.fetchone()[0], cleared


def assign_listings(prefix, agency_id, agent_id, where_sql, params):
    """Clona 10 listings reales del staging a `listing` con agent_id. Slug
    determinista (prefix-1..10) → ON CONFLICT estable entre corridas."""
    cur.execute(
        f"""
        INSERT INTO listing (slug, agency_id, agent_id, estado, geom, municipio, barrio,
                             operacion, precio, tipo_inmueble, area_m2, habitaciones, banos, titulo)
        SELECT %s || '-' || row_number() OVER (ORDER BY url),
               %s::uuid, %s::uuid, 'publicado', geom, 'MEDELLIN', barrio_raw,
               tipo_operacion::listing_operacion, precio_cop,
               tipo_inmueble::listing_tipo_inmueble, NULLIF(area_m2, 0),
               habitaciones::smallint, ROUND(banos)::smallint,
               INITCAP(tipo_inmueble) || ' en ' || COALESCE(INITCAP(barrio_raw), 'Laureles')
        FROM (
            SELECT s.geom, s.barrio_raw, s.tipo_operacion, s.precio_cop, s.tipo_inmueble,
                   s.area_m2, s.habitaciones, s.banos, s.url
            FROM staging.stg_listings_unificado s
            JOIN analytics.barrios_cd bc ON bc.barrio_id = s.barrio_id
            WHERE {where_sql}
              AND s.geom IS NOT NULL AND s.precio_cop > 0
              AND s.tipo_inmueble = ANY(%s)
            ORDER BY s.url
            LIMIT 10
        ) q
        ON CONFLICT (slug) DO UPDATE
          SET agent_id = EXCLUDED.agent_id, agency_id = EXCLUDED.agency_id, estado = 'publicado'
        """,
        (prefix, agency_id, agent_id, *params, list(TIPOS_VALIDOS)),
    )
    cur.execute("SELECT count(*) FROM listing WHERE agent_id = %s::uuid AND deleted_at IS NULL", (agent_id,))
    return cur.fetchone()[0]


# ── 1) Realtor COMUNA ────────────────────────────────────────────────────────
A_EMAIL = "laureles.comuna@example.com"
a_uid = upsert_usuario(A_EMAIL, PW_REALTOR, "Laura Comuna (Laureles)", "agente")
a_agency = ensure_agency("Laura Comuna (independiente)")
a_agent = ensure_agent(a_uid, A_EMAIL, "Laura Comuna (Laureles)", "3001100011")
ensure_member(a_agency, a_agent)
a_sid, a_cleared = ensure_sponsorship(a_agency, "comuna", COMUNA_LAURELES, PRECIO_COMUNA)
a_n = assign_listings("seed-laureles-comuna", a_agency, a_agent, "bc.cd_comuna = %s", (int(COMUNA_LAURELES),))

# ── 2) Realtor BARRIO ────────────────────────────────────────────────────────
B_EMAIL = "laureles.barrio@example.com"
b_uid = upsert_usuario(B_EMAIL, PW_REALTOR, "Bruno Barrio (Laureles)", "agente")
b_agency = ensure_agency("Bruno Barrio (independiente)")
b_agent = ensure_agent(b_uid, B_EMAIL, "Bruno Barrio (Laureles)", "3002200022")
ensure_member(b_agency, b_agent)
b_sid, b_cleared = ensure_sponsorship(b_agency, "barrio", BARRIO_LAURELES, PRECIO_BARRIO)
b_n = assign_listings("seed-laureles-barrio", b_agency, b_agent, "s.barrio_id = %s", (int(BARRIO_LAURELES),))

# ── 3) Suscriptor normal (pro, sin agent) ────────────────────────────────────
S_EMAIL = "suscriptor.laureles@example.com"
s_uid = upsert_usuario(S_EMAIL, PW_SUB, "Sofía Suscriptora", "pro")

conn.commit()
conn.close()

print("OK seed Laureles (DEV):")
print(f"  Realtor COMUNA  {A_EMAIL} / {PW_REALTOR}  sponsorship=comuna/11   listings={a_n}  (canceladas ajenas={a_cleared})")
print(f"  Realtor BARRIO  {B_EMAIL} / {PW_REALTOR}  sponsorship=barrio/270  listings={b_n}  (canceladas ajenas={b_cleared})")
print(f"  Suscriptor PRO  {S_EMAIL} / {PW_SUB}   plan=pro (agenda visitas + publica propio)")
