"""Programa de agentes (docs/Medellin-Social-Programa-Inmobiliario-ES.md).

Agente  (/api/v1/agent-program): mi-estado, checkout (link GHL por producto),
        confirmar-simulado (DEV), certificación, representación de anuncios.
Admin   (/api/v1/agent-program/admin/*): certificaciones, representaciones,
        reclamos (listing_reclamo) y leads de servicio.
Público (/api/v1/leads/servicio): "Más información" — realtor de la casa,
        property manager o administración.

Los cobros SOLO se aplican desde el webhook GHL (object_type "agent_program")
o desde confirmar-simulado en DEV. Los documentos de certificación son enlaces
privados (nunca se suben al bucket público) y no salen en endpoints públicos.
"""

import logging
import os
from typing import Literal, Optional
from urllib.parse import urlencode

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field, field_validator

from api.db import get_pool
from api.dependencies import get_current_user
from api.limiter import limiter
from api.routers.admin import _audit, _verify_admin_password, require_admin
from api.services import agent_program_service as svc

logger = logging.getLogger(__name__)
router = APIRouter()
leads_router = APIRouter()

Producto = Literal["registro", "cert_cuota", "cert_mensual", "cert_ilimitado", "anuncio"]
_LINK_ENV = {
    "registro": "GHL_LINK_REGISTRO",
    "cert_cuota": "GHL_LINK_CERT_CUOTA",
    "cert_mensual": "GHL_LINK_CERT_MENSUAL",
    "cert_ilimitado": "GHL_LINK_CERT_ILIMITADO",
    "anuncio": "GHL_LINK_ANUNCIO",
}
APP_URL = os.getenv("APP_URL", "https://medellinsocial.com")


def _simulacion_habilitada() -> bool:
    return os.getenv("ENABLE_SIMULATED_PAYMENTS", "").lower() in ("1", "true", "yes")


def _https(v: Optional[str]) -> Optional[str]:
    if v is None or not v.strip():
        return None
    v = v.strip()
    if not v.lower().startswith(("https://", "http://")) or len(v) > 600:
        raise ValueError("debe ser un enlace http(s) válido")
    return v


async def _agente(user: dict, pool, exigir_activo: bool = False) -> dict:
    row = await pool.fetchrow(
        "SELECT id::text AS id, email, nombre, estado::text AS estado, registro_pagado_at "
        "FROM agent WHERE usuario_id = $1", user.get("id"))
    if not row:
        raise HTTPException(status_code=403, detail="No eres agente")
    if exigir_activo and row["estado"] != "activo":
        raise HTTPException(status_code=403, detail="Tu cuenta de agente no está activa")
    if row["estado"] in ("rechazado", "inactivo") and not exigir_activo:
        raise HTTPException(status_code=403, detail="Tu cuenta de agente no está habilitada")
    return dict(row)


async def _resolver_listing_url(pool, listing_id: Optional[int], listing_url: Optional[str]) -> str:
    """Anuncio por id del mapa (hash md5 de la url) o por su URL original. Debe existir."""
    if listing_id is not None:
        url = await pool.fetchval(
            "SELECT url FROM staging.stg_listings_unificado "
            "WHERE ('x'||substr(md5(url),1,8))::bit(32)::int = $1 LIMIT 1", listing_id)
    elif listing_url:
        url = await pool.fetchval(
            "SELECT url FROM staging.stg_listings_unificado WHERE url = $1 LIMIT 1", listing_url.strip())
    else:
        url = None
    if not url:
        raise HTTPException(status_code=404, detail="No encontramos ese anuncio en Medellín Social")
    return url


# ── Agente ────────────────────────────────────────────────────────────────────

@router.get("/mi-estado")
async def mi_estado(user: dict = Depends(get_current_user), pool=Depends(get_pool)):
    ag = await _agente(user, pool)
    async with pool.acquire() as conn:
        out = await svc.mi_estado(conn, ag["id"])
    out["ease_exam_url"] = os.getenv("EASE_EXAM_URL") or None
    out["pagos_simulados"] = _simulacion_habilitada()
    return out


