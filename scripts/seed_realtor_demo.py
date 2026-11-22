"""Semilla LOCAL de una cuenta de agente demo con datos para /realtor/dashboard.

SOLO DEV LOCAL. Se niega a correr si DATABASE_URL no apunta a localhost/127.0.0.1.
No es dato que la app sirva en DEV/PROD (por eso no vive en migración/cron/dbt —
ver CLAUDE.md): es una cuenta de prueba para ver el Centro de agente con contenido.

Idempotente: borra lo sembrado antes (todo cuelga de correos urbidemo.*@example.com) y lo
vuelve a crear con fechas relativas a hoy (visitas de hoy/mañana, vistas de 30d…).

    .venv/Scripts/python.exe scripts/seed_realtor_demo.py

Login (página /login del front):
    correo:      DEMO_EMAIL       (abajo)
    contraseña:  DEMO_PASSWORD    (abajo; override con env REALTOR_DEMO_PASSWORD)
"""
from __future__ import annotations

import asyncio
import json
import os
import random
import sys
from datetime import date, datetime, timedelta, timezone
from urllib.parse import urlparse

import asyncpg
import bcrypt
from dotenv import load_dotenv

# ── Credenciales de la cuenta demo (valores de PRUEBA, solo local) ───────────────
# example.com: dominio reservado para documentación (nunca entrega correo real) y que el
# validador de email del API sí acepta (.test lo rechaza). Todo lo demo empieza por "urbidemo.".
DEMO_DOMAIN = "example.com"
DEMO_PREFIX = "urbidemo."
DEMO_EMAIL = f"{DEMO_PREFIX}realtor@{DEMO_DOMAIN}"
DEMO_PASSWORD = os.environ.get("REALTOR_DEMO_PASSWORD", "UrbiDemo-Realtor-2026")

BARRIO_POBLADO = 236   # raw.barrios: EL POBLADO (Medellín)
BARRIO_LAURELES = 270  # raw.barrios: LAURELES (Medellín)

FOTOS = [  # fotos públicas de interiores (Unsplash) para las portadas
    "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=70",
    "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=70",
    "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1200&q=70",
    "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=70",
    "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=70",
]

NOW = datetime.now(timezone.utc)


