"""GHL webhook receiver.

Regla de simetría: cada entrada es la INVERSA de una salida que ya mandamos.
Implementados: evento, tienda, listing, agent, visita (+ los 3 handlers de pago:
agent_program, sponsorship, realtor_slot). listing/evento/tienda/agent usan nombres
de campo NUESTROS (custom objects + Contact estándar); visita usa la API nativa de
Calendars/Appointments de GHL — su shape (status/startTime/endpoint) está ASUMIDO
de la doc pública, pendiente de confirmar contra un appointment real (ver marcador
ponytail en ghl_client.py y _upsert_visita_from_ghl).

referidor: entra SOLO el estado de la aplicación (aprobado/rechazado) — la
comisión/pago queda fuera por decisión ("lo de pagos no es necesario").

Sigue en 501 a propósito (pagos, excluido):
  - deal: convenio/venta con comisión → es pago; además no emitimos nada
    (push_deal_to_ghl es NotImplementedError) → nada que recibir.
El pago del agente SÍ se recibe, pero por su handler propio (`agent_program`,
`sponsorship`, `realtor_slot`): status de que pagó + qué pagó → agent_program_pago
+ agent.registro_pagado_at/cert_plan. Eso cubre "verificar que el agente pagó".

Dirección por entidad:
  - listing, deal: bidireccional (confirmado 2026-08-27) -> este router los
    recibe, ghl_client.py los envía.
  - evento, tienda: bidireccional (decisión 2026-08-28, reemplaza el "solo
    salida" de 2026-08-27 para tienda) -> la administración de eventos y
    negocios locales (destacados por alcance barrio/comuna/ciudad, migración
    0079) pasa a vivir en GHL, que va a empujar hacia nuestra API. Handlers
    todavía sin implementar acá abajo — bloqueado por el mismo motivo que
    listing/deal: falta el contrato real de Talal (firma del webhook, payload
    de ejemplo, nombres de campo). tienda ya tiene el push saliente
    implementado y funcionando (push_tienda_to_ghl) — lo que falta acá es
    solo la dirección de entrada.

Todo lo que depende del contrato real (firma del webhook, nombres de campo
del payload) está sin implementar a propósito — mejor un 501 explícito que
adivinar un mapeo de payload y fallar en silencio contra datos reales.

Nada de esto arranca en el startup ni corre nada al importar el módulo — el
crash de la migración 0081 (listing.barrio_id, revertida) fue por tocar el
arranque de la app sin red de seguridad; este router no repite ese patrón,
las excepciones solo ocurren dentro del handler de la request.

Dedup: listing.id es uuid, deals.id es integer — por eso ghl_object_mapping
(migración 0082) guarda internal_object_id como TEXT con object_type como
discriminador, en vez de una tabla de mapeo por entidad.

Loop-prevention (two-way sync): cuando este receptor sí escriba en nuestra
DB, esa escritura NO debe re-emitir un evento hacia GHL — pendiente de
diseñar cuando el contrato de Talal confirme si GHL notifica sus propios
webhooks de "outbound" o si el loop hay que cortarlo acá con un flag interno.

Necesario de Talal antes de implementar upgrade():
  - Firma del webhook (header + algoritmo) -> ghl_client.verificar_webhook
  - Payload de ejemplo real por entidad (listing/deal), para saber los
    nombres de campo exactos del lado GHL
  - Si el mismo endpoint recibe ambas entidades (con un campo tipo/object en
    el payload) o si Talal expone una URL por entidad
"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, HTTPException, Request

from api.db import get_pool
from api.limiter import limiter
from api.utils import ghl_client

import logging

logger = logging.getLogger(__name__)

router = APIRouter()


# Reverse de ghl_client._listing_campos_to_properties (mismos nombres de campo,
# §16 PDF) + inversa de los dropdowns confirmados (§5). Un valor de GHL que no
# esté en el reverse se descarta (mismo criterio que _map_choice en el outbound:
# no corromper la columna con un label desconocido).
_OPERACION_FROM_GHL = {"sale": "venta", "rent": "arriendo"}
_TIPO_INMUEBLE_FROM_GHL = {"apartment": "apartamento", "house": "casa"}
_ESTADO_FROM_GHL = {"draft": "borrador", "approved": "publicado"}
_MONEDA_FROM_GHL = {"cop": "COP", "usd": "USD"}


def _num(v):
    """GHL manda números de custom object a veces como str. A número o None (None
    se descarta del UPDATE, no pisa la columna con basura)."""
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return v
    try:
        return float(v) if "." in str(v) else int(v)
    except (TypeError, ValueError):
        return None


def _listing_payload_to_row(props: dict) -> dict:
    row = {
        "direccion_aprox": props.get("property_address"),
        "titulo": props.get("listing_title"),
        "estado": _ESTADO_FROM_GHL.get(str(props.get("listing_status") or "").lower()),
        "operacion": _OPERACION_FROM_GHL.get(str(props.get("operation") or "").lower()),
        "tipo_inmueble": _TIPO_INMUEBLE_FROM_GHL.get(str(props.get("property_type") or "").lower()),
        "municipio": props.get("municipality"),
        "barrio": props.get("barrio"),
        "precio": _num(props.get("price")),
        "moneda": _MONEDA_FROM_GHL.get(str(props.get("currency") or "").lower()),
        "administracion": _num(props.get("administration_hoa_fee")),
        "area_m2": _num(props.get("area_m2")),
        "area_lote_m2": _num(props.get("lot_area_m2")),
        "habitaciones": _num(props.get("bedrooms")),
        "banos": _num(props.get("bathrooms")),
        "parqueaderos": _num(props.get("parking_spaces")),
        "estrato": _num(props.get("estrato")),
        "antiguedad_anios": _num(props.get("property_age_years")),
        "descripcion": props.get("listing_description"),
        "video_url": _safe_url(props.get("video_url")),
        "tour_url": _safe_url(props.get("virtual_tour_url")),
        "amoblado": _as_bool(props.get("furnished")),
        "mascotas": _as_bool(props.get("pets_allowed")),
        "permite_airbnb": _as_bool(props.get("airbnb_allowed")),
        "nombre_contacto": props.get("contact_name"),
        "telefono": props.get("contact_phone"),
        "email_contacto": props.get("contact_email"),
        "horario_contacto": props.get("preferred_contact_hours"),
        "mostrar_exacto": _as_bool(props.get("exact_address_public")),
        # NO entran por webhook aunque SÍ los mandamos (asimetría deliberada):
        #   - verificado: sello «Verificada» se gana con due diligence, no por
        #     editar el Contact/record en GHL.
        #   - destacado: posición Featured es una promoción PAGADA (admin/pago).
        # Aceptarlos inbound dejaría regalar sello de confianza / posición pagada
        # con una edición en el CRM, saltándose los gates. estado SÍ entra (es el
        # publicar/despublicar operativo, el bidireccional confirmado 2026-08-27).
    }
    return {k: v for k, v in row.items() if v is not None}


async def _upsert_listing_from_ghl(payload: dict) -> None:
    """Target: public.listing (uuid PK). Entrada GHL→nosotros — inversa exacta de
    ghl_client._listing_campos_to_properties (los nombres de campo del lado GHL son
    NUESTROS: custom object real_estate_listing, no un contrato opaco de Talal).

    SOLO update: los listings nacen en la plataforma (owner/realtor publica); GHL
    los edita, no los origina → sin INSERT (evita adivinar FKs NOT NULL: owner_id,
    geom, slug…). Identidad: website_listing_id (uuid que mandamos en el outbound)
    o, si no viene, ghl_object_id vía ghl_object_mapping. Update parcial: None se
    descarta, no pisa columnas que el payload no trae. Loop-prevention: NO llama
    sync_listing (entrada no re-emite salida)."""
    props = payload.get("properties") or payload
    ghl_object_id = payload.get("ghl_object_id") or props.get("ghl_object_id") or payload.get("id")
    website_listing_id = props.get("website_listing_id") or payload.get("website_listing_id")

    pool = get_pool()
    internal_id = str(website_listing_id) if website_listing_id else None
    if not internal_id and ghl_object_id:
        internal_id = await pool.fetchval(
            "SELECT internal_object_id FROM public.ghl_object_mapping "
            "WHERE object_type = 'listing' AND ghl_object_id = $1",
            str(ghl_object_id),
        )
    if not internal_id:
        raise ValueError("listing: falta website_listing_id o mapeo de ghl_object_id")

    row = _listing_payload_to_row(props)
    if row:
        sets = [f"{col} = ${i + 1}" for i, col in enumerate(row)]
        params = list(row.values()) + [internal_id]
        updated = await pool.fetchval(
            f"UPDATE public.listing SET {', '.join(sets)}, updated_at = NOW() "
            f"WHERE id = ${len(params)}::uuid AND deleted_at IS NULL RETURNING id",
            *params,
        )
        if updated is None:
            raise ValueError(f"listing {internal_id} no existe o está borrado")
    await _link_mapping(pool, "listing", internal_id, ghl_object_id)


async def _upsert_deal_from_ghl(payload: dict) -> None:
    """Target: public.deals (integer PK, FK tienda_id/barrio_id/ciudad_id)."""
    raise NotImplementedError("ghl_webhook: falta contrato de payload para deal")


def _parse_dt(v):
    """ISO string → naive datetime (eventos.fecha_* son TIMESTAMP sin tz)."""
    if not v:
        return None
    return datetime.fromisoformat(str(v).replace("Z", "+00:00")).replace(tzinfo=None)


def _as_bool(v):
    if isinstance(v, bool):
        return v
    if v is None:
        return None
    return str(v).strip().lower() in ("yes", "true", "1")


# Reverse de ghl_client._evento_campos_to_properties — mismos nombres de campo
# (§1 del contrato). Solo mapea lo que GHL manda; None se descarta para que el
# UPDATE sea parcial (no pisa columnas que el payload no trae).
def _safe_url(v):
    """URL http(s) válida o None. GHL escribe directo a campos que se renderizan
    en páginas públicas: un javascript:/data: URL sería XSS almacenado. Si es
    inválida se descarta el campo (el resto del payload sigue), y se loguea."""
    from api.utils.urls import require_safe_url
    try:
        return require_safe_url(str(v)) if v is not None else None
    except ValueError:
        logger.warning("ghl_webhook: URL descartada por insegura: %.80r", v)
        return None


def _evento_payload_to_row(props: dict) -> dict:
    row = {
        "titulo": props.get("event_title"),
        "descripcion": props.get("event_description"),
        "categoria": props.get("category"),
        "tipo_audiencia": props.get("audience_type"),
        "fecha_inicio": _parse_dt(props.get("start_date")),
        "fecha_fin": _parse_dt(props.get("end_date")),
        "precio": props.get("price"),
        "gratuito": _as_bool(props.get("is_free")),
        "url_externo": _safe_url(props.get("external_url")),
        "foto_url": _safe_url(props.get("photo_url")),
        "organizador": props.get("organizer"),
        "max_asistentes": props.get("max_attendees"),
        "activo": _as_bool(props.get("is_active")),
        "destacado": _as_bool(props.get("is_featured")),
        "destacado_nivel": props.get("featured_scope"),
        "destacado_zona_codigo": props.get("featured_zone_code"),
        "barrio_id": int(props["website_barrio_id"]) if str(props.get("website_barrio_id") or "").isdigit() else None,
    }
    return {k: v for k, v in row.items() if v is not None}


async def _link_mapping(pool, object_type: str, internal_id, ghl_object_id) -> None:
    """Registra/actualiza la identidad internal↔GHL en ghl_object_mapping, para que
    el próximo webcall (entrada o salida) resuelva el record sin adivinar."""
    if not ghl_object_id:
        return
    await pool.execute(
        """
        INSERT INTO public.ghl_object_mapping
            (object_type, internal_object_id, ghl_object_id, ghl_location_id, sync_status, last_synced_at)
        VALUES ($1, $2, $3, $4, 'synced', now())
        ON CONFLICT (object_type, internal_object_id) DO UPDATE SET
            ghl_object_id = EXCLUDED.ghl_object_id, sync_status = 'synced', last_synced_at = now()
        """,
        object_type, str(internal_id), str(ghl_object_id), ghl_client._GHL_LOCATION_ID,
    )


async def _upsert_evento_from_ghl(payload: dict) -> None:
    """Target: public.eventos (GHL es la fuente: crea/edita/aprueba/rechaza).

    Identidad: `website_event_id` (nuestro id, que mandamos en el outbound) si GHL
    lo trae; si no, el `ghl_object_id` resuelto vía public.ghl_object_mapping; si
    tampoco, es un evento nacido en GHL → INSERT nuevo con fuente='interno'
    (bucket admin, evita migrar el CHECK de fuente) y fuente_id NULL (no tocar el
    índice UNIQUE(fuente,fuente_id) — la identidad vive en ghl_object_mapping).

    Loop-prevention: NO llama sync_evento — una escritura de entrada no debe
    re-emitir el evento hacia GHL."""
    props = payload.get("properties") or payload
    ghl_object_id = payload.get("ghl_object_id") or props.get("ghl_object_id") or payload.get("id")
    website_event_id = props.get("website_event_id") or payload.get("website_event_id")

    pool = get_pool()
    internal_id = None
    if str(website_event_id or "").isdigit():
        internal_id = int(website_event_id)
    elif ghl_object_id:
        internal_id = await pool.fetchval(
            "SELECT internal_object_id::int FROM public.ghl_object_mapping "
            "WHERE object_type = 'evento' AND ghl_object_id = $1",
            str(ghl_object_id),
        )

    row = _evento_payload_to_row(props)

    if internal_id:
        if row:
            sets = [f"{col} = ${i + 1}" for i, col in enumerate(row)]
            params = list(row.values()) + [internal_id]
            updated = await pool.fetchval(
                f"UPDATE public.eventos SET {', '.join(sets)}, updated_at = NOW() "
                f"WHERE id = ${len(params)} RETURNING id",
                *params,
            )
            if updated is None:
                raise ValueError(f"evento {internal_id} no existe")
        await _link_mapping(pool, "evento", internal_id, ghl_object_id)
        return

    # INSERT — evento nacido en GHL
    if not row.get("titulo") or not row.get("fecha_inicio"):
        raise ValueError("evento nuevo requiere event_title y start_date")
    row.setdefault("activo", False)   # nace pendiente hasta que GHL lo marque activo
    row["fuente"] = "interno"
    cols = list(row)
    placeholders = [f"${i + 1}" for i in range(len(cols))]
    new_id = await pool.fetchval(
        f"INSERT INTO public.eventos ({', '.join(cols)}) VALUES ({', '.join(placeholders)}) RETURNING id",
        *row.values(),
    )
    await _link_mapping(pool, "evento", new_id, ghl_object_id)


# Reverse de los mapeos de salida de ghl_client (_tienda_campos_to_standard +
# _tienda_campos_to_custom). §2 del contrato.
_PRICE_RANGE_FROM_GHL = {"budget": "$", "moderate": "$$", "upscale": "$$$", "luxury": "$$$$"}
# business_listing_status (Pending/Approved/Published/Rejected) → activo (§2)
_LISTING_STATUS_ACTIVE = {"approved": True, "published": True, "pending": False, "rejected": False}


def _tienda_payload_to_row(props: dict) -> dict:
    # activo: business_listing_status manda; si no viene, cae a `active`
    activo = None
    status = props.get("business_listing_status")
    if status is not None:
        activo = _LISTING_STATUS_ACTIVE.get(str(status).strip().lower())
    elif props.get("active") is not None:
        activo = _as_bool(props.get("active"))
    row = {
        "nombre": props.get("name"),
        "telefono": props.get("phone"),
        "website": _safe_url(props.get("website")),
        "direccion": props.get("address"),
        "descripcion": props.get("description"),
        "subcategoria": props.get("business_subcategory"),
        "whatsapp": props.get("whatsapp"),
        "instagram": props.get("instagram"),
        "google_place_id": props.get("google_place_id"),
        "precio_rango": _PRICE_RANGE_FROM_GHL.get(str(props.get("price_range") or "").lower()),
        "verificado": _as_bool(props.get("verified")),
        "destacado": _as_bool(props.get("featured")),
        "featured_badge": _as_bool(props.get("featured_badge")),
        "featured_desde": _parse_dt(props.get("featured_since")),
        "rating_google": props.get("google_rating"),
        "activo": activo,
        "destacado_nivel": props.get("featured_scope"),
        "destacado_zona_codigo": props.get("featured_zone_code"),
        "categoria": props.get("business_category"),
        "barrio_id": int(props["website_barrio_id"]) if str(props.get("website_barrio_id") or "").isdigit() else None,
    }
    # ponytail: `operating_hours` (jsonb horario) se omite — encoding dict→jsonb en
    # asyncpg es fiddly y es bajo valor; agregar con codec si GHL edita horarios.
    return {k: v for k, v in row.items() if v is not None}


async def _upsert_tienda_from_ghl(payload: dict) -> None:
    """Target: public.tiendas (GHL es la fuente del admin de negocios locales).

    Salida (push_tienda_to_ghl) ya existe y está wired (admin aprobar/editar →
    sync_tienda); esto es la ENTRADA. Identidad: `website_business_id` (nuestro id)
    si GHL lo trae; si no, `ghl_object_id` vía ghl_object_mapping (ese mapeo ya lo
    mantiene el push de salida); si tampoco, INSERT nuevo (negocio nacido en GHL).

    Loop-prevention: NO llama sync_tienda — entrada no re-emite salida."""
    props = payload.get("properties") or payload
    ghl_object_id = payload.get("ghl_object_id") or props.get("ghl_object_id") or payload.get("id")
    website_business_id = props.get("website_business_id") or payload.get("website_business_id")

    pool = get_pool()
    internal_id = None
    if str(website_business_id or "").isdigit():
        internal_id = int(website_business_id)
    elif ghl_object_id:
        internal_id = await pool.fetchval(
            "SELECT internal_object_id::int FROM public.ghl_object_mapping "
            "WHERE object_type = 'tienda' AND ghl_object_id = $1",
            str(ghl_object_id),
        )

    row = _tienda_payload_to_row(props)

    if internal_id:
        if row:
            sets = [f"{col} = ${i + 1}" for i, col in enumerate(row)]
            params = list(row.values()) + [internal_id]
            updated = await pool.fetchval(
                f"UPDATE public.tiendas SET {', '.join(sets)}, updated_at = NOW() "
                f"WHERE id = ${len(params)} RETURNING id",
                *params,
            )
            if updated is None:
                raise ValueError(f"tienda {internal_id} no existe")
        await _link_mapping(pool, "tienda", internal_id, ghl_object_id)
        return

    # INSERT — negocio nacido en GHL
    if not row.get("nombre"):
        raise ValueError("negocio nuevo requiere name")
    row.setdefault("activo", False)   # nace pendiente hasta aprobación
    cols = list(row)
    placeholders = [f"${i + 1}" for i in range(len(cols))]
    new_id = await pool.fetchval(
        f"INSERT INTO public.tiendas ({', '.join(cols)}) VALUES ({', '.join(placeholders)}) RETURNING id",
        *row.values(),
    )
    await _link_mapping(pool, "tienda", new_id, ghl_object_id)


# Estado de la aplicación de referido (aprobado/rechazado desde GHL). SOLO el
# estado — la comisión/`referidos` (el pago) queda fuera por decisión ("lo de
# pagos no es necesario"). ASUMIDO el nombre del campo de status del payload.
_ESTADO_FROM_GHL_REFERIDOR = {
    "approved": "aprobado", "aprobado": "aprobado",
    "rejected": "rechazado", "rechazado": "rechazado",
    "pending": "pendiente", "pendiente": "pendiente",
}


async def _upsert_referidor_from_ghl(payload: dict) -> None:
    """Target: public.aplicacion_referidor — SOLO el estado de la aplicación
    (aprobado/rechazado/pendiente) cuando el equipo la gestiona en GHL. La comisión
    (el pago al afiliado/embajador) NO entra acá a propósito.

    SOLO update: la aplicación nace en nuestros forms (/afiliados, /embajadores);
    GHL no la origina. Identidad: website_referidor_id (si lo mandamos) o email.
    Loop-prevention: NO llama sync_referidor."""
    props = payload.get("properties") or payload
    website_id = props.get("website_referidor_id") or payload.get("website_referidor_id")
    email = (props.get("email") or payload.get("email") or "").strip().lower()
    estado = _ESTADO_FROM_GHL_REFERIDOR.get(
        str(props.get("status") or props.get("application_status") or props.get("estado") or "").lower())
    if not estado:
        logger.warning("ghl_webhook referidor: status desconocido en payload — ignorado")
        return

    pool = get_pool()
    internal_id = None
    if str(website_id or "").isdigit():
        internal_id = int(website_id)
    elif email:
        internal_id = await pool.fetchval(
            "SELECT id FROM public.aplicacion_referidor WHERE lower(email) = $1 "
            "ORDER BY created_at DESC LIMIT 1", email)
    if not internal_id:
        logger.warning("ghl_webhook referidor: no resuelve (email=%s) — ignorado", email or "—")
        return

    updated = await pool.fetchval(
        "UPDATE public.aplicacion_referidor SET estado = $1 WHERE id = $2 RETURNING id",
        estado, internal_id)
    if updated is None:
        raise ValueError(f"aplicacion_referidor {internal_id} no existe")


async def _upsert_agent_from_ghl(payload: dict) -> None:
    """Target: public.agent. Agent = Contact (confirmado 2026-10-03). Entrada
    GHL→nosotros: refleja ediciones del Contact. SOLO los campos estándar que
    mandamos en upsert_contact (nombre/teléfono) — los custom fields agent_* (§4a)
    no se envían todavía, así que tampoco se reciben ("lo mismo que enviamos").

    email NO se escribe: es identidad y está ligado a usuarios — un cambio de email
    del lado GHL no debe reasignar la cuenta. SOLO update: el agente nace en el
    registro (usuario + estado); GHL no lo origina. Identidad: ghl_object_id
    (contact id) vía ghl_object_mapping, o email conocido. Loop-prevention: NO llama
    sync_agent."""
    props = payload.get("properties") or payload
    ghl_contact_id = payload.get("ghl_object_id") or props.get("ghl_object_id") or payload.get("id")
    email = (props.get("email") or payload.get("email") or "").strip().lower()
    first = (props.get("firstName") or props.get("first_name") or "").strip()
    last = (props.get("lastName") or props.get("last_name") or "").strip()
    nombre = (props.get("name") or props.get("fullName") or f"{first} {last}").strip() or None
    telefono = (props.get("phone") or "").strip() or None

    pool = get_pool()
    agent_id = None
    if ghl_contact_id:
        agent_id = await pool.fetchval(
            "SELECT internal_object_id FROM public.ghl_object_mapping "
            "WHERE object_type = 'agent' AND ghl_object_id = $1", str(ghl_contact_id))
    if not agent_id and email:
        agent_id = await pool.fetchval("SELECT id::text FROM public.agent WHERE lower(email) = $1", email)
    if not agent_id:
        raise ValueError("agent: no se pudo resolver (sin mapeo ni email conocido)")

    row = {k: v for k, v in (("nombre", nombre), ("telefono", telefono)) if v is not None}
    if row:
        sets = [f"{col} = ${i + 1}" for i, col in enumerate(row)]
        params = list(row.values()) + [agent_id]
        await pool.execute(
            f"UPDATE public.agent SET {', '.join(sets)}, updated_at = NOW() WHERE id = ${len(params)}::uuid",
            *params)
    await _link_mapping(pool, "agent", agent_id, ghl_contact_id)


# Reverse del push de visita (ghl_client._ESTADO_TO_APPT). ponytail: el shape del
# webhook de appointment (appointmentStatus/startTime/id) está ASUMIDO — confirmar
# contra un payload real (mismo marcador que en ghl_client).
_ESTADO_FROM_APPT = {
    "new": "pendiente", "confirmed": "confirmada", "showed": "realizada",
    "noshow": "no_asistio", "cancelled": "cancelada", "invalid": "cancelada",
}


def _parse_dt_tz(v):
    """ISO con offset → datetime AWARE (visita_solicitud.fecha_visita es
    timestamptz — a diferencia de eventos.fecha_* que es sin tz). Conservar el
    offset o la cita queda a la hora equivocada."""
    if not v:
        return None
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except ValueError:
        return None


async def _upsert_visita_from_ghl(payload: dict) -> None:
    """Target: public.visita_solicitud. Entrada GHL→nosotros: el comprador
    confirma/reprograma/cancela/atiende en el Calendar (appointment) → se refleja
    acá (estado + fecha_visita).

    SOLO update: los leads nacidos en GHL ya tienen su camino deduplicado
    (POST /api/v1/ghl/leads, idempotente por external_id) — NO se inserta acá para
    no duplicar ni crear filas sin ruteo. Si no resuelve a una visita conocida, se
    ignora (log). Identidad: website_visita_id → external_id → event_id vía
    ghl_object_mapping. Loop-prevention: NO llama sync_visita."""
    props = payload.get("properties") or payload
    event_id = payload.get("ghl_object_id") or props.get("ghl_object_id") or payload.get("id")
    website_visita_id = props.get("website_visita_id") or payload.get("website_visita_id")
    external_id = props.get("external_id") or payload.get("external_id")

    pool = get_pool()
    internal_id = str(website_visita_id) if website_visita_id else None
    if not internal_id and external_id:
        internal_id = await pool.fetchval(
            "SELECT id::text FROM public.visita_solicitud WHERE external_id = $1", str(external_id))
    if not internal_id and event_id:
        internal_id = await pool.fetchval(
            "SELECT internal_object_id FROM public.ghl_object_mapping "
            "WHERE object_type = 'visita' AND ghl_object_id = $1", str(event_id))
    if not internal_id:
        logger.warning("ghl_webhook visita: no resuelve (event=%s external=%s) — ignorada",
                       event_id, external_id)
        return

    row = {}
    estado = _ESTADO_FROM_APPT.get(str(props.get("appointmentStatus") or props.get("status") or "").lower())
    if estado:
        row["estado"] = estado
    fecha = _parse_dt_tz(props.get("startTime") or props.get("start_time"))
    if fecha:
        row["fecha_visita"] = fecha

    if row:
        sets = [f"{col} = ${i + 1}" for i, col in enumerate(row)]
        params = list(row.values()) + [internal_id]
        updated = await pool.fetchval(
            f"UPDATE public.visita_solicitud SET {', '.join(sets)}, updated_at = NOW() "
            f"WHERE id = ${len(params)}::uuid RETURNING id",
            *params,
        )
        if updated is None:
            raise ValueError(f"visita {internal_id} no existe")
    await _link_mapping(pool, "visita", internal_id, event_id)


async def _activar_slot_realtor_preferido(payload: dict) -> None:
    """Pago aprobado en Stripe (vía GHL) -> activa/renueva el slot de Realtor Preferido.

    Payload (workflow GHL "Pago aprobado"): {object_type:"realtor_slot", agent_email | agent_id,
    zona_nivel:"barrio"|"comuna", zona_codigo, meses (def. 1), pago_ref (id de la orden)}.
    Idempotente por pago_ref: reenviar el mismo pago no extiende dos veces."""
    from api.services.realtor_preferido_service import SlotError, procesar_pago_slot

    props = payload.get("properties") or payload
    agent_id = props.get("agent_id")
    email = (props.get("agent_email") or "").strip().lower()
    zona_nivel, zona_codigo = props.get("zona_nivel"), str(props.get("zona_codigo") or "")
    pago_ref = str(props.get("pago_ref") or "").strip()
    if not pago_ref or pago_ref == "simulado":
        # Sin pago_ref real no hay idempotencia: un reenvío extendería el slot dos veces.
        raise HTTPException(status_code=400, detail="falta pago_ref (id de la orden)")
    if not zona_codigo or (not agent_id and not email):
        raise HTTPException(status_code=400, detail="falta agent_id/agent_email o zona_codigo")
    try:
        meses = max(1, min(12, int(props.get("meses") or 1)))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="meses inválido")
    pool = get_pool()
    async with pool.acquire() as conn:
        if not agent_id:
            agent_id = await conn.fetchval(
                "SELECT id::text FROM agent WHERE lower(email) = $1 AND estado::text = 'activo'", email)
        if not agent_id:
            raise HTTPException(status_code=404, detail="agente activo no encontrado")
    try:
        await procesar_pago_slot(pool, str(agent_id), zona_nivel, zona_codigo, meses, pago_ref)
    except SlotError as e:
        # Dinero cobrado pero sin slot: requiere acción humana (reasignar o reembolsar).
        logger.error("realtor_slot PAGO SIN SLOT pago_ref=%s agent=%s zona=%s/%s: %s",
                     pago_ref, agent_id, zona_nivel, zona_codigo, e)
        raise HTTPException(status_code=409, detail=str(e))
    from api.utils import ghl_client
    ghl_client.spawn(ghl_client.sync_agent_safe(agent_id))


async def _pago_agent_program(payload: dict) -> None:
    """Pago aprobado (GHL → Stripe) de un producto del Programa de agentes.

    Payload (workflow GHL "Pago aprobado"): {object_type:"agent_program", producto:
    registro|cert_cuota|cert_mensual|cert_ilimitado|anuncio, agent_email | agent_id,
    pago_ref (id de la orden/factura — distinto en cada cobro recurrente), listing_url?}.
    Idempotente por pago_ref."""
    from api.services.agent_program_service import ProgramError, procesar_pago

    props = payload.get("properties") or payload
    pool = get_pool()
    agent_id = props.get("agent_id")
    email = (props.get("agent_email") or "").strip().lower()
    producto = (props.get("producto") or "").strip()
    pago_ref = (props.get("pago_ref") or "").strip()
    listing_url = (props.get("listing_url") or "").strip() or None
    if not producto or not pago_ref or (not agent_id and not email):
        raise HTTPException(status_code=400, detail="falta producto, pago_ref o agent_id/agent_email")
    async with pool.acquire() as conn:
        if not agent_id:
            # registro se paga antes de la aprobación: aceptar pendiente/activo
            agent_id = await conn.fetchval(
                "SELECT id::text FROM agent WHERE lower(email) = $1 AND estado::text IN ('pendiente','activo')",
                email)
        if not agent_id:
            raise HTTPException(status_code=404, detail="agente no encontrado")
    try:
        r = await procesar_pago(pool, str(agent_id), producto, pago_ref, listing_url, props)
        logger.info("agent_program pago %s %s → %s", producto, pago_ref, r.get("accion"))
    except ProgramError as e:
        logger.error("agent_program PAGO NO APLICADO pago_ref=%s agent=%s producto=%s: %s",
                     pago_ref, agent_id, producto, e)
        raise HTTPException(status_code=422, detail=str(e))


async def _pago_sponsorship(payload: dict) -> None:
    """Pago aprobado (GHL → Stripe) de una ZONA PATROCINADA exclusiva (barrio/comuna).
    Crea/extiende el `sponsorship` que rutea los leads de la zona al agente — sin admin.

    Payload (workflow GHL "Pago aprobado"): {object_type:"sponsorship", agent_email | agent_id,
    zona_nivel:"barrio"|"comuna", zona_codigo, meses (def. 1), pago_ref (id de la orden)}.
    Idempotente por pago_ref. 409 si la zona ya la tiene otra agencia (dinero cobrado
    sin zona → acción humana: reembolsar o reasignar)."""
    from api.services.zona_sponsor_service import ZonaOcupadaError, procesar_pago_zona

    props = payload.get("properties") or payload
    agent_id = props.get("agent_id")
    email = (props.get("agent_email") or "").strip().lower()
    zona_nivel, zona_codigo = props.get("zona_nivel"), str(props.get("zona_codigo") or "")
    pago_ref = str(props.get("pago_ref") or "").strip()
    if not pago_ref or pago_ref == "simulado":
        raise HTTPException(status_code=400, detail="falta pago_ref (id de la orden)")
    if zona_nivel not in ("barrio", "comuna") or not zona_codigo or (not agent_id and not email):
        raise HTTPException(status_code=400, detail="falta zona_nivel/zona_codigo o agent_id/agent_email")
    try:
        meses = max(1, min(12, int(props.get("meses") or 1)))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="meses inválido")
    pool = get_pool()
    async with pool.acquire() as conn:
        if not agent_id:
            agent_id = await conn.fetchval(
                "SELECT id::text FROM agent WHERE lower(email) = $1 AND estado::text = 'activo'", email)
        if not agent_id:
            raise HTTPException(status_code=404, detail="agente activo no encontrado")
    try:
        sid = await procesar_pago_zona(pool, str(agent_id), zona_nivel, zona_codigo, meses, pago_ref)
        logger.info("sponsorship pago %s zona=%s/%s agent=%s → %s", pago_ref, zona_nivel, zona_codigo, agent_id, sid)
    except ZonaOcupadaError as e:
        logger.error("sponsorship PAGO ZONA OCUPADA pago_ref=%s agent=%s zona=%s/%s: %s",
                     pago_ref, agent_id, zona_nivel, zona_codigo, e)
        raise HTTPException(status_code=409, detail=str(e))
    from api.utils import ghl_client
    ghl_client.spawn(ghl_client.sync_agent_safe(agent_id))


_HANDLERS = {
    "agent_program": _pago_agent_program,
    "sponsorship": _pago_sponsorship,
    "listing": _upsert_listing_from_ghl,
    "deal": _upsert_deal_from_ghl,
    "evento": _upsert_evento_from_ghl,
    "tienda": _upsert_tienda_from_ghl,
    "referidor": _upsert_referidor_from_ghl,
    "agent": _upsert_agent_from_ghl,
    "visita": _upsert_visita_from_ghl,
    "realtor_slot": _activar_slot_realtor_preferido,
}


MAX_WEBHOOK_BYTES = 1_000_000


@router.post("/ghl")
@limiter.limit("120/minute")
async def recibir_webhook_ghl(request: Request):
    # 1) Authenticate from headers alone, BEFORE touching the body.
    try:
        ghl_client.autenticar_webhook(dict(request.headers))
    except ghl_client.WebhookNotConfigured as e:
        raise HTTPException(status_code=503, detail=str(e))
    except ghl_client.WebhookAuthError:
        raise HTTPException(status_code=401, detail="firma de webhook inválida")
    # 2) Bounded read: Content-Length precheck + running byte limit while streaming.
    cl = request.headers.get("content-length")
    if cl and cl.isdigit() and int(cl) > MAX_WEBHOOK_BYTES:
        raise HTTPException(status_code=413, detail="payload demasiado grande")
    chunks: list[bytes] = []
    total = 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > MAX_WEBHOOK_BYTES:
            raise HTTPException(status_code=413, detail="payload demasiado grande")
        chunks.append(chunk)
    try:
        event = ghl_client.parsear_evento(b"".join(chunks))
    except NotImplementedError as e:
        raise HTTPException(status_code=501, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    object_type = event.get("object_type")
    handler = _HANDLERS.get(object_type)
    if handler is None:
        raise HTTPException(status_code=400, detail=f"object_type desconocido: {object_type!r}")

    try:
        await handler(event)
    except NotImplementedError as e:
        raise HTTPException(status_code=501, detail=str(e))

    return {"ok": True}