class CheckoutIn(BaseModel):
    producto: Producto
    listing_url: Optional[str] = Field(default=None, max_length=1000)


def _validar_checkout(producto: str, ag: dict, est: dict, listing_url: Optional[str]) -> None:
    """Reglas de orden del flujo (el doc: mostrar cargos solo cuando aplican)."""
    if producto == "registro":
        if est["registro_pagado_at"]:
            raise HTTPException(status_code=409, detail="Tu registro ya está pagado")
        return
    if ag["estado"] != "activo":
        raise HTTPException(status_code=403, detail="Tu cuenta de agente debe estar aprobada para este pago")
    if producto == "cert_cuota":
        if not est["certificacion"]:
            raise HTTPException(status_code=409, detail="Primero envía tu solicitud de certificación")
        if est["cert_cuota_pagada_at"]:
            raise HTTPException(status_code=409, detail="La tarifa de certificación ya está pagada")
    if producto in ("cert_mensual", "cert_ilimitado") and not est["certificacion"]:
        raise HTTPException(status_code=409, detail="Primero envía tu solicitud de certificación")
    if producto == "anuncio":
        rep = next((r for r in est["representaciones"] if r["listing_url"] == listing_url
                    and r["estado"] in ("solicitado", "aprobado")), None)
        if not rep:
            raise HTTPException(status_code=409, detail="Primero solicita la vinculación de ese anuncio")
        if rep["cobertura"] != "ninguna":
            raise HTTPException(status_code=409, detail="Ese anuncio ya tiene cobertura")


@router.post("/checkout")
async def checkout(body: CheckoutIn, user: dict = Depends(get_current_user), pool=Depends(get_pool)):
    """Link de pago (GHL → Stripe) del producto, o modo simulado si no hay link configurado."""
    try:
        svc.validar_producto(body.producto, body.listing_url)
    except svc.ProgramError as e:
        raise HTTPException(status_code=422, detail=str(e))
    ag = await _agente(user, pool)
    async with pool.acquire() as conn:
        est = await svc.mi_estado(conn, ag["id"])
    _validar_checkout(body.producto, ag, est, body.listing_url)
    p = svc.PRODUCTOS[body.producto]
    base = {"producto": body.producto, "nombre": p["nombre"], "monto_usd": p["monto_usd"],
            "recurrente": p["recurrente"], "moneda": "USD"}
    link = os.getenv(_LINK_ENV[body.producto])
    if link:
        q = {"email": ag["email"], "producto": body.producto}
        if body.listing_url:
            q["listing_url"] = body.listing_url
        return {**base, "modo": "ghl_stripe", "checkout_url": f"{link}{'&' if '?' in link else '?'}{urlencode(q)}"}
    return {**base, "modo": "simulado", "mensaje": f"Link de pago no configurado ({_LINK_ENV[body.producto]})."}


@router.post("/confirmar-simulado")
async def confirmar_simulado(body: CheckoutIn, user: dict = Depends(get_current_user), pool=Depends(get_pool)):
    """DEV: simula el pago aprobado. Requiere ENABLE_SIMULATED_PAYMENTS y que NO haya link real."""
    if os.getenv(_LINK_ENV.get(body.producto, "")) or not _simulacion_habilitada():
        raise HTTPException(status_code=403, detail="Confirmación simulada deshabilitada")
    ag = await _agente(user, pool)
    async with pool.acquire() as conn:
        est = await svc.mi_estado(conn, ag["id"])
    _validar_checkout(body.producto, ag, est, body.listing_url)
    try:
        return await svc.procesar_pago(pool, ag["id"], body.producto, None, body.listing_url, {"simulado": True})
    except svc.ProgramError as e:
        raise HTTPException(status_code=422, detail=str(e))


class CertificacionIn(BaseModel):
    anios_experiencia: int = Field(ge=0, le=80)
    n_transacciones: int = Field(ge=0, le=100000)
    descripcion: Optional[str] = Field(default=None, max_length=3000)
    documentos: list[str] = Field(default_factory=list, max_length=10)

    @field_validator("documentos")
    @classmethod
    def _docs(cls, v: list[str]) -> list[str]:
        return [u for u in (_https(x) for x in v) if u]


