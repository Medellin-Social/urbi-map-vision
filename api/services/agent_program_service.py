"""Programa de agentes: registro, certificación, planes y cobertura de anuncios.

Fuente: docs/Medellin-Social-Programa-Inmobiliario-ES.md + decisiones 2026-11-21:
  - Precios USD. Registro $25 (único) y certificación $99 (único) SE SUMAN.
  - $5 por anuncio, ÚNICO por anuncio vinculado (cubre mientras esté activo).
  - Plan certificado estándar $25/mes con 5 anuncios incluidos; ilimitado $99/mes
    (se puede elegir con cualquier número de anuncios).
  - Examen EASE externo: el agente sube evidencia, el admin marca el resultado.

Reglas duras (Parte 3 del doc):
  - Un pago NUNCA sustituye una evaluación pendiente o no aprobada:
    agent.certificado = examen aprobado AND revisión aprobada AND cuota $99 pagada
                        AND plan mensual vigente.
  - Los cobros solo se aplican desde el webhook (o el confirmador simulado en DEV),
    idempotentes por pago_ref en agent_program_pago.
"""
from __future__ import annotations

import json
import logging
import uuid

logger = logging.getLogger(__name__)

PRODUCTOS: dict[str, dict] = {
    "registro":       {"monto_usd": 25, "nombre": "Registro de agente", "recurrente": False},
    "cert_cuota":     {"monto_usd": 99, "nombre": "Certificación (tarifa única)", "recurrente": False},
    "cert_mensual":   {"monto_usd": 25, "nombre": "Plan certificado mensual (5 anuncios)", "recurrente": True},
    "cert_ilimitado": {"monto_usd": 99, "nombre": "Plan certificado ilimitado", "recurrente": True},
    "anuncio":        {"monto_usd": 5,  "nombre": "Representación de anuncio", "recurrente": False},
}
CUPOS_INCLUIDOS = 5
DIAS_PLAN = 31

# SQL reutilizable: ¿el plan mensual del agente `a` está vigente?
def plan_vigente_sql(a: str = "a") -> str:
    return f"({a}.cert_plan IS NOT NULL AND {a}.cert_plan_vence IS NOT NULL AND {a}.cert_plan_vence > now())"


class ProgramError(Exception):
    """Error de negocio (mensaje apto para el usuario)."""


def validar_producto(producto: str, listing_url: str | None = None) -> None:
    if producto not in PRODUCTOS:
        raise ProgramError(f"Producto inválido: {producto}")
    if producto == "anuncio" and not listing_url:
        raise ProgramError("El cargo por anuncio requiere el anuncio (listing_url)")


async def _evento(conn, representacion_id, accion: str, detalle: dict | None = None, actor: str | None = None):
    await conn.execute(
        "INSERT INTO listing_representacion_evento (representacion_id, accion, detalle, actor) "
        "VALUES ($1, $2, $3::jsonb, $4)",
        representacion_id, accion, json.dumps(detalle or {}), actor)


async def recalcular_certificado(conn, agent_id: str) -> bool:
    """Pone agent.certificado según las 4 condiciones. Devuelve el valor final."""
    val = await conn.fetchval(
        f"""UPDATE agent a SET certificado = (
                a.cert_cuota_pagada_at IS NOT NULL
                AND {plan_vigente_sql('a')}
                AND EXISTS (SELECT 1 FROM agent_certificacion c WHERE c.agent_id = a.id
                            AND c.examen_estado = 'aprobado' AND c.revision_estado = 'aprobado')
            ), updated_at = now()
            WHERE a.id = $1::uuid
            RETURNING certificado""",
        str(agent_id))
    return bool(val)