def _hash(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def _guard_local(url: str) -> None:
    host = (urlparse(url).hostname or "").lower()
    if host not in {"localhost", "127.0.0.1", "::1"}:
        sys.exit(f"ABORTADO: DATABASE_URL apunta a '{host}', no a una DB local. Esta semilla es solo para dev local.")


async def _limpiar(c: asyncpg.Connection) -> None:
    pat = f"{DEMO_PREFIX}%@{DEMO_DOMAIN}"
    uids = [r["id"] for r in await c.fetch("SELECT id FROM usuarios WHERE email LIKE $1", pat)]
    agents = [r["id"] for r in await c.fetch("SELECT id FROM agent WHERE email LIKE $1", pat)]
    agencies = [r["agency_id"] for r in await c.fetch(
        "SELECT agency_id FROM agency_member WHERE agent_id = ANY($1::uuid[])", agents)]
    listings = await c.fetch("SELECT id, slug FROM listing WHERE agent_id = ANY($1::uuid[])", agents)
    keys = [str(r["id"]) for r in listings] + [r["slug"] for r in listings]

    await c.execute("DELETE FROM public.user_events WHERE entity_id = ANY($1::text[])", keys)
    await c.execute("DELETE FROM visita_solicitud WHERE agent_id = ANY($1::uuid[]) OR listing_url = ANY($2::text[])", agents, keys)
    await c.execute("DELETE FROM propiedad_evento WHERE agent_id = ANY($1::uuid[])", agents)
    await c.execute("DELETE FROM raw.favoritos_listings WHERE url = ANY($1::text[])", keys)
    await c.execute("DELETE FROM favoritos WHERE listing_uid = ANY($1::text[])", keys)
    await c.execute("DELETE FROM intake WHERE owner_id IN (SELECT id FROM owner WHERE email LIKE $1)", pat)
    await c.execute("DELETE FROM listing WHERE agent_id = ANY($1::uuid[])", agents)
    await c.execute("DELETE FROM sponsorship WHERE agency_id = ANY($1::uuid[])", agencies)
    await c.execute("DELETE FROM agency WHERE id = ANY($1::uuid[])", agencies)
    await c.execute("DELETE FROM agent WHERE id = ANY($1::uuid[])", agents)
    await c.execute("DELETE FROM owner WHERE email LIKE $1", pat)
    await c.execute("DELETE FROM usuarios WHERE id = ANY($1::int[])", uids)


async def _usuario(c, email: str, nombre: str, apellido: str, pw_hash: str) -> int:
    return await c.fetchval(
        "INSERT INTO usuarios (email, password_hash, nombre, apellido, activo, email_verificado, "
        "onboarding_completado, telefono) VALUES ($1, $2, $3, $4, TRUE, TRUE, TRUE, '3001234567') RETURNING id",
        email, pw_hash, nombre, apellido,
    )


async def _punto(c, barrio_id: int, jitter: float = 0.0):
    # Punto dentro del barrio + un pequeño desplazamiento para no apilar pines.
    return await c.fetchval(
        "SELECT ST_Translate(ST_PointOnSurface(geometry), $2, $3) FROM raw.barrios WHERE id = $1",
        barrio_id, jitter, -jitter,
    )


async def _listing(c, *, agent_id, agency_id, estado, barrio_id, barrio, titulo, tipo, operacion, precio,
                   area=None, hab=None, banos=None, parq=None, estrato=None, desc=None, admin=None,
                   amenidades=(), foto=None, dias=0, owner_id=None, matricula=None, jitter=0.0) -> str:
    geom = await _punto(c, barrio_id, jitter)
    slug = f"demo-{titulo.lower().replace(' ', '-')[:40]}-{random.randint(1000, 9999)}"
    ts = NOW - timedelta(days=dias)
    lid = await c.fetchval(
        """INSERT INTO listing (slug, agency_id, agent_id, estado, geom, municipio, barrio, operacion, precio,
               tipo_inmueble, area_m2, habitaciones, banos, parqueaderos, estrato, titulo, descripcion,
               administracion, amenidades, owner_id, matricula_inmobiliaria, verificado,
               published_at, created_at, updated_at)
           VALUES ($1,$2,$3,$4::listing_estado,$5,'Medellín',$6,$7::listing_operacion,$8,$9::listing_tipo_inmueble,
               $10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$23)
           RETURNING id::text""",
        slug, agency_id, agent_id, estado, geom, barrio, operacion, precio, tipo, area, hab, banos, parq,
        estrato, titulo, desc, admin, list(amenidades), owner_id, matricula,
        estado in ("publicado", "pausado", "cerrado"),
        ts if estado in ("publicado", "pausado", "cerrado") else None, ts,
    )
    if foto:
        await c.execute("INSERT INTO listing_media (listing_id, url, orden, es_portada) VALUES ($1::uuid, $2, 0, TRUE)", lid, foto)
    return lid


async def _vistas(c, listing_id: str, total: int, en_30d: int) -> None:
    rows = []
    for i in range(total):
        dias = random.uniform(0, 29) if i < en_30d else random.uniform(31, 120)
        rows.append((f"seed-demo-{listing_id[:8]}-{i}", "listing_view", "listing", listing_id, NOW - timedelta(days=dias)))
    await c.executemany(
        "INSERT INTO public.user_events (session_id, event_type, entity_type, entity_id, created_at) VALUES ($1,$2,$3,$4,$5::timestamptz)",
        rows,
    )


async def main() -> None:
    load_dotenv(".env")
    url = os.environ.get("DATABASE_URL", "")
    _guard_local(url)
    random.seed(42)
    c = await asyncpg.connect(url)
    try:
        async with c.transaction():
            await _limpiar(c)
            pw = _hash(DEMO_PASSWORD)
            otro_pw = _hash(os.urandom(16).hex())  # los demás usuarios demo no necesitan login

            # ── Agente + agencia + zonas patrocinadas ──────────────────────────────
            uid = await _usuario(c, DEMO_EMAIL, "Camila", "Restrepo", pw)
            agent_id = await c.fetchval(
                "INSERT INTO agent (usuario_id, email, nombre, telefono, estado, slug, bio, titulo, anios_experiencia, "
                "idiomas, especialidades) VALUES ($1,$2,'Camila Restrepo','3001234567','activo','camila-restrepo-demo',"
                "$3,'Asesora inmobiliaria',8,ARRAY['Español','Inglés'],ARRAY['venta','arriendo','inversion']) RETURNING id",
                uid, DEMO_EMAIL,
                "Asesora inmobiliaria con 8 años en El Poblado y Laureles. Acompaño a compradores e inversionistas "
                "desde la primera visita hasta la escritura.",
            )
            agency_id = await c.fetchval("INSERT INTO agency (nombre, tipo) VALUES ('Restrepo Propiedades (demo)', 'independiente') RETURNING id")
            await c.execute("INSERT INTO agency_member (agency_id, agent_id, rol) VALUES ($1, $2, 'owner')", agency_id, agent_id)
            for barrio_id, precio in ((BARRIO_POBLADO, 200_000), (BARRIO_LAURELES, 150_000)):
                await c.execute(
                    "INSERT INTO sponsorship (agency_id, zona_nivel, zona_codigo, tier, precio_mensual, fecha_inicio, fecha_fin, estado) "
                    "VALUES ($1, 'barrio', $2, 'barrio', $3, $4, $5, 'activa')",
                    agency_id, str(barrio_id), precio, date.today() - timedelta(days=45), date.today() + timedelta(days=60),
                )
            for dia, ini, fin in ((0, "09:00", "18:00"), (1, "09:00", "18:00"), (2, "09:00", "18:00"),
                                  (3, "09:00", "18:00"), (4, "09:00", "17:00"), (5, "09:00", "13:00")):
                await c.execute(
                    "INSERT INTO agent_disponibilidad (agent_id, dia_semana, hora_inicio, hora_fin) VALUES ($1,$2,$3::time,$4::time)",
                    agent_id, dia, datetime.strptime(ini, "%H:%M").time(), datetime.strptime(fin, "%H:%M").time(),
                )

            # ── Mis listings (propios), uno por estado ─────────────────────────────
            L = dict(agent_id=agent_id, agency_id=agency_id)
            l_pob = await _listing(c, **L, estado="publicado", barrio_id=BARRIO_POBLADO, barrio="El Poblado",
                titulo="Apartamento con balcón en El Poblado", tipo="apartamento", operacion="venta", precio=620_000_000,
                area=95, hab=3, banos=2, parq=1, estrato=6, admin=650_000, foto=FOTOS[0], dias=3, jitter=0.001,
                amenidades=("Balcón/terraza", "Piscina", "Gimnasio", "Portería 24h"),
                desc="Apartamento iluminado con balcón y vista a la ciudad, a dos cuadras del parque Lleras.")
            l_lau = await _listing(c, **L, estado="publicado", barrio_id=BARRIO_LAURELES, barrio="Laureles",
                titulo="Apartamento amoblado en Laureles", tipo="apartamento", operacion="arriendo", precio=3_400_000,
                area=72, hab=2, banos=2, parq=1, estrato=5, admin=380_000, foto=FOTOS[1], dias=6, jitter=0.001,
                amenidades=("Cocina integral", "Zonas verdes"), desc="Amoblado, cerca de la 70 y del estadio.")
            l_casa = await _listing(c, **L, estado="pausado", barrio_id=BARRIO_LAURELES, barrio="Laureles",
                titulo="Casa esquinera en Laureles", tipo="casa", operacion="venta", precio=890_000_000,
                area=180, hab=4, banos=3, parq=2, estrato=5, foto=FOTOS[2], dias=20, jitter=0.002,
                desc="Casa de dos pisos con patio, ideal para familia.")
            await _listing(c, **L, estado="borrador", barrio_id=BARRIO_POBLADO, barrio="El Poblado",
                titulo="Apartaestudio en Provenza", tipo="apartaestudio", operacion="arriendo", precio=2_600_000,
                area=40, hab=1, banos=1, dias=1, jitter=0.003)
            l_rech = await _listing(c, **L, estado="rechazado", barrio_id=BARRIO_POBLADO, barrio="El Poblado",
                titulo="Local comercial sobre la 10", tipo="local", operacion="arriendo", precio=7_500_000,
                area=120, foto=FOTOS[3], dias=9, jitter=0.004)
            await _listing(c, **L, estado="en_revision", barrio_id=BARRIO_POBLADO, barrio="El Poblado",
                titulo="Oficina en Milla de Oro", tipo="oficina", operacion="venta", precio=980_000_000,
                area=110, banos=2, parq=2, foto=FOTOS[4], dias=2, jitter=0.005)
            l_cerr = await _listing(c, **L, estado="cerrado", barrio_id=BARRIO_POBLADO, barrio="El Poblado",
                titulo="Apartamento en Los Balsos", tipo="apartamento", operacion="venta", precio=540_000_000,
                area=88, hab=3, banos=2, parq=1, estrato=6, foto=FOTOS[2], dias=35, matricula="001-998877",
                jitter=0.006)
            # Cierre reportado → desbloquea "Comparables de cierre" y suma al puntaje.
            await c.execute(
                "INSERT INTO propiedad_evento (matricula_inmobiliaria, listing_id, tipo_evento, precio, fecha, agent_id) "
                "VALUES ('001-998877', $1::uuid, 'venta', 525000000, $2, $3)",
                l_cerr, date.today() - timedelta(days=30), agent_id,
            )

            # Vistas (aperturas de detalle) — total / últimos 30 días.
            for lid, tot, v30 in ((l_pob, 1240, 312), (l_lau, 640, 188), (l_casa, 410, 22), (l_rech, 85, 4), (l_cerr, 930, 15)):
                await _vistas(c, lid, tot, v30)

            # ── Compradores (visitas + interesados) ────────────────────────────────
            compradores = []
            for nom, ape in (("Andrés", "Gómez"), ("Sara", "Vélez"), ("Laura", "Martínez"), ("Juan Pablo", "Ochoa"),
                             ("Daniela", "Arango"), ("Mateo", "Cardona"), ("Valeria", "Henao")):
                email = f"{DEMO_PREFIX}{nom.split()[0].lower()}.{ape.lower().replace('é', 'e')}@{DEMO_DOMAIN}"
                compradores.append((await _usuario(c, email, nom, ape, otro_pw), f"{nom} {ape}", email))

            # Favoritos: conteo por listing (raw.favoritos_listings) + "Interesados" (public.favoritos).
            for i, (cid, _, _) in enumerate(compradores):
                for lid in ([l_pob, l_lau] if i < 4 else [l_pob]) + ([l_casa] if i % 3 == 0 else []):
                    await c.execute("INSERT INTO raw.favoritos_listings (usuario_id, url, barrio_id, created_at) VALUES ($1,$2,$3,$4)",
                                    cid, lid, BARRIO_POBLADO, NOW - timedelta(days=i * 2 + 1))
                    await c.execute("INSERT INTO favoritos (usuario_id, listing_uid, tipo, created_at) VALUES ($1,$2,'listing',$3)",
                                    cid, lid, NOW - timedelta(days=i * 2 + 1))

            hoy = NOW.astimezone().replace(minute=0, second=0, microsecond=0)
            visitas = [
                # (comprador, listing, estado, resultado, fecha_visita, creada_hace_h, mensaje, calificación)
                (0, l_pob, "pendiente", None, hoy.replace(hour=10) + timedelta(days=2), 30,
                 "¿Se puede visitar el sábado en la mañana?", ("invertir", "500-1000M", "1-3m", "aprobado")),
                (4, l_lau, "pendiente", None, hoy.replace(hour=16) + timedelta(days=1), 2,
                 "Me interesa para 12 meses, ¿aceptan mascota?", ("vivir", None, "ya", None)),
                (1, l_pob, "confirmada", None, hoy.replace(hour=17), 48, None, ("vivir", "500-1000M", "3-6m", "en_tramite")),
                (5, l_lau, "confirmada", None, hoy.replace(hour=11) + timedelta(days=1), 26, "Voy con mi pareja.", (None, None, None, None)),
                (3, l_casa, "confirmada", None, hoy.replace(hour=15) + timedelta(days=3), 50, None, ("vivir", ">1000M", "1-3m", "contado")),
                (2, l_pob, "realizada", "oferta", hoy - timedelta(days=6), 200, None, ("invertir", "500-1000M", "ya", "contado")),
                (6, l_lau, "realizada", "interesado", hoy - timedelta(days=4), 150, None, (None, None, None, None)),
                (3, l_pob, "no_asistio", None, hoy - timedelta(days=9), 260, None, (None, None, None, None)),
                (5, l_casa, "cancelada", None, hoy - timedelta(days=12), 320, "Ya encontré otra opción.", (None, None, None, None)),
            ]
            for ci, lid, estado, res, fecha, hace_h, msg, (inte, pres, plazo, cred) in visitas:
                cid, nombre, email = compradores[ci]
                creada = NOW - timedelta(hours=hace_h)
                await c.execute(
                    """INSERT INTO visita_solicitud (listing_url, usuario_id, nombre, telefono, email, fecha_visita, mensaje,
                           estado, resultado, agent_id, intencion, presupuesto, plazo, credito, created_at, updated_at,
                           consentimiento, consentimiento_at)
                       VALUES ($1,$2,$3,'3101234567',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,TRUE,$14)""",
                    lid, cid, nombre, email, fecha, msg, estado, res, agent_id, inte, pres, plazo, cred, creada,
                    creada if estado == "pendiente" else creada + timedelta(hours=3),
                )

            # ── Propietarios que llegan por la zona (bandeja → Propietarios) ───────
            decl_ok = {"en_propiedad_horizontal": True, "al_dia_administracion": True, "al_dia_predial": True,
                       "tiene_hipoteca": False, "tiene_escritura": True, "servicios_al_dia": True,
                       "estado_civil": "casado", "es_persona_juridica": False}

            async def owner(nombre: str, email: str) -> str:
                ouid = await _usuario(c, email, nombre.split()[0], nombre.split()[-1], otro_pw)
                return await c.fetchval("INSERT INTO owner (usuario_id, nombre, email, telefono) VALUES ($1,$2,$3,'3157654321') RETURNING id",
                                        ouid, nombre, email)

            async def intake(owner_id, estado, *, agent=None, listing_id=None, barrio_id=BARRIO_POBLADO, barrio="El Poblado",
                             tipo="apartamento", op="venta", precio=450_000_000, area=80, hab=3, banos=2, decl=None, hace_h=3):
                ts = NOW - timedelta(hours=hace_h)
                return await c.fetchval(
                    """INSERT INTO intake (owner_id, estado, agent_id, listing_id, operacion, tipo_inmueble, geom, municipio, barrio,
                           zona_nivel, zona_codigo, precio_esperado, area_m2, habitaciones, banos, declaraciones, created_at, updated_at)
                       VALUES ($1,$2::intake_estado,$3,$4::uuid,$5::intake_operacion,$6::intake_tipo_inmueble,$7,'Medellín',$8,
                           'barrio',$9,$10,$11,$12,$13,$14::jsonb,$15,$16) RETURNING id""",
                    owner_id, estado, agent, listing_id, op, tipo, await _punto(c, barrio_id, 0.004), barrio,
                    str(barrio_id), precio, area, hab, banos, json.dumps(decl or decl_ok), ts, NOW,
                )

            # 1) Nuevo: requiere que lo aceptes.
            await intake(await owner("Lucía Fernández", f"{DEMO_PREFIX}lucia.fernandez@{DEMO_DOMAIN}"), "asignado", agent=agent_id,
                         precio=480_000_000, area=85, hace_h=5,
                         decl={**decl_ok, "al_dia_administracion": False})

            # 2) Aceptado, verificando documentos (DD a medias).
            o2 = await owner("Juan Esteban Ríos", f"{DEMO_PREFIX}juan.rios@{DEMO_DOMAIN}")
            l2 = await _listing(c, **L, estado="borrador", barrio_id=BARRIO_POBLADO, barrio="El Poblado",
                                titulo="Apartamento en El Poblado — 3 hab", tipo="apartamento", operacion="venta",
                                precio=520_000_000, area=90, hab=3, banos=2, owner_id=o2, jitter=0.007)
            i2 = await intake(o2, "aceptado", agent=agent_id, listing_id=l2, precio=520_000_000, area=90,
                              decl={**decl_ok, "tiene_hipoteca": True}, hace_h=40)
            for k, v in decl_ok.items():
                estado = "verificado" if k in ("tiene_escritura", "al_dia_predial", "servicios_al_dia", "estado_civil") else "pendiente"
                await c.execute("INSERT INTO due_diligence_item (intake_id, clave, declarado, estado) VALUES ($1,$2,$3::jsonb,$4::due_diligence_estado)",
                                i2, k, json.dumps(v), estado)

            # 3) Documentos al día pero ficha incompleta (sin foto de portada).
            o3 = await owner("Marcela Torres", f"{DEMO_PREFIX}marcela.torres@{DEMO_DOMAIN}")
            l3 = await _listing(c, **L, estado="borrador", barrio_id=BARRIO_LAURELES, barrio="Laureles",
                                titulo="Casa en Laureles con patio", tipo="casa", operacion="venta",
                                precio=760_000_000, area=160, hab=4, banos=3, owner_id=o3, jitter=0.008)
            i3 = await intake(o3, "aceptado", agent=agent_id, listing_id=l3, barrio_id=BARRIO_LAURELES, barrio="Laureles",
                              tipo="casa", precio=760_000_000, area=160, hab=4, banos=3, hace_h=96)
            for k, v in decl_ok.items():
                await c.execute("INSERT INTO due_diligence_item (intake_id, clave, declarado, estado, verificado_at) "
                                "VALUES ($1,$2,$3::jsonb,'verificado',$4)", i3, k, json.dumps(v), NOW - timedelta(days=1))

            # 4) Pool abierto (sin agente): cualquiera lo puede tomar.
            await intake(await owner("Carlos Mejía", f"{DEMO_PREFIX}carlos.mejia@{DEMO_DOMAIN}"), "en_pool",
                         barrio_id=BARRIO_LAURELES, barrio="Laureles", op="arriendo", precio=2_900_000, area=65, hab=2, banos=1, hace_h=20)

        n = await c.fetchval("SELECT count(*) FROM listing WHERE agent_id = $1", agent_id)
        print(f"OK — agente demo listo ({n} listings, {len(visitas)} visitas, 4 propietarios).")
        print(f"   correo: {DEMO_EMAIL}")
        print("   contraseña: la constante DEMO_PASSWORD de scripts/seed_realtor_demo.py")
    finally:
        await c.close()


if __name__ == "__main__":
    asyncio.run(main())