@router.post("/certificacion", status_code=201)
@limiter.limit("10/minute")
async def solicitar_certificacion(request: Request, body: CertificacionIn,
                                  user: dict = Depends(get_current_user), pool=Depends(get_pool)):
    ag = await _agente(user, pool, exigir_activo=True)
    import json
    async with pool.acquire() as conn:
        viva = await conn.fetchval(
            "SELECT id FROM agent_certificacion WHERE agent_id = $1::uuid "
            "AND examen_estado <> 'no_aprobado' AND revision_estado <> 'no_aprobado'", ag["id"])
        if viva:
            raise HTTPException(status_code=409, detail="Ya tienes una solicitud de certificación en curso")
        cid = await conn.fetchval(
            "INSERT INTO agent_certificacion (agent_id, anios_experiencia, n_transacciones, descripcion, documentos) "
            "VALUES ($1::uuid, $2, $3, $4, $5::jsonb) RETURNING id::text",
            ag["id"], body.anios_experiencia, body.n_transacciones, body.descripcion, json.dumps(body.documentos))
        await conn.execute(
            "UPDATE agent SET anios_experiencia = COALESCE(anios_experiencia, $2), updated_at = now() "
            "WHERE id = $1::uuid", ag["id"], body.anios_experiencia)
    try:
        from api.utils.email import ADMIN_EMAIL, _wrap, esc, send_email
        await send_email(ADMIN_EMAIL, f"Solicitud de certificación — {ag['nombre']}", _wrap(
            f"<h3>Nueva solicitud de certificación</h3><p>{esc(ag['nombre'])} ({esc(ag['email'])}) — "
            f"{body.anios_experiencia} años, {body.n_transacciones} transacciones.</p>"
            f"<p><a href='{APP_URL}/panel-x9k2'>Revisar en el panel</a></p>"))
    except Exception:
        logger.exception("aviso de certificación falló")
    return {"id": cid, "mensaje": "Solicitud recibida. Tu estado de Agente certificado aparecerá después "
                                  "de la aprobación y del cumplimiento de los requisitos aplicables."}


class EvidenciaIn(BaseModel):
    examen_evidencia_url: str

    @field_validator("examen_evidencia_url")
    @classmethod
    def _url(cls, v: str) -> str:
        u = _https(v)
        if not u:
            raise ValueError("requerido")
        return u


@router.patch("/certificacion/evidencia-examen")
async def evidencia_examen(body: EvidenciaIn, user: dict = Depends(get_current_user), pool=Depends(get_pool)):
    ag = await _agente(user, pool, exigir_activo=True)
    r = await pool.fetchval(
        "UPDATE agent_certificacion SET examen_evidencia_url = $2, examen_estado = 'enviado', updated_at = now() "
        "WHERE agent_id = $1::uuid AND examen_estado IN ('pendiente','enviado') "
        "AND revision_estado <> 'no_aprobado' RETURNING id::text", ag["id"], body.examen_evidencia_url)
    if not r:
        raise HTTPException(status_code=409, detail="No hay una solicitud de certificación esperando el examen")
    return {"id": r, "examen_estado": "enviado"}


class RepresentacionIn(BaseModel):
    listing_id: Optional[int] = None
    listing_url: Optional[str] = Field(default=None, max_length=1000)
    relacion: str = Field(min_length=3, max_length=500)  # cómo representa el inmueble