async def recalcular_coberturas(conn, agent_id: str) -> dict:
    """Reasigna cobertura de las representaciones vivas del agente (orden de llegada).
    'pago' ($5 único) se conserva siempre; el resto: ilimitado > incluido (5) > ninguna."""
    ag = await conn.fetchrow(
        f"SELECT cert_plan, {plan_vigente_sql('a')} AS vigente FROM agent a WHERE a.id = $1::uuid",
        str(agent_id))
    if not ag:
        return {"cambios": 0}
    plan = ag["cert_plan"] if ag["vigente"] else None
    reps = await conn.fetch(
        "SELECT id, cobertura FROM listing_representacion WHERE agent_id = $1::uuid "
        "AND estado IN ('solicitado','aprobado') ORDER BY created_at, id",
        str(agent_id))
    incluidos, cambios = 0, 0
    for r in reps:
        if r["cobertura"] == "pago":
            continue
        if plan == "ilimitado":
            nueva = "ilimitado"
        elif plan == "estandar" and incluidos < CUPOS_INCLUIDOS:
            nueva = "incluido"
            incluidos += 1
        else:
            nueva = "ninguna"
        if nueva != r["cobertura"]:
            await conn.execute(
                "UPDATE listing_representacion SET cobertura = $1, updated_at = now() WHERE id = $2",
                nueva, r["id"])
            await _evento(conn, r["id"], "cobertura", {"de": r["cobertura"], "a": nueva}, "sistema")
            cambios += 1
    return {"cambios": cambios, "incluidos": incluidos, "plan": plan}


async def _aplicar_anuncio(conn, agent_id: str, listing_url: str, pago_ref: str) -> None:
    rep = await conn.fetchrow(
        "SELECT id, cobertura FROM listing_representacion WHERE agent_id = $1::uuid AND listing_url = $2 "
        "AND estado IN ('solicitado','aprobado') LIMIT 1",
        str(agent_id), listing_url)
    if rep:
        await conn.execute(
            "UPDATE listing_representacion SET cobertura = 'pago', updated_at = now() WHERE id = $1", rep["id"])
        await _evento(conn, rep["id"], "pago_anuncio", {"pago_ref": pago_ref, "de": rep["cobertura"]}, "webhook")
    else:
        rid = await conn.fetchval(
            "INSERT INTO listing_representacion (listing_url, agent_id, estado, cobertura) "
            "VALUES ($1, $2::uuid, 'solicitado', 'pago') RETURNING id",
            listing_url, str(agent_id))
        await _evento(conn, rid, "solicitud", {"origen": "pago_anuncio", "pago_ref": pago_ref}, "webhook")


async def procesar_pago(pool, agent_id: str, producto: str, pago_ref: str | None,
                        listing_url: str | None = None, payload: dict | None = None) -> dict:
    """Punto único de cobro aprobado (webhook GHL o simulado en DEV). Idempotente por pago_ref."""
    validar_producto(producto, listing_url)
    ref = pago_ref or f"sim-{uuid.uuid4()}"
    async with pool.acquire() as conn:
        async with conn.transaction():
            nuevo = await conn.fetchval(
                "INSERT INTO agent_program_pago (pago_ref, agent_id, producto, listing_url, monto_usd, payload) "
                "VALUES ($1, $2::uuid, $3, $4, $5, $6::jsonb) ON CONFLICT (pago_ref) DO NOTHING RETURNING 1",
                ref, str(agent_id), producto, listing_url, PRODUCTOS[producto]["monto_usd"],
                json.dumps(payload or {}, default=str))
            if not nuevo:
                return {"accion": "duplicado", "pago_ref": ref}
            if producto == "registro":
                await conn.execute(
                    "UPDATE agent SET registro_pagado_at = COALESCE(registro_pagado_at, now()), updated_at = now() "
                    "WHERE id = $1::uuid", str(agent_id))
            elif producto == "cert_cuota":
                await conn.execute(
                    "UPDATE agent SET cert_cuota_pagada_at = COALESCE(cert_cuota_pagada_at, now()), "
                    "updated_at = now() WHERE id = $1::uuid", str(agent_id))
            elif producto in ("cert_mensual", "cert_ilimitado"):
                plan = "estandar" if producto == "cert_mensual" else "ilimitado"
                # Cada cobro recurrente extiende 31 días desde el vencimiento vigente (o desde hoy).
                await conn.execute(
                    f"UPDATE agent SET cert_plan = $2, "
                    f"cert_plan_vence = GREATEST(COALESCE(cert_plan_vence, now()), now()) "
                    f"+ make_interval(days => {DIAS_PLAN}), updated_at = now() WHERE id = $1::uuid",
                    str(agent_id), plan)
            elif producto == "anuncio":
                await _aplicar_anuncio(conn, agent_id, listing_url, ref)
            cob = await recalcular_coberturas(conn, agent_id)
            cert = await recalcular_certificado(conn, agent_id)
            return {"accion": "aplicado", "producto": producto, "pago_ref": ref,
                    "certificado": cert, "coberturas": cob}


