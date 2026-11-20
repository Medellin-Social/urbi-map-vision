"""Realtor Preferido: slots por zona con rotación fija.

Reglas (Israel, 20-nov-2026):
  - 4 slots por barrio, 8 por comuna.
  - Rotación en orden fijo y repetitivo por posición (sin regla de tiempo de respuesta).
  - El precio depende de la zona (nivel A/B/C/D, tabla realtor_slot_precio; valores de ejemplo).
  - Toda zona arranca con >= 1 preferido, aunque no pague (tipo 'gratis').
  - El slot 'gratis' es un relleno: si la zona está llena y entra un pagador, lo reemplaza.

El slot SOLO se activa tras pago verificado (webhook de GHL/Stripe) o por admin;
nunca desde el redirect de "éxito" del front.
"""
from __future__ import annotations

from datetime import date, timedelta

CAPACIDAD = {"barrio": 4, "comuna": 8}
NIVEL_DEFAULT = "C"


class SlotError(Exception):
    """Error de negocio al asignar un slot (mensaje apto para el usuario)."""


def _validar_zona(zona_nivel: str) -> None:
    if zona_nivel not in CAPACIDAD:
        raise SlotError("zona_nivel debe ser 'barrio' o 'comuna'")


async def nivel_zona(conn, zona_nivel: str, zona_codigo: str) -> str:
    try:
        n = await conn.fetchval(
            "SELECT nivel FROM analytics.zonas_nivel_precio WHERE zona_nivel = $1 AND zona_codigo = $2",
            zona_nivel, zona_codigo,
        )
    except Exception:  # dbt aún no corrió en este env → nivel por defecto
        return NIVEL_DEFAULT
    return n or NIVEL_DEFAULT


async def precio_slot(conn, zona_nivel: str, zona_codigo: str) -> float:
    nivel = await nivel_zona(conn, zona_nivel, zona_codigo)
    p = await conn.fetchval(
        "SELECT precio_mensual FROM realtor_slot_precio WHERE zona_nivel = $1 AND nivel = $2",
        zona_nivel, nivel,
    )
    return float(p or 0)


async def vencer_slots(conn) -> int:
    """Marca 'vencido' los slots de pago cuya fecha_fin pasó. Idempotente."""
    r = await conn.execute(
        "UPDATE realtor_slot SET estado = 'vencido', updated_at = now() "
        "WHERE estado = 'activo' AND fecha_fin IS NOT NULL AND fecha_fin < CURRENT_DATE"
    )
    return int(r.split()[-1])


async def slots_activos(conn, zona_nivel: str, zona_codigo: str):
    return await conn.fetch(
        "SELECT id, posicion, agent_id, tipo, fecha_fin FROM realtor_slot "
        "WHERE zona_nivel = $1 AND zona_codigo = $2 AND estado = 'activo' "
        "AND (fecha_fin IS NULL OR fecha_fin >= CURRENT_DATE) ORDER BY posicion",
        zona_nivel, zona_codigo,
    )


