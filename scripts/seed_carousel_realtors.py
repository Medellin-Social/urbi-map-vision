"""Seed LOCAL para ver el carrusel de realtors por zona (RealtorsZonaCarousel).

Crea realtors preferidos ACTIVOS en:
  - barrio EL POBLADO (barrio_id 236) → 3 realtors
  - comuna El Poblado (cd_comuna 14) → 5 realtors
Así, en /map: click en El Poblado (barrio) muestra 3; click en la comuna muestra 5;
click en un barrio hermano sin slots (p.ej. Astorga 239) cae al fallback de comuna.

Idempotente: borra el seed previo por marcador (@carousel.seed / pago_ref SEED-CAROUSEL).
Solo DEV/local — el DATABASE_URL lo inyecta el caller (localhost:5433/social).

Uso:  DATABASE_URL=... python scripts/seed_carousel_realtors.py
"""
import os

import bcrypt
import psycopg2
from dotenv import load_dotenv

load_dotenv()

MARK = "@carousel.seed"
PAGO_REF = "SEED-CAROUSEL"
AGENCIAS = ("Poblado Prime", "Aburrá Realty")

# (nombre, slug, agencia|None, zona_nivel, zona_codigo, posicion, rating, cert, anios)
REALTORS = [
    ("Camila Restrepo",   "seed-camila-restrepo",   "Poblado Prime", "barrio", "236", 1, 5, True,  8),
    ("Andrés Mejía",      "seed-andres-mejia",      None,            "barrio", "236", 2, 4, False, 3),
    ("Valentina Ochoa",   "seed-valentina-ochoa",   "Aburrá Realty", "barrio", "236", 3, 5, True,  12),
    ("Santiago Arango",   "seed-santiago-arango",   "Poblado Prime", "comuna", "14", 1, 5, True,  15),
    ("Laura Jaramillo",   "seed-laura-jaramillo",   None,            "comuna", "14", 2, 4, False, 5),
    ("Daniel Correa",     "seed-daniel-correa",     "Aburrá Realty", "comuna", "14", 3, 5, True,  9),
    ("Isabela Vélez",     "seed-isabela-velez",     None,            "comuna", "14", 4, 4, True,  6),
    ("Mateo Gómez",       "seed-mateo-gomez",       "Poblado Prime", "comuna", "14", 5, 5, False, 4),
]

conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor()

# --- limpieza del seed previo (orden: slots → agents(cascade reviews/members) → usuarios → agencies) ---
cur.execute("DELETE FROM realtor_preferido_slot WHERE pago_ref = %s", (PAGO_REF,))
cur.execute("DELETE FROM agent WHERE email LIKE %s", ("%" + MARK,))
cur.execute("DELETE FROM usuarios WHERE email LIKE %s", ("%" + MARK,))
cur.execute("DELETE FROM agency WHERE nombre = ANY(%s)", (list(AGENCIAS),))

# --- agencias ---
agency_id = {}
for nombre in AGENCIAS:
    cur.execute("INSERT INTO agency (nombre, tipo, verificada) VALUES (%s, 'agencia', TRUE) RETURNING id", (nombre,))
    agency_id[nombre] = cur.fetchone()[0]

pw = bcrypt.hashpw(b"CarouselSeed-2026", bcrypt.gensalt()).decode()

# reviewer compartido (user_id NOT NULL en agent_review)
cur.execute(
    "INSERT INTO usuarios (email, password_hash, nombre, email_verificado, activo, origen_registro) "
    "VALUES (%s, %s, %s, TRUE, TRUE, 'seed') RETURNING id",
    (f"reviewer{MARK}", pw, "Reseñas Seed"),
)
reviewer_id = cur.fetchone()[0]

for i, (nombre, slug, ag, nivel, codigo, pos, rating, cert, anios) in enumerate(REALTORS, 1):
    email = f"{slug}{MARK}"
    tel = f"300555{i:04d}"
    cur.execute(
        "INSERT INTO usuarios (email, password_hash, nombre, email_verificado, activo, origen_registro) "
        "VALUES (%s, %s, %s, TRUE, TRUE, 'seed') RETURNING id",
        (email, pw, nombre),
    )
    uid = cur.fetchone()[0]
    cur.execute(
        "INSERT INTO agent (usuario_id, email, nombre, telefono, estado, slug, certificado, anios_experiencia) "
        "VALUES (%s, %s, %s, %s, 'activo', %s, %s, %s) RETURNING id",
        (uid, email, nombre, tel, slug, cert, anios),
    )
    aid = cur.fetchone()[0]
    if ag:
        cur.execute(
            "INSERT INTO agency_member (agency_id, agent_id, rol) VALUES (%s, %s, 'agente') "
            "ON CONFLICT (agency_id, agent_id) DO NOTHING",
            (agency_id[ag], aid),
        )
    cur.execute(
        "INSERT INTO agent_review (id, agent_id, user_id, calificacion, comentario, created_at) "
        "VALUES (gen_random_uuid(), %s, %s, %s, %s, NOW())",
        (aid, reviewer_id, rating, "Excelente acompañamiento en la zona."),
    )
    cur.execute(
        "INSERT INTO realtor_preferido_slot "
        "(zona_nivel, zona_codigo, posicion, agent_id, tipo, estado, precio_mensual, fecha_inicio, fecha_fin, pago_ref) "
        "VALUES (%s, %s, %s, %s, 'pago', 'activo', 0, CURRENT_DATE, NULL, %s)",
        (nivel, codigo, pos, aid, PAGO_REF),
    )

conn.commit()

cur.execute(
    "SELECT zona_nivel, zona_codigo, count(*) FROM realtor_preferido_slot "
    "WHERE pago_ref = %s GROUP BY 1, 2 ORDER BY 1, 2",
    (PAGO_REF,),
)
rows = cur.fetchall()
conn.close()
print("OK seed carrusel:")
for n, c, cnt in rows:
    print(f"  {n:7} {c:>4} → {cnt} realtors")
print("Probar en /map: click El Poblado (barrio 236) y la comuna (cd 14, El Poblado).")
print("Barrio hermano sin slots (ej. Astorga) → fallback a comuna.")
