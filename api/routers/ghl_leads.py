"""Lead pull API para GHL — Talal conecta GHL a ESTOS endpoints (HTTP action /
workflow programado) para descubrir y traer los leads de visita calificados.

Dirección = salida por PULL: nosotros exponemos el shape, Talal lo mapea del
lado GHL. Por eso NO está bloqueado por el contrato de Talal (a diferencia de
`push_visita_to_ghl`, que sí necesita la API de Appointments) — resuelve la
pregunta abierta de §5 del contrato: "no hay forma de descubrir leads nuevos".

Auth: token estático compartido con Talal en el header `X-API-Key`, comparado
con `GHL_LEADS_TOKEN` vía `hmac.compare_digest`. Expone PII (nombre/tel/email)
→ cerrado por defecto: sin token en el entorno = 503, nunca abierto.

Base legal (Ley 1581): el comprador envió la solicitud de visita activamente
(consentimiento para ser contactado por el lead) — postura distinta al harvest
de agencias scrapeadas; aquí el titular inició el contacto.

NOTA: sin `from __future__ import annotations` a propósito — combinado con
`@limiter.limit` rompe el parsing de Body en endpoints POST (ver
feedback fastapi+slowapi body bug). Py 3.13 soporta `str | None` nativo igual.
"""
import hmac
import os
import uuid
from datetime import datetime

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel

from api.db import get_pool
from api.limiter import client_ip, limiter
# Ruteo por listing_url (listing propio → sponsor de zona). Reusado para el
# lead-in de GHL que SÍ trae un inmueble concreto.
from api.routers.visitas import _VISITA_ZONA_AGENT_SQL

router = APIRouter()

# estados válidos (espejo del CHECK de visita_solicitud, migr 0056)
_ESTADOS = {"pendiente", "confirmada", "realizada", "cancelada", "no_asistio"}
# Valores válidos de calificación (espejo de los Literal de VisitaRequest, visitas.py).
_INTENCION = {"vivir", "invertir"}
_PRESUPUESTO = {"<200M", "200-500M", "500-1000M", ">1000M"}
_PLAZO = {"ya", "1-3m", "3-6m", "explorando"}
_CREDITO = {"contado", "aprobado", "en_tramite", "no"}
_ZONA_NIVELES = {"barrio", "comuna"}

_LEAD_SELECT = """
    SELECT v.id::text AS id, v.created_at, v.estado,
           v.nombre, v.telefono, COALESCE(v.email, u.email) AS email,
           v.listing_url, v.fecha_visita, v.mensaje, v.agent_id::text AS agent_id,
           v.external_id,
           v.intencion, v.presupuesto, v.plazo, v.credito,
           CASE WHEN v.estado = 'pendiente'
                THEN ROUND(EXTRACT(EPOCH FROM (NOW() - v.created_at)) / 3600.0)::int
                ELSE NULL END AS horas_sin_responder
    FROM public.visita_solicitud v
    LEFT JOIN public.usuarios u ON u.id = v.usuario_id
"""

# Resuelve el realtor patrocinador por zona EXPLÍCITA — para leads de GHL que
# traen solo contacto + zona de interés (ad/form), sin un listing_url concreto.
# Misma prioridad que _VISITA_ZONA_AGENT_SQL (owner de la agencia primero,
# patrocinio más antiguo de desempate) pero keyando por (nivel, codigo) directo.
_SPONSOR_BY_ZONA_SQL = """
SELECT a.id
FROM sponsorship s
JOIN agency_member am ON am.agency_id = s.agency_id
JOIN agent a ON a.id = am.agent_id AND a.estado = 'activo'
WHERE s.estado = 'activa' AND CURRENT_DATE BETWEEN s.fecha_inicio AND s.fecha_fin
  AND s.zona_nivel = $1 AND s.zona_codigo = $2
ORDER BY CASE WHEN am.rol::text = 'owner' THEN 0 ELSE 1 END, s.fecha_inicio
LIMIT 1
"""