@router.post("/representacion", status_code=201)
@limiter.limit("30/minute")
async def solicitar_representacion(request: Request, body: RepresentacionIn,
                                   user: dict = Depends(get_current_user), pool=Depends(get_pool)):
    """El agente solicita aparecer como representante de un anuncio. Queda 'solicitado'
    hasta que el equipo verifique la relación (el doc: evitar reclamaciones no autorizadas)."""
    ag = await _agente(user, pool, exigir_activo=True)
    if not ag["registro_pagado_at"]:
        raise HTTPException(status_code=403, detail="Completa el pago de tu registro antes de vincular anuncios")
    url = await _resolver_listing_url(pool, body.listing_id, body.listing_url)
    async with pool.acquire() as conn:
        async with conn.transaction():
            ya = await conn.fetchval(
                "SELECT id FROM listing_representacion WHERE listing_url = $1 AND agent_id = $2::uuid "
                "AND estado IN ('solicitado','aprobado')", url, ag["id"])
            if ya:
                raise HTTPException(status_code=409, detail="Ya solicitaste este anuncio")
            rid = await conn.fetchval(
                "INSERT INTO listing_representacion (listing_url, agent_id, relacion) VALUES ($1, $2::uuid, $3) "
                "RETURNING id", url, ag["id"], body.relacion.strip())
            await svc._evento(conn, rid, "solicitud", {"relacion": body.relacion.strip()}, ag["email"])
            await svc.recalcular_coberturas(conn, ag["id"])
            cob = await conn.fetchval("SELECT cobertura FROM listing_representacion WHERE id = $1", rid)
    return {"id": str(rid), "listing_url": url, "estado": "solicitado", "cobertura": cob}


@router.delete("/representacion/{rep_id}")
async def retirar_representacion(rep_id: str, user: dict = Depends(get_current_user), pool=Depends(get_pool)):
    ag = await _agente(user, pool)
    async with pool.acquire() as conn:
        async with conn.transaction():
            rid = await conn.fetchval(
                "UPDATE listing_representacion SET estado = 'retirado', cobertura = CASE WHEN cobertura = 'pago' "
                "THEN 'pago' ELSE 'ninguna' END, updated_at = now() "
                "WHERE id = $1::uuid AND agent_id = $2::uuid AND estado IN ('solicitado','aprobado') RETURNING id",
                rep_id, ag["id"])
            if not rid:
                raise HTTPException(status_code=404, detail="Representación no encontrada")
            await svc._evento(conn, rid, "retirado", None, ag["email"])
            await svc.recalcular_coberturas(conn, ag["id"])
    return {"id": rep_id, "estado": "retirado"}


# ── Admin ─────────────────────────────────────────────────────────────────────

class PasswordIn(BaseModel):
    password: str


class ResolucionIn(BaseModel):
    campo: Literal["examen", "revision"]
    decision: Literal["aprobado", "no_aprobado", "pendiente"]
    motivo: Optional[str] = Field(default=None, max_length=1000)
    password: Optional[str] = None  # obligatorio para aprobar


@router.get("/admin/certificaciones")
async def admin_certificaciones(estado: str = Query("abiertas"), admin: dict = Depends(require_admin),
                                pool=Depends(get_pool)):
    filtro = {
        "abiertas": "c.examen_estado <> 'no_aprobado' AND c.revision_estado <> 'no_aprobado' "
                    "AND NOT (c.examen_estado = 'aprobado' AND c.revision_estado = 'aprobado')",
        "aprobadas": "c.examen_estado = 'aprobado' AND c.revision_estado = 'aprobado'",
        "no_aprobadas": "(c.examen_estado = 'no_aprobado' OR c.revision_estado = 'no_aprobado')",
    }.get(estado)
    if not filtro:
        raise HTTPException(status_code=422, detail="estado inválido")
    rows = await pool.fetch(
        f"""SELECT c.id::text, c.agent_id::text, a.nombre, a.email, a.telefono, c.anios_experiencia,
                   c.n_transacciones, c.descripcion, c.documentos::text AS documentos, c.examen_evidencia_url,
                   c.examen_estado, c.revision_estado, c.motivo, c.revisor_email, c.aprobado_at, c.created_at,
                   a.cert_cuota_pagada_at, a.cert_plan, a.cert_plan_vence, a.certificado
            FROM agent_certificacion c JOIN agent a ON a.id = c.agent_id
            WHERE {filtro} ORDER BY c.created_at ASC LIMIT 200""")
    import json
    out = []
    for r in rows:
        d = dict(r)
        d["documentos"] = json.loads(d["documentos"] or "[]")
        out.append(d)
    return out