async def asignar_slot(conn, agent_id: str, zona_nivel: str, zona_codigo: str,
                       tipo: str = "pago", meses: int = 1, pago_ref: str | None = None) -> dict:
    """Asigna o renueva un slot. Correr dentro de una transacción.
    - Renovación: si el agente ya tiene slot activo en la zona, extiende fecha_fin.
    - Si hay posición libre → la menor libre. Si no, un pagador reemplaza un slot 'gratis'.
    - Si no hay lugar → SlotError."""
    _validar_zona(zona_nivel)
    if tipo not in ("pago", "gratis"):
        raise SlotError("tipo debe ser 'pago' o 'gratis'")
    hoy = date.today()

    # Serializa asignaciones concurrentes de la misma zona (evita carreras de posición).
    await conn.execute("SELECT pg_advisory_xact_lock(hashtext($1))", f"slot:{zona_nivel}:{zona_codigo}")
    await vencer_slots(conn)

    fin = None if tipo == "gratis" else hoy + timedelta(days=30 * meses)
    precio = 0.0 if tipo == "gratis" else await precio_slot(conn, zona_nivel, zona_codigo)

    propio = await conn.fetchrow(
        "SELECT id, tipo, fecha_fin FROM realtor_slot WHERE zona_nivel = $1 AND zona_codigo = $2 "
        "AND agent_id = $3 AND estado = 'activo'", zona_nivel, zona_codigo, agent_id,
    )
    if propio:
        if tipo == "gratis":
            return {"slot_id": str(propio["id"]), "accion": "sin_cambio"}
        base = max(propio["fecha_fin"] or hoy, hoy) if propio["tipo"] == "pago" else hoy
        await conn.execute(
            "UPDATE realtor_slot SET tipo = 'pago', precio_mensual = $1, fecha_fin = $2, "
            "pago_ref = COALESCE($3, pago_ref), updated_at = now() WHERE id = $4",
            precio, base + timedelta(days=30 * meses), pago_ref, propio["id"],
        )
        return {"slot_id": str(propio["id"]), "accion": "renovado"}

    activos = await slots_activos(conn, zona_nivel, zona_codigo)
    ocupadas = {r["posicion"] for r in activos}
    libres = [p for p in range(1, CAPACIDAD[zona_nivel] + 1) if p not in ocupadas]
    if libres:
        pos = libres[0]
    else:
        gratis = [r for r in activos if r["tipo"] == "gratis"]
        if tipo != "pago" or not gratis:
            raise SlotError("La zona no tiene slots disponibles")
        pos = gratis[-1]["posicion"]
        await conn.execute("UPDATE realtor_slot SET estado = 'cancelado', updated_at = now() WHERE id = $1",
                           gratis[-1]["id"])

    sid = await conn.fetchval(
        "INSERT INTO realtor_slot (zona_nivel, zona_codigo, posicion, agent_id, tipo, precio_mensual, "
        "fecha_inicio, fecha_fin, pago_ref) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
        zona_nivel, zona_codigo, pos, agent_id, tipo, precio, hoy, fin, pago_ref,
    )
    return {"slot_id": str(sid), "accion": "asignado", "posicion": pos}


async def liberar_slot(conn, slot_id: str) -> bool:
    r = await conn.execute(
        "UPDATE realtor_slot SET estado = 'cancelado', updated_at = now() WHERE id = $1 AND estado = 'activo'",
        slot_id,
    )
    return r.endswith(" 1")


async def siguiente_realtor(conn, zona_nivel: str, zona_codigo: str):
    """Próximo preferido en la rotación (orden fijo por posición, vuelve al inicio).
    Avanza el puntero de forma atómica. None si la zona no tiene preferidos."""
    _validar_zona(zona_nivel)
    activos = await slots_activos(conn, zona_nivel, zona_codigo)
    if not activos:
        return None
    contador = await conn.fetchval(
        "INSERT INTO realtor_rotacion (zona_nivel, zona_codigo, contador) VALUES ($1, $2, 1) "
        "ON CONFLICT (zona_nivel, zona_codigo) DO UPDATE SET contador = realtor_rotacion.contador + 1 "
        "RETURNING contador - 1", zona_nivel, zona_codigo,
    )
    elegido = activos[contador % len(activos)]
    return await conn.fetchrow(
        "SELECT a.id::text AS id, a.nombre, a.foto_url, a.telefono, "
        "       ag.nombre AS agencia_nombre, rev.rating_promedio, rev.n_resenas, $1::text AS tipo "
        "FROM agent a "
        "LEFT JOIN agency_member am ON am.agent_id = a.id "
        "LEFT JOIN agency ag ON ag.id = am.agency_id "
        "LEFT JOIN LATERAL ("
        "  SELECT ROUND(AVG(calificacion)::numeric, 1)::float8 AS rating_promedio, COUNT(*)::int AS n_resenas "
        "  FROM agent_review WHERE agent_id = a.id) rev ON true "
        "WHERE a.id = $2 LIMIT 1",
        elegido["tipo"], elegido["agent_id"],
    )


async def procesar_pago_slot(pool, agent_id: str, zona_nivel: str, zona_codigo: str,
                             meses: int = 1, pago_ref: str | None = None) -> dict:
    """Punto único: webhook de pago APROBADO (GHL/Stripe) o confirmador simulado en dev."""
    async with pool.acquire() as conn:
        async with conn.transaction():
            return await asignar_slot(conn, agent_id, zona_nivel, zona_codigo, "pago", meses, pago_ref)