def _valid_tokens() -> list[str]:
    """GHL_LEADS_TOKEN admite varios valores separados por coma para rotar sin
    corte: se agrega el nuevo, Talal lo cambia en GHL, se quita el viejo."""
    raw = os.getenv("GHL_LEADS_TOKEN", "")
    return [t.strip() for t in raw.split(",") if t.strip()]


def require_ghl_token(request: Request, x_api_key: str | None = Header(default=None)) -> None:
    """Cerrado por defecto: sin GHL_LEADS_TOKEN en el entorno → 503.

    Opcional: GHL_LEADS_ALLOWED_IPS (coma) limita además por IP de origen."""
    tokens = _valid_tokens()
    if not tokens:
        raise HTTPException(status_code=503, detail="Lead API no configurada (falta GHL_LEADS_TOKEN)")
    allowed_ips = {ip.strip() for ip in os.getenv("GHL_LEADS_ALLOWED_IPS", "").split(",") if ip.strip()}
    if allowed_ips and client_ip(request) not in allowed_ips:
        raise HTTPException(status_code=403, detail="origen no permitido")
    # compare against every configured token (no early exit → constant work)
    ok = False
    for t in tokens:
        ok |= bool(x_api_key) and hmac.compare_digest(x_api_key or "", t)
    if not ok:
        raise HTTPException(status_code=401, detail="token inválido")


def _lead(r) -> dict:
    """Shape plano que Talal mapea a campos/custom fields de GHL."""
    return {
        "id": r["id"],
        "created_at": r["created_at"].isoformat(),
        "estado": r["estado"],
        "nombre": r["nombre"],
        "telefono": r["telefono"],
        "email": r["email"],
        "listing_url": r["listing_url"],          # id interno / slug / url externa / "zona:<nivel>:<codigo>"
        "fecha_visita": r["fecha_visita"].isoformat() if r["fecha_visita"] else None,
        "mensaje": r["mensaje"],
        "agent_id": r["agent_id"],                # NULL = no se pudo rutear a un realtor de zona
        "external_id": r["external_id"],          # id del lead en GHL (idempotencia), NULL si nació en MS
        # Calificación del lead (Zillow paso 2) — plano para mapear en GHL.
        "intencion": r["intencion"],              # vivir | invertir
        "presupuesto": r["presupuesto"],          # <200M | 200-500M | 500-1000M | >1000M
        "plazo": r["plazo"],                      # ya | 1-3m | 3-6m | explorando
        "credito": r["credito"],                  # contado | aprobado | en_tramite | no
        "calificado": any(r[k] for k in ("intencion", "presupuesto", "plazo", "credito")),
        "sla_horas_sin_responder": r["horas_sin_responder"],
    }


@router.get("/leads", dependencies=[Depends(require_ghl_token)])
@limiter.limit("60/minute")
async def listar_leads(
    request: Request,
    since: str | None = Query(default=None, description="ISO 8601; solo leads creados después"),
    estado: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    pool=Depends(get_pool),
):
    """Descubrimiento/polling: Talal lo llama en un workflow programado con
    `since` = el `created_at` del último lead que ya trajo.
    Con `since` el orden es ASC (el cursor avanza sin saltarse leads cuando
    hay más de `limit`); sin `since`, DESC (los más recientes primero)."""
    desde = None
    if since:
        try:
            desde = datetime.fromisoformat(since.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=400, detail="since inválido (ISO 8601)")
    if estado is not None and estado not in _ESTADOS:
        raise HTTPException(status_code=400, detail=f"estado inválido (válidos: {sorted(_ESTADOS)})")

    rows = await pool.fetch(
        _LEAD_SELECT + """
        WHERE ($1::timestamptz IS NULL OR v.created_at > $1)
          AND ($2::text IS NULL OR v.estado = $2)
        ORDER BY v.created_at """ + ("ASC" if desde else "DESC") + """
        LIMIT $3
        """,
        desde, estado, limit,
    )
    return {"count": len(rows), "leads": [_lead(r) for r in rows]}