@router.post("/admin/certificaciones/{cert_id}/resolver")
@limiter.limit("30/minute")
async def admin_resolver_certificacion(request: Request, cert_id: str, body: ResolucionIn = Body(...),
                                       admin: dict = Depends(require_admin), pool=Depends(get_pool)):
    if body.decision == "aprobado":
        await _verify_admin_password(pool, admin, body.password or "")
    if body.decision == "no_aprobado" and not (body.motivo or "").strip():
        raise HTTPException(status_code=422, detail="Indica el motivo")
    col = "examen_estado" if body.campo == "examen" else "revision_estado"
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                f"UPDATE agent_certificacion SET {col} = $2, motivo = COALESCE($3, motivo), revisor_email = $4, "
                f"updated_at = now() WHERE id = $1::uuid RETURNING agent_id::text, examen_estado, revision_estado",
                cert_id, body.decision, (body.motivo or "").strip() or None, admin["email"])
            if not row:
                raise HTTPException(status_code=404, detail="Solicitud no encontrada")
            await conn.execute(
                "UPDATE agent_certificacion SET aprobado_at = CASE WHEN examen_estado = 'aprobado' "
                "AND revision_estado = 'aprobado' THEN COALESCE(aprobado_at, now()) ELSE NULL END WHERE id = $1::uuid",
                cert_id)
            cert = await svc.recalcular_certificado(conn, row["agent_id"])
            ag = await conn.fetchrow("SELECT email, nombre FROM agent WHERE id = $1::uuid", row["agent_id"])
    await _audit(pool, admin, f"certificacion_{body.campo}_{body.decision}", "agent_certificacion", cert_id,
                 {"motivo": body.motivo}, request)
    try:
        from api.utils.email import _wrap, esc, send_email
        if body.decision == "no_aprobado":
            await send_email(ag["email"], "Tu solicitud de certificación necesita atención", _wrap(
                f"<p>Hola {esc(ag['nombre'])}, revisamos tu solicitud de certificación y no fue aprobada en este "
                f"paso ({'examen' if body.campo == 'examen' else 'revisión de trayectoria'}).</p>"
                f"<blockquote>{esc(body.motivo)}</blockquote>"
                f"<p><a href='{APP_URL}/agentes/certificacion'>Ver mi solicitud</a></p>"))
        elif row["examen_estado"] == "aprobado" and row["revision_estado"] == "aprobado":
            await send_email(ag["email"], "Tu certificación fue aprobada", _wrap(
                f"<p>Hola {esc(ag['nombre'])}, aprobaste el examen y la revisión de trayectoria. "
                + ("Tu insignia de Agente certificado ya está activa." if cert else
                   "Completa los pagos de certificación para activar tu insignia de Agente certificado.")
                + f"</p><p><a href='{APP_URL}/agentes/certificacion'>Ver mi estado</a></p>"))
    except Exception:
        logger.exception("email de certificación falló")
    return {"id": cert_id, "examen_estado": row["examen_estado"], "revision_estado": row["revision_estado"],
            "certificado": cert}


@router.get("/admin/representaciones")
async def admin_representaciones(estado: Literal["solicitado", "aprobado", "rechazado"] = "solicitado",
                                 admin: dict = Depends(require_admin), pool=Depends(get_pool)):
    rows = await pool.fetch(
        """SELECT r.id::text, r.listing_url, r.estado, r.cobertura, r.relacion, r.motivo, r.created_at,
                  r.agent_id::text, a.nombre, a.email, a.telefono,
                  (SELECT a2.nombre FROM listing_representacion r2 JOIN agent a2 ON a2.id = r2.agent_id
                   WHERE r2.listing_url = r.listing_url AND r2.estado = 'aprobado' AND r2.id <> r.id LIMIT 1)
                   AS otro_aprobado
           FROM listing_representacion r JOIN agent a ON a.id = r.agent_id
           WHERE r.estado = $1 ORDER BY r.created_at ASC LIMIT 300""", estado)
    return [dict(r) for r in rows]


class DecisionIn(BaseModel):
    decision: Literal["aprobado", "rechazado"]
    motivo: Optional[str] = Field(default=None, max_length=1000)


