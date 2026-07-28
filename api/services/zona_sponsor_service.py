"""Asignación de zonas patrocinadas (sponsorship) a agentes.

Lógica compartida por: panel admin (asignación manual) y el webhook de pago
(auto-asignación tras pago aprobado). Regla de negocio: una zona (comuna/barrio)
tiene UN patrocinador activo a la vez (exclusividad = el valor que paga el realtor).
"""
from __future__ import annotations

import uuid
from datetime import date, timedelta

PRECIO_COMUNA = 1_000_000
PRECIO_BARRIO = 200_000


class ZonaOcupadaError(Exception):
    """La zona ya tiene un patrocinador activo de otra agencia."""


def precio_zona(nivel: str, override: float | None = None) -> float:
    if override is not None:
        return override
    return PRECIO_COMUNA if nivel == "comuna" else PRECIO_BARRIO


async def get_or_create_agency(conn, agent_id: str) -> str:
    """agency del agente; si no tiene, crea una independiente (rol owner)."""
    row = await conn.fetchrow(
        "SELECT agency_id FROM agency_member WHERE agent_id = $1 ORDER BY (rol='owner') DESC LIMIT 1",
        agent_id,
    )
    if row:
        return str(row["agency_id"])
    ag = await conn.fetchrow("SELECT nombre FROM agent WHERE id = $1", agent_id)
    agency_id = str(uuid.uuid4())
    await conn.execute(
        "INSERT INTO agency (id, nombre, tipo, verificada, plan) VALUES ($1, $2, 'independiente', true, 'basico')",
        agency_id, (ag["nombre"] if ag else "Agencia") + " (independiente)",
    )
    await conn.execute(
        "INSERT INTO agency_member (agency_id, agent_id, rol) VALUES ($1, $2, 'owner')",
        agency_id, agent_id,
    )
    return agency_id


async def zona_ocupada_por_otro(conn, zona_nivel: str, zona_codigo: str, agency_id: str) -> bool:
    """True si OTRA agencia tiene la zona activa (exclusividad)."""
    return bool(await conn.fetchval(
        "SELECT 1 FROM sponsorship WHERE zona_nivel = $1 AND zona_codigo = $2 AND estado = 'activa' "
        "AND CURRENT_DATE BETWEEN fecha_inicio AND fecha_fin AND agency_id <> $3 LIMIT 1",
        zona_nivel, zona_codigo, agency_id,
    ))


async def asignar_zona(conn, agent_id: str, zona_nivel: str, zona_codigo: str,
                       meses: int = 12, precio: float | None = None) -> str:
    """Asigna (o extiende) el sponsorship de la zona a la agencia del agente.
    Idempotente por agencia: si ya la tiene activa, extiende fecha_fin. Lanza
    ZonaOcupadaError si otra agencia la tiene. Correr dentro de una transacción."""
    if zona_nivel not in ("comuna", "barrio"):
        raise ValueError("zona_nivel debe ser comuna o barrio")
    agency_id = await get_or_create_agency(conn, agent_id)
    if await zona_ocupada_por_otro(conn, zona_nivel, zona_codigo, agency_id):
        raise ZonaOcupadaError(f"{zona_nivel} {zona_codigo} ya tiene patrocinador")

    hoy = date.today()
    existente = await conn.fetchrow(
        "SELECT id, fecha_fin FROM sponsorship WHERE agency_id = $1 AND zona_nivel = $2 "
        "AND zona_codigo = $3 AND estado = 'activa' ORDER BY fecha_fin DESC LIMIT 1",
        agency_id, zona_nivel, zona_codigo,
    )
    if existente:  # renovación → extiende desde la fecha_fin vigente (o hoy si venció)
        base = max(existente["fecha_fin"], hoy)
        await conn.execute(
            "UPDATE sponsorship SET fecha_fin = $1, updated_at = NOW() WHERE id = $2",
            base + timedelta(days=30 * meses), existente["id"],
        )
        return str(existente["id"])

    sid = str(uuid.uuid4())
    await conn.execute(
        "INSERT INTO sponsorship (id, agency_id, zona_nivel, zona_codigo, tier, precio_mensual, "
        "fecha_inicio, fecha_fin, estado) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'activa')",
        sid, agency_id, zona_nivel, zona_codigo, zona_nivel,
        precio_zona(zona_nivel, precio), hoy, hoy + timedelta(days=30 * meses),
    )
    return sid


async def procesar_pago_zona(pool, agent_id: str, zona_nivel: str, zona_codigo: str, meses: int = 1) -> str:
    """Llamado por el webhook de pago APROBADO (o el confirmador simulado en dev).
    Punto único donde una zona se asigna tras pago. NUNCA asignar desde el
    redirect de 'éxito' del front (falsificable)."""
    async with pool.acquire() as conn:
        async with conn.transaction():
            return await asignar_zona(conn, agent_id, zona_nivel, zona_codigo, meses)