@router.get("/leads/{visita_id}", dependencies=[Depends(require_ghl_token)])
@limiter.limit("120/minute")
async def obtener_lead(request: Request, visita_id: str, pool=Depends(get_pool)):
    """GET por ID — para re-sincronizar un lead puntual desde GHL."""
    try:
        uuid.UUID(visita_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Lead no encontrado")
    row = await pool.fetchrow(_LEAD_SELECT + " WHERE v.id = $1", visita_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Lead no encontrado")
    return _lead(row)


# ── ENTRADA: crear lead NUEVO (GHL → nosotros) ───────────────────────────────
# "Cuando llega un lead nuevo": GHL (ad / form / portal) empuja un comprador que
# aún no existe en MS. Creamos la visita_solicitud, la ruteamos al realtor de la
# zona (mismo criterio que crear_visita del sitio) y queda visible en su agenda.
# Idempotente por external_id (los workflows de GHL reintentan).
class GhlLeadNuevo(BaseModel):
    nombre: str | None = None
    telefono: str | None = None
    email: str | None = None
    # Ruteo: un inmueble concreto (listing_url) O una zona de interés
    # (zona_nivel+zona_codigo). Al menos uno es obligatorio.
    listing_url: str | None = None
    zona_nivel: str | None = None          # barrio | comuna
    zona_codigo: str | None = None         # barrio_id (barrio) o cd_comuna (comuna)
    fecha_visita: str | None = None        # ISO 8601 — agendamiento propuesto
    mensaje: str | None = None
    # Calificación (Zillow paso 2) — opcional.
    intencion: str | None = None
    presupuesto: str | None = None
    plazo: str | None = None
    credito: str | None = None
    external_id: str | None = None         # id del lead en GHL (dedup de reintentos)


@router.post("/leads", dependencies=[Depends(require_ghl_token)], status_code=201)
@limiter.limit("120/minute")
async def crear_lead(request: Request, body: GhlLeadNuevo = Body(...), pool=Depends(get_pool)):
    tiene_zona = bool(body.zona_nivel and body.zona_codigo)
    if not body.listing_url and not tiene_zona:
        raise HTTPException(status_code=400, detail="Falta listing_url o (zona_nivel + zona_codigo)")
    if body.zona_nivel is not None and body.zona_nivel not in _ZONA_NIVELES:
        raise HTTPException(status_code=400, detail=f"zona_nivel inválido (válidos: {sorted(_ZONA_NIVELES)})")
    for campo, valido in (("intencion", _INTENCION), ("presupuesto", _PRESUPUESTO),
                          ("plazo", _PLAZO), ("credito", _CREDITO)):
        val = getattr(body, campo)
        if val is not None and val not in valido:
            raise HTTPException(status_code=400, detail=f"{campo} inválido (válidos: {sorted(valido)})")
    fecha = None
    if body.fecha_visita:
        try:
            fecha = datetime.fromisoformat(body.fecha_visita.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=400, detail="fecha_visita inválida (ISO 8601)")

    async with pool.acquire() as conn:
        # Idempotencia: external_id ya visto → devolver el existente sin duplicar.
        if body.external_id:
            prev = await conn.fetchrow(_LEAD_SELECT + " WHERE v.external_id = $1", body.external_id)
            if prev is not None:
                return _lead(prev)

        # Rutear al realtor de la zona. Con listing_url: listing propio → sponsor
        # por url. Sin listing_url: sponsor por zona explícita. El listing_url que
        # guardamos para un lead zona-only es un token sintético estable.
        if body.listing_url:
            listing_url = body.listing_url
            agent_id = await conn.fetchval("SELECT agent_id FROM listing WHERE id::text = $1", body.listing_url)
            if agent_id is None:
                agent_id = await conn.fetchval(_VISITA_ZONA_AGENT_SQL, body.listing_url)
        else:
            listing_url = f"zona:{body.zona_nivel}:{body.zona_codigo}"
            agent_id = await conn.fetchval(_SPONSOR_BY_ZONA_SQL, body.zona_nivel, body.zona_codigo)

        row = await conn.fetchrow(
            """
            INSERT INTO visita_solicitud
                (listing_url, nombre, telefono, email, fecha_visita, mensaje, agent_id,
                 intencion, presupuesto, plazo, credito, external_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            ON CONFLICT (external_id) WHERE external_id IS NOT NULL DO NOTHING
            RETURNING id
            """,
            listing_url, body.nombre, body.telefono, body.email, fecha, body.mensaje, agent_id,
            body.intencion, body.presupuesto, body.plazo, body.credito, body.external_id,
        )
        # Carrera: dos reintentos concurrentes con el mismo external_id → el 2º
        # choca el unique index y DO NOTHING devuelve None; releer el existente.
        if row is None and body.external_id:
            row = await conn.fetchrow(_LEAD_SELECT + " WHERE v.external_id = $1", body.external_id)
            return _lead(row)
        full = await conn.fetchrow(_LEAD_SELECT + " WHERE v.id = $1", row["id"])
    return _lead(full)


# ── ENTRADA (GHL → nosotros) — token-authed, shape nuestro ───────────────────
# Mismo patrón que el PULL: shape nuestro, Talal mapea del lado GHL con un
# HTTP-request action. NO depende de la firma del webhook (§3b bloqueado); por
# eso NO pasa por /webhook/ghl. Cuando el comprador reagenda/cancela/confirma en
# el Calendar de GHL, GHL llama acá y reflejamos el estado en visita_solicitud.
_RESULTADOS = {"interesado", "oferta", "descartado"}


class GhlVisitaEstado(BaseModel):
    estado: str                        # pendiente|confirmada|realizada|cancelada|no_asistio
    fecha_visita: str | None = None    # ISO 8601, opcional (reagendado)
    resultado: str | None = None       # interesado|oferta|descartado (solo con 'realizada')


@router.post("/visitas/{visita_id}/estado", dependencies=[Depends(require_ghl_token)])
@limiter.limit("120/minute")
async def actualizar_estado_visita(
    request: Request,
    visita_id: str,
    body: GhlVisitaEstado = Body(...),
    pool=Depends(get_pool),
):
    """GHL empuja el estado de la cita → se refleja en visita_solicitud.
    Idempotente: reenviar el mismo estado no rompe nada."""
    try:
        uuid.UUID(visita_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Lead no encontrado")
    if body.estado not in _ESTADOS:
        raise HTTPException(status_code=400, detail=f"estado inválido (válidos: {sorted(_ESTADOS)})")
    if body.resultado is not None:
        if body.resultado not in _RESULTADOS:
            raise HTTPException(status_code=400, detail=f"resultado inválido (válidos: {sorted(_RESULTADOS)})")
        if body.estado != "realizada":
            raise HTTPException(status_code=400, detail="resultado solo aplica a 'realizada'")
    fecha = None
    if body.fecha_visita:
        try:
            fecha = datetime.fromisoformat(body.fecha_visita.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=400, detail="fecha_visita inválida (ISO 8601)")

    updated = await pool.fetchval(
        """
        UPDATE visita_solicitud
        SET estado = $2,
            fecha_visita = COALESCE($3, fecha_visita),
            resultado = COALESCE($4, resultado),
            updated_at = NOW()
        WHERE id = $1
        RETURNING id
        """,
        visita_id, body.estado, fecha, body.resultado,
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Lead no encontrado")
    row = await pool.fetchrow(_LEAD_SELECT + " WHERE v.id = $1", visita_id)
    return _lead(row)


# ── Agents (Realtor = Contact en GHL) — salida PULL + entrada estado ──────────
# Mismo patrón token-authed, shape nuestro. El push nativo agent→GHL Contact
# (ghl_client.push_agent_to_ghl) está bloqueado por el payload de /contacts de
# Talal; esto NO — GHL descubre/sincroniza por PULL y nos empuja el estado por REST.
_AGENT_ESTADOS = {"pendiente", "activo", "rechazado", "inactivo"}

_AGENT_SELECT = """
    SELECT id::text AS id, usuario_id, email, nombre, telefono, foto_url,
           estado::text AS estado, motivo_estado, bio, verificado,
           created_at, updated_at
    FROM public.agent
"""


def _agent(r) -> dict:
    """Shape plano que Talal mapea a un Contact de GHL (contact_type='agent')."""
    nombre = r["nombre"] or ""
    first, _, last = nombre.partition(" ")
    return {
        "agent_id": r["id"],                 # uuid nuestro = agent_internal_id en GHL
        "nombre": nombre or None,
        "first_name": first or None,
        "last_name": last or None,
        "email": r["email"],
        "telefono": r["telefono"],
        "estado": r["estado"],               # pendiente | activo | rechazado | inactivo
        "motivo_estado": r["motivo_estado"],
        "verificado": r["verificado"],
        "foto_url": r["foto_url"],
        "bio": r["bio"],
        "created_at": r["created_at"].isoformat(),
        "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None,
    }


@router.get("/agents", dependencies=[Depends(require_ghl_token)])
@limiter.limit("60/minute")
async def listar_agents(
    request: Request,
    since: str | None = Query(default=None, description="ISO 8601; agentes creados después"),
    estado: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    pool=Depends(get_pool),
):
    """Descubrimiento/sync de realtors para GHL (crea/actualiza el Contact allá)."""
    desde = None
    if since:
        try:
            desde = datetime.fromisoformat(since.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=400, detail="since inválido (ISO 8601)")
    if estado is not None and estado not in _AGENT_ESTADOS:
        raise HTTPException(status_code=400, detail=f"estado inválido (válidos: {sorted(_AGENT_ESTADOS)})")
    rows = await pool.fetch(
        _AGENT_SELECT + """
        WHERE ($1::timestamptz IS NULL OR created_at > $1)
          AND ($2::text IS NULL OR estado::text = $2)
        ORDER BY created_at """ + ("ASC" if desde else "DESC") + """
        LIMIT $3
        """,
        desde, estado, limit,
    )
    return {"count": len(rows), "agents": [_agent(r) for r in rows]}


@router.get("/agents/{agent_id}", dependencies=[Depends(require_ghl_token)])
@limiter.limit("120/minute")
async def obtener_agent(request: Request, agent_id: str, pool=Depends(get_pool)):
    try:
        uuid.UUID(agent_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Agente no encontrado")
    row = await pool.fetchrow(_AGENT_SELECT + " WHERE id = $1", agent_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Agente no encontrado")
    return _agent(row)


class GhlAgentEstado(BaseModel):
    estado: str                    # pendiente | activo | rechazado | inactivo
    motivo: str | None = None      # motivo_estado (ej. razón de rechazo)


@router.post("/agents/{agent_id}/estado", dependencies=[Depends(require_ghl_token)])
@limiter.limit("120/minute")
async def actualizar_estado_agent(
    request: Request,
    agent_id: str,
    body: GhlAgentEstado = Body(...),
    pool=Depends(get_pool),
):
    """GHL aprueba/rechaza/activa un realtor → se refleja en public.agent."""
    try:
        uuid.UUID(agent_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Agente no encontrado")
    if body.estado not in _AGENT_ESTADOS:
        raise HTTPException(status_code=400, detail=f"estado inválido (válidos: {sorted(_AGENT_ESTADOS)})")
    # Invariante DB (chk_agent_activo_requires_usuario): no se puede activar un
    # agente sin usuario vinculado. Chequeo antes para dar 409 claro, no un 500.
    if body.estado == "activo":
        uid = await pool.fetchval("SELECT usuario_id FROM public.agent WHERE id = $1", agent_id)
        if uid is None:
            raise HTTPException(status_code=409, detail="No se puede activar: el agente no tiene usuario vinculado")
    updated = await pool.fetchval(
        "UPDATE public.agent SET estado = $2::agent_estado, "
        "motivo_estado = COALESCE($3, motivo_estado), updated_at = NOW() "
        "WHERE id = $1 RETURNING id",
        agent_id, body.estado, body.motivo,
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Agente no encontrado")
    row = await pool.fetchrow(_AGENT_SELECT + " WHERE id = $1", agent_id)
    return _agent(row)


# ── Cierres (feed de transacciones → GHL, paso 6 cobro) — salida PULL ──────────
# Cada venta reportada por el realtor vive en el ledger propiedad_evento (lo
# escribe POST /realtor/listings/{id}/cerrar). GHL lo trae por PULL para disparar
# comisión/cobro. A diferencia de /realtor/comparables (lo ven OTROS realtors →
# oculta matrícula/agente), este feed es INTERNO de billing: incluye agent_id
# (a quién cobrar/acreditar) + matrícula (llave de la propiedad) + atribución al
# lead que originó la venta.
_CIERRE_SELECT = """
    SELECT pe.id::text AS id, pe.created_at, pe.fecha, pe.tipo_evento,
           pe.precio, pe.moneda, pe.verificado,
           pe.matricula_inmobiliaria, pe.cedula_catastral,
           pe.agent_id::text AS agent_id,
           pe.visita_solicitud_id::text AS visita_solicitud_id,
           (pe.visita_solicitud_id IS NOT NULL) AS from_lead,
           l.barrio, l.tipo_inmueble::text AS tipo_inmueble,
           l.operacion::text AS operacion, l.area_m2,
           CASE WHEN l.area_m2 IS NOT NULL AND l.area_m2 > 0
                THEN ROUND(pe.precio / l.area_m2) END AS precio_m2
    FROM public.propiedad_evento pe
    LEFT JOIN public.listing l ON l.id = pe.listing_id
"""


def _num(v):
    return float(v) if v is not None else None


def _cierre(r) -> dict:
    """Shape plano para que GHL dispare el cobro (paso 6)."""
    return {
        "id": r["id"],
        "created_at": r["created_at"].isoformat(),
        "fecha": r["fecha"].isoformat() if r["fecha"] else None,
        "tipo_evento": r["tipo_evento"],               # venta
        "precio": _num(r["precio"]),
        "moneda": r["moneda"],
        "verificado": r["verificado"],                 # false = autoreportado (sin cruce SNR)
        "matricula_inmobiliaria": r["matricula_inmobiliaria"],
        "cedula_catastral": r["cedula_catastral"],
        "agent_id": r["agent_id"],                     # realtor que cerró → a quién se cobra
        "visita_solicitud_id": r["visita_solicitud_id"],
        "from_lead": r["from_lead"],                   # la venta vino de un lead de la plataforma
        "barrio": r["barrio"],
        "tipo_inmueble": r["tipo_inmueble"],
        "operacion": r["operacion"],
        "area_m2": _num(r["area_m2"]),
        "precio_m2": _num(r["precio_m2"]),
    }


@router.get("/cierres", dependencies=[Depends(require_ghl_token)])
@limiter.limit("60/minute")
async def listar_cierres(
    request: Request,
    since: str | None = Query(default=None, description="ISO 8601; cierres creados después"),
    verificado: bool | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    pool=Depends(get_pool),
):
    """Polling igual que /leads: Talal programa un workflow con `since` = el
    created_at del último cierre que trajo. Con `since`, orden ASC (cursor no se
    salta filas); sin `since`, DESC."""
    desde = None
    if since:
        try:
            desde = datetime.fromisoformat(since.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=400, detail="since inválido (ISO 8601)")
    rows = await pool.fetch(
        _CIERRE_SELECT + """
        WHERE ($1::timestamptz IS NULL OR pe.created_at > $1)
          AND ($2::boolean IS NULL OR pe.verificado = $2)
        ORDER BY pe.created_at """ + ("ASC" if desde else "DESC") + """
        LIMIT $3
        """,
        desde, verificado, limit,
    )
    return {"count": len(rows), "cierres": [_cierre(r) for r in rows]}