@router.post("/admin/representaciones/{rep_id}/resolver")
@limiter.limit("60/minute")
async def admin_resolver_representacion(request: Request, rep_id: str, body: DecisionIn = Body(...),
                                        admin: dict = Depends(require_admin), pool=Depends(get_pool)):
    if body.decision == "rechazado" and not (body.motivo or "").strip():
        raise HTTPException(status_code=422, detail="Indica el motivo")
    async with pool.acquire() as conn:
        async with conn.transaction():
            rep = await conn.fetchrow(
                "SELECT id, listing_url, agent_id::text FROM listing_representacion "
                "WHERE id = $1::uuid AND estado = 'solicitado' FOR UPDATE", rep_id)
            if not rep:
                raise HTTPException(status_code=404, detail="Solicitud no encontrada o ya resuelta")
            if body.decision == "aprobado":
                otro = await conn.fetchval(
                    "SELECT 1 FROM listing_representacion WHERE listing_url = $1 AND estado = 'aprobado'",
                    rep["listing_url"])
                if otro:
                    raise HTTPException(status_code=409, detail="Otro agente ya representa este anuncio")
            await conn.execute(
                "UPDATE listing_representacion SET estado = $2, motivo = $3, updated_at = now() WHERE id = $1",
                rep["id"], body.decision, (body.motivo or "").strip() or None)
            await svc._evento(conn, rep["id"], body.decision, {"motivo": body.motivo}, admin["email"])
            await svc.recalcular_coberturas(conn, rep["agent_id"])
    await _audit(pool, admin, f"representacion_{body.decision}", "listing_representacion", rep_id,
                 {"motivo": body.motivo}, request)
    return {"id": rep_id, "estado": body.decision}


@router.get("/admin/reclamos")
async def admin_reclamos(estado: Literal["pendiente", "verificado", "rechazado"] = "pendiente",
                         admin: dict = Depends(require_admin), pool=Depends(get_pool)):
    rows = await pool.fetch(
        """SELECT r.id::text, r.listing_url, r.fuente, r.estado, r.nombre, r.telefono, r.email,
                  r.matricula_declarada, r.mensaje, r.created_at, r.resolved_at, r.motivo_resolucion
           FROM listing_reclamo r WHERE r.estado = $1 ORDER BY r.created_at ASC LIMIT 300""", estado)
    return [dict(r) for r in rows]


class ReclamoDecisionIn(BaseModel):
    decision: Literal["verificado", "rechazado"]
    motivo: Optional[str] = Field(default=None, max_length=1000)


@router.post("/admin/reclamos/{reclamo_id}/resolver")
@limiter.limit("60/minute")
async def admin_resolver_reclamo(request: Request, reclamo_id: str, body: ReclamoDecisionIn = Body(...),
                                 admin: dict = Depends(require_admin), pool=Depends(get_pool)):
    r = await pool.fetchval(
        "UPDATE listing_reclamo SET estado = $2, resolved_at = now(), revisor_email = $3, motivo_resolucion = $4 "
        "WHERE id::text = $1 AND estado = 'pendiente' RETURNING id::text",
        reclamo_id, body.decision, admin["email"], (body.motivo or "").strip() or None)
    if not r:
        raise HTTPException(status_code=404, detail="Reclamo no encontrado o ya resuelto")
    await _audit(pool, admin, f"reclamo_{body.decision}", "listing_reclamo", reclamo_id,
                 {"motivo": body.motivo}, request)
    return {"id": r, "estado": body.decision}


@router.get("/admin/leads-servicio")
async def admin_leads_servicio(estado: Optional[str] = None, admin: dict = Depends(require_admin),
                               pool=Depends(get_pool)):
    rows = await pool.fetch(
        "SELECT id::text, tipo, nombre, email, telefono, barrio, listing_url, mensaje, estado, created_at "
        "FROM leads_servicio WHERE ($1::text IS NULL OR estado = $1) ORDER BY created_at DESC LIMIT 300", estado)
    return [dict(r) for r in rows]