async def vencer_planes(conn) -> int:
    """Cron diario: recalcula cobertura y certificado de agentes con plan (vigente o vencido).
    Devuelve cuántos agentes se revisaron."""
    ids = [str(r["id"]) for r in await conn.fetch(
        "SELECT id FROM agent WHERE cert_plan IS NOT NULL OR certificado")]
    for aid in ids:
        await recalcular_coberturas(conn, aid)
        await recalcular_certificado(conn, aid)
    return len(ids)


async def mi_estado(conn, agent_id: str) -> dict:
    """Estado completo del agente para su panel (incluye datos privados de SU solicitud)."""
    a = await conn.fetchrow(
        f"""SELECT a.id::text, a.estado::text AS estado, a.registro_pagado_at, a.cert_cuota_pagada_at,
                   a.cert_plan, a.cert_plan_vence, {plan_vigente_sql('a')} AS plan_vigente,
                   a.certificado, a.es_realtor_casa
            FROM agent a WHERE a.id = $1::uuid""", str(agent_id))
    if not a:
        raise ProgramError("Agente no encontrado")
    cert = await conn.fetchrow(
        "SELECT id::text, anios_experiencia, n_transacciones, descripcion, documentos, examen_evidencia_url, "
        "examen_estado, revision_estado, motivo, aprobado_at, created_at FROM agent_certificacion "
        "WHERE agent_id = $1::uuid ORDER BY created_at DESC LIMIT 1", str(agent_id))
    reps = await conn.fetch(
        "SELECT id::text, listing_url, estado, cobertura, motivo, created_at FROM listing_representacion "
        "WHERE agent_id = $1::uuid AND estado <> 'retirado' ORDER BY created_at DESC", str(agent_id))
    pref = await conn.fetch(
        "SELECT zona_nivel, zona_codigo, fecha_fin FROM realtor_preferido_slot WHERE agent_id = $1::uuid "
        "AND tipo = 'pago' AND estado = 'activo' AND (fecha_fin IS NULL OR fecha_fin >= CURRENT_DATE)",
        str(agent_id))
    d = dict(a)
    usados = sum(1 for r in reps if r["cobertura"] == "incluido")
    sin_cobertura = sum(1 for r in reps if r["cobertura"] == "ninguna" and r["estado"] in ("solicitado", "aprobado"))
    certd = dict(cert) if cert else None
    if certd and isinstance(certd.get("documentos"), str):
        try:
            certd["documentos"] = json.loads(certd["documentos"])
        except Exception:
            certd["documentos"] = []
    return {
        **d,
        "registrado": d["estado"] == "activo" and d["registro_pagado_at"] is not None,
        "certificacion": certd,
        "representaciones": [dict(r) for r in reps],
        "cupos_incluidos": CUPOS_INCLUIDOS,
        "cupos_usados": usados,
        "anuncios_sin_cobertura": sin_cobertura,
        "preferente": [dict(r) for r in pref],
        "precios_usd": {k: v["monto_usd"] for k, v in PRODUCTOS.items()},
    }