class LeadEstadoIn(BaseModel):
    estado: Literal["nuevo", "contactado", "cerrado", "descartado"]


@router.put("/admin/leads-servicio/{lead_id}")
async def admin_lead_servicio_estado(request: Request, lead_id: str, body: LeadEstadoIn,
                                     admin: dict = Depends(require_admin), pool=Depends(get_pool)):
    r = await pool.fetchval(
        "UPDATE leads_servicio SET estado = $2, updated_at = now() WHERE id = $1::uuid RETURNING id::text",
        lead_id, body.estado)
    if not r:
        raise HTTPException(status_code=404, detail="Lead no encontrado")
    await _audit(pool, admin, "lead_servicio_estado", "leads_servicio", lead_id, {"estado": body.estado}, request)
    return {"id": r, "estado": body.estado}


# ── Público: "Más información" ────────────────────────────────────────────────

from api.utils.ghl_client import TIPO_LEAD_LABEL  # noqa: E402 — también lo usa sync_lead_servicio


class LeadServicioIn(BaseModel):
    tipo: Literal["realtor_casa", "property_manager", "administracion"]
    nombre: str = Field(min_length=2, max_length=120)
    email: Optional[str] = Field(default=None, max_length=200)
    telefono: Optional[str] = Field(default=None, max_length=40)
    barrio: Optional[str] = Field(default=None, max_length=120)
    listing_url: Optional[str] = Field(default=None, max_length=1000)
    mensaje: Optional[str] = Field(default=None, max_length=2000)
    consentimiento: bool

    @field_validator("email")
    @classmethod
    def _email(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not v.strip():
            return None
        v = v.strip().lower()
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("email inválido")
        return v

    @field_validator("telefono")
    @classmethod
    def _tel(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not v.strip():
            return None
        if sum(ch.isdigit() for ch in v) < 7:
            raise ValueError("teléfono inválido")
        return v.strip()


@leads_router.post("/servicio", status_code=201)
@limiter.limit("5/minute")
async def crear_lead_servicio(request: Request, body: LeadServicioIn = Body(...), pool=Depends(get_pool)):
    if not body.email and not body.telefono:
        raise HTTPException(status_code=422, detail="Indica un email o un teléfono")
    if not body.consentimiento:
        raise HTTPException(status_code=422, detail="Debes aceptar el tratamiento de datos")
    lead_id = await pool.fetchval(
        "INSERT INTO leads_servicio (tipo, nombre, email, telefono, barrio, listing_url, mensaje, consentimiento) "
        "VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id::text",
        body.tipo, body.nombre.strip(), body.email, body.telefono, (body.barrio or "").strip() or None,
        body.listing_url, (body.mensaje or "").strip() or None, body.consentimiento)
    label = TIPO_LEAD_LABEL[body.tipo]
    try:
        from api.utils.email import ADMIN_EMAIL, _wrap, esc, send_email
        await send_email(ADMIN_EMAIL, f"Más información: {label} — {body.nombre}", _wrap(
            f"<h3>Nueva solicitud: {esc(label)}</h3>"
            f"<p><b>{esc(body.nombre)}</b><br>{esc(body.email or '')} {esc(body.telefono or '')}</p>"
            f"<p>Barrio: {esc(body.barrio or '—')}<br>Anuncio: {esc(body.listing_url or '—')}</p>"
            f"<p>{esc(body.mensaje or '')}</p><p><a href='{APP_URL}/panel-x9k2'>Ver en el panel</a></p>"))
    except Exception:
        logger.exception("email lead_servicio %s falló", lead_id)
    try:
        from api.utils import ghl_client
        cid = await ghl_client.push_lead_servicio_to_ghl(lead_id, body.model_dump(), label)
        if cid:
            await pool.execute("UPDATE leads_servicio SET ghl_contact_id = $2 WHERE id = $1::uuid", lead_id, cid)
    except Exception:
        logger.exception("push_lead_servicio_to_ghl(%s) falló", lead_id)
    return {"ok": True, "id": lead_id,
            "mensaje": "Gracias. Nuestro equipo te contactará pronto para ayudarte."}
