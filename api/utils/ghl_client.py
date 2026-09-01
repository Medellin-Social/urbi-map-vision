"""GoHighLevel integration — target replacement for stripe_client.py
(decided 2026-08-23: GHL becomes the single payment gateway, both COP and USD).

STATUS: skeleton only. crear_checkout_session() and verificar_webhook() raise
NotImplementedError — do not wire /suscripciones/iniciar or a /webhook/ghl
endpoint to this until the real contract exists. Needed from Talal before
those can be filled in:
  - GHL location ID + API key (or OAuth) for this account
  - Payments/Products configured in GHL with a price per PLANES key (ver
    api/config/planes.py) — need the GHL price/product ID per plan
  - Webhook signing scheme (header name + verification method) and a real
    sample payload for a completed payment + a cancelled/failed one
  - Confirmation GHL can actually process COP/PSE/Nequi (GHL Payments runs
    on Stripe under the hood — Stripe's Colombia/local-method support is
    thin; if it can't, this isn't a full COP gateway replacement)
"""
from __future__ import annotations

import logging
import os
from decimal import Decimal
from typing import Optional

import httpx

from api.db import get_pool

logger = logging.getLogger(__name__)

_GHL_PRIVATE_TOKEN = os.getenv("GHL_PRIVATE_TOKEN")
_GHL_LOCATION_ID = os.getenv("GHL_LOCATION_ID")
GHL_WEBHOOK_SECRET = os.getenv("GHL_WEBHOOK_SECRET")

_BASE_URL = "https://services.leadconnectorhq.com"
_VERSION = "2021-07-28"
_LISTING_OBJECT_KEY = "custom_objects.real_estate_listing"


def is_configured() -> bool:
    return bool(_GHL_PRIVATE_TOKEN and _GHL_LOCATION_ID)


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {_GHL_PRIVATE_TOKEN}",
        "Version": _VERSION,
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


async def _request(method: str, path: str, **kwargs) -> httpx.Response:
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.request(method, f"{_BASE_URL}{path}", headers=_headers(), **kwargs)
    resp.raise_for_status()
    return resp


async def find_or_create_contact(usuario_id: int, email: str, nombre: str) -> Optional[str]:
    """Should return a GHL contact_id, persisted by the caller onto
    usuarios.ghl_contact_id — so the webhook can look up by that ID instead
    of matching on email. Not implemented: needs the GHL API contract."""
    raise NotImplementedError(
        "ghl_client.find_or_create_contact: needs GHL API key/location + contacts API contract from Talal"
    )


async def crear_checkout_session(
    usuario_id: int,
    email: str,
    plan: str,
    success_url: str,
    cancel_url: str,
) -> Optional[str]:
    """Returns a GHL payment/checkout URL, or None if not configured.
    Mirrors stripe_client.crear_checkout_session's shape."""
    raise NotImplementedError(
        "ghl_client.crear_checkout_session: needs GHL price/product ID per plan + Payments API contract from Talal"
    )


async def cancelar_suscripcion(ghl_subscription_id: str) -> None:
    raise NotImplementedError(
        "ghl_client.cancelar_suscripcion: needs GHL subscriptions API contract from Talal"
    )


def verificar_webhook(payload: bytes, headers: dict) -> dict:
    """Returns parsed GHL event or raises ValueError. Mirrors
    stripe_client.verificar_webhook's shape — signature scheme unknown yet."""
    if not GHL_WEBHOOK_SECRET:
        raise ValueError("GHL webhook no configurado")
    raise NotImplementedError(
        "ghl_client.verificar_webhook: needs GHL's webhook signing scheme (header + verification method) from Talal"
    )


# ── Outbound: nuestras tablas -> GHL ─────────────────────────────────────────
# Dirección por entidad (confirmado 2026-08-27):
#   - tienda, evento: SOLO salida, estas 2 son su único camino de sync.
#   - listing, deal: bidireccional — api/routers/ghl_webhook.py cubre la
#     entrada, estas 2 cubren la salida.
# Mismo objeto de mapeo (public.ghl_object_mapping, migración 0082) sirve
# para las 4, en ambas direcciones — sync_status ahí registra el resultado
# del push.
#
# Sin wire todavía a los puntos de creación reales (listings_propios.py,
# intake_service.py para listing; tiendas/eventos/deals no tienen insert vía
# API hoy, van por scraper/admin) — eso implica tocar 3+ routers y decidir
# push síncrono vs cola/retry, mejor esperar el contrato antes de comprometerse
# a un patrón de invocación.
#
# Necesario de Talal antes de implementar cualquiera de las 4:
#   - Endpoint(s) GHL para crear/actualizar cada objeto (¿custom object API,
#     uno por tipo?) + auth
#   - Nombres de campo del lado GHL para cada columna (ver
#     docs/GHL_DB_SCHEMA_FIELDS.pdf para las columnas del lado nuestro)
#   - Rate limits / si espera llamada síncrona o admite reintentos async

# Mapeo de dropdowns confirmado en el PDF (§5) — solo los valores que Talal
# probó contra la location real. Un valor de nuestro enum que no aparezca acá
# no se inventa (podría no existir como option key en GHL y corromper el
# picklist en silencio): _map_choice() lo trata como fallo de sync, no lo manda.
_OPERACION_TO_GHL = {"venta": "sale", "arriendo": "rent"}
_TIPO_INMUEBLE_TO_GHL = {"apartamento": "apartment", "casa": "house"}
_ESTADO_TO_GHL = {"borrador": "draft", "publicado": "approved"}
_MONEDA_TO_GHL = {"COP": "cop", "USD": "usd"}


def _map_choice(value, mapping: dict, campo: str) -> Optional[str]:
    if value is None:
        return None
    try:
        return mapping[value]
    except KeyError:
        raise ValueError(f"{campo}={value!r} sin mapeo confirmado a GHL (ver §5 del PDF)")


def _yes_no(value: Optional[bool]) -> Optional[str]:
    if value is None:
        return None
    return "yes" if value else "no"


def _listing_campos_to_properties(campos: dict, listing_id: str) -> dict:
    """campos usa los nombres de columna de public.listing. Mapeo §16 del PDF.

    Deliberadamente NO incluidos (falta contrato/dato limpio de nuestro lado):
      - property_category (Residential/Commercial): no está en §16, no lo
        derivamos de tipo_inmueble sin que Talal confirme el mapeo.
      - amenities: nuestro amenidades es texto libre en español, GHL espera
        option keys en inglés (elevator/security/...) — sin diccionario de
        traducción confirmado, mejor no mandar que mandar basura.
      - floor: no existe columna piso en public.listing.
      - due_diligence_declarations: declaraciones es jsonb, forma de texto
        esperada del lado GHL sin confirmar.
      - listing_source: dropdown, PDF no documenta el picklist completo (solo
        se vio "admin" en el test record de Talal) — probado en vivo 2026-08-31,
        "medellin_social_website" da 400 Bad Request ("isn't an allowed
        option"). Sin mandar hasta tener la lista real de opciones.
    """
    props: dict = {}

    def set_(key: str, value):
        if isinstance(value, Decimal):
            value = float(value)
        if value is not None:
            props[key] = value

    set_("property_address", campos.get("direccion_aprox"))
    set_("listing_title", campos.get("titulo"))
    set_("listing_status", _map_choice(campos.get("estado"), _ESTADO_TO_GHL, "estado"))
    set_("operation", _map_choice(campos.get("operacion"), _OPERACION_TO_GHL, "operacion"))
    set_("property_type", _map_choice(campos.get("tipo_inmueble"), _TIPO_INMUEBLE_TO_GHL, "tipo_inmueble"))
    set_("municipality", campos.get("municipio"))
    set_("barrio", campos.get("barrio"))
    set_("price", campos.get("precio"))
    set_("currency", _map_choice(campos.get("moneda"), _MONEDA_TO_GHL, "moneda"))
    set_("administration_hoa_fee", campos.get("administracion"))
    set_("area_m2", campos.get("area_m2"))
    set_("lot_area_m2", campos.get("area_lote_m2"))
    set_("bedrooms", campos.get("habitaciones"))
    set_("bathrooms", campos.get("banos"))
    set_("parking_spaces", campos.get("parqueaderos"))
    if campos.get("estrato") is not None:
        props["estrato"] = str(campos["estrato"])  # GHL lo devuelve como string
    set_("property_age_years", campos.get("antiguedad_anios"))
    set_("listing_description", campos.get("descripcion"))
    set_("video_url", campos.get("video_url"))
    set_("virtual_tour_url", campos.get("tour_url"))
    set_("furnished", _yes_no(campos.get("amoblado")))
    set_("pets_allowed", _yes_no(campos.get("mascotas")))
    set_("airbnb_allowed", _yes_no(campos.get("permite_airbnb")))
    set_("contact_name", campos.get("nombre_contacto"))
    set_("contact_phone", campos.get("telefono"))
    set_("contact_email", campos.get("email_contacto"))
    set_("preferred_contact_hours", campos.get("horario_contacto"))
    set_("featured", _yes_no(campos.get("destacado")))
    set_("verified", _yes_no(campos.get("verificado")))
    set_("exact_address_public", _yes_no(campos.get("mostrar_exacto")))
    props["website_listing_id"] = str(listing_id)
    return props


async def _record_sync_result(
    object_type: str, internal_id: str, ghl_id: str, status: str, error: Optional[str]
) -> None:
    pool = get_pool()
    await pool.execute(
        """
        INSERT INTO public.ghl_object_mapping
            (object_type, internal_object_id, ghl_object_id, ghl_location_id, sync_status, sync_error, last_synced_at)
        VALUES ($1, $2, $3, $4, $5, $6, now())
        ON CONFLICT (object_type, internal_object_id) DO UPDATE SET
            ghl_object_id = EXCLUDED.ghl_object_id,
            sync_status = EXCLUDED.sync_status,
            sync_error = EXCLUDED.sync_error,
            last_synced_at = now()
        """,
        object_type, str(internal_id), ghl_id, _GHL_LOCATION_ID, status, error,
    )


async def push_listing_to_ghl(listing_id: str, campos: dict) -> Optional[str]:
    """listing_id es uuid (public.listing.id). Retorna ghl_object_id o None
    si no está configurado o si el push falla (best-effort — nunca levanta
    para no romper el flujo del caller; ver guardrail #7 del blueprint)."""
    if not is_configured():
        return None

    pool = get_pool()
    existing = await pool.fetchrow(
        "SELECT ghl_object_id FROM public.ghl_object_mapping WHERE object_type = 'listing' AND internal_object_id = $1",
        str(listing_id),
    )

    try:
        properties = _listing_campos_to_properties(campos, listing_id)
    except ValueError as e:
        logger.warning("push_listing_to_ghl(%s): %s", listing_id, e)
        if existing:
            await _record_sync_result("listing", listing_id, existing["ghl_object_id"], "failed", str(e))
        return None

    try:
        if existing:
            ghl_id = existing["ghl_object_id"]
            await _request(
                "PUT",
                f"/objects/{_LISTING_OBJECT_KEY}/records/{ghl_id}",
                params={"locationId": _GHL_LOCATION_ID},
                json={"properties": properties},
            )
        else:
            resp = await _request(
                "POST",
                f"/objects/{_LISTING_OBJECT_KEY}/records",
                json={"locationId": _GHL_LOCATION_ID, "properties": properties},
            )
            ghl_id = resp.json()["record"]["id"]
    except Exception as e:
        logger.warning("push_listing_to_ghl(%s) falló: %s", listing_id, e)
        if existing:
            await _record_sync_result("listing", listing_id, existing["ghl_object_id"], "failed", str(e))
        return None

    await _record_sync_result("listing", listing_id, ghl_id, "synced", None)
    return ghl_id


_LISTING_SELECT_COLS = """
    direccion_aprox, titulo, estado::text AS estado, operacion::text AS operacion,
    tipo_inmueble::text AS tipo_inmueble, municipio, barrio, precio, moneda,
    administracion, area_m2, area_lote_m2, habitaciones, banos, parqueaderos,
    estrato, antiguedad_anios, descripcion, video_url, tour_url, amoblado,
    mascotas, permite_airbnb, nombre_contacto, telefono, email_contacto,
    horario_contacto, destacado, verificado, mostrar_exacto
"""


async def sync_listing(listing_id: str) -> Optional[str]:
    """Lee el estado actual de public.listing y lo empuja a GHL. Único punto
    que arma `campos` desde la DB — los call sites (crear/editar/cambiar
    estado, 8 sitios entre routers/services) solo llaman esto después de su
    commit, no repiten el mapeo de columnas cada uno."""
    if not is_configured():
        return None
    pool = get_pool()
    row = await pool.fetchrow(
        f"SELECT {_LISTING_SELECT_COLS} FROM public.listing WHERE id = $1", listing_id
    )
    if row is None:
        return None
    return await push_listing_to_ghl(listing_id, dict(row))


# precio_rango en tiendas usa literalmente los símbolos $/$$/$$$/$$$$ (mismo
# check constraint que el picklist de la UI de GHL) — mapeo confirmado §11.
_PRECIO_RANGO_TO_GHL = {"$": "budget", "$$": "moderate", "$$$": "upscale", "$$$$": "luxury"}
_BUSINESS_OBJECT_KEY = "business"


def _tienda_campos_to_standard(campos: dict) -> dict:
    """Campos estándar de Company, van por /businesses/ (§9), no por Objects API."""
    props: dict = {}

    def set_(key: str, value):
        if value is not None:
            props[key] = value

    set_("name", campos.get("nombre"))
    set_("phone", campos.get("telefono"))
    set_("website", campos.get("website"))
    set_("address", campos.get("direccion"))
    set_("city", campos.get("ciudad_nombre"))
    set_("description", campos.get("descripcion"))
    return props


def _tienda_campos_to_custom(campos: dict) -> dict:
    """Los 16 custom fields del Business, van por /objects/business/records/ (§10).

    Deliberadamente NO incluidos (sin picklist confirmado o sin columna fuente):
      - business_category: nuestro categoria tiene 29 valores, el PDF solo dio
        un ejemplo ("cafe", que ni siquiera está en nuestra lista) — sin el
        picklist real de Talal, mejor no mandar que mandar basura.
      - business_listing_status: no hay columna equivalente en tiendas (solo
        activo/verificado bool) — derivar el estado sería inventar lógica de
        negocio no pedida.
      - membership_plan: nuestro plan es código en minúscula
        (free/hotspot/featured), el ejemplo del PDF es texto tipo "Featured
        Business" — formato distinto, sin confirmar si hay picklist.
      - email: no existe columna email en tiendas.
    """
    props: dict = {}

    def set_(key: str, value):
        if value is not None:
            props[key] = value

    set_("business_subcategory", campos.get("subcategoria"))
    set_("barrio", campos.get("barrio_nombre"))
    set_("whatsapp", campos.get("whatsapp"))
    set_("instagram", campos.get("instagram"))
    set_("google_place_id", campos.get("google_place_id"))
    set_("price_range", _map_choice(campos.get("precio_rango"), _PRECIO_RANGO_TO_GHL, "precio_rango"))
    set_("verified", _yes_no(campos.get("verificado")))
    set_("featured", _yes_no(campos.get("destacado")))
    set_("featured_badge", _yes_no(campos.get("featured_badge")))
    if campos.get("featured_desde") is not None:
        props["featured_since"] = campos["featured_desde"].isoformat()
    if campos.get("horario") is not None:
        # ponytail: serialización placeholder (jsonb → texto plano). El PDF
        # dice que operating_hours es texto libre del lado GHL y que la
        # conversión a estructura le toca al website, no a GHL — falta un
        # formateador "horario bonito"; por ahora un dump legible sirve.
        import json as _json
        props["operating_hours"] = _json.dumps(campos["horario"], ensure_ascii=False)
    rating = campos.get("rating_google")
    if isinstance(rating, Decimal):
        rating = float(rating)
    if rating is not None:
        props["google_rating"] = rating
    set_("active", _yes_no(campos.get("activo")))
    return props


async def push_tienda_to_ghl(tienda_id: int, campos: dict) -> Optional[str]:
    """tienda_id es integer (public.tiendas.id). Retorna ghl_object_id o None
    si no está configurado o si el push falla (best-effort, nunca lanza)."""
    if not is_configured():
        return None

    pool = get_pool()
    existing = await pool.fetchrow(
        "SELECT ghl_object_id FROM public.ghl_object_mapping WHERE object_type = 'tienda' AND internal_object_id = $1",
        str(tienda_id),
    )

    try:
        standard = _tienda_campos_to_standard(campos)
        custom = _tienda_campos_to_custom(campos)
    except ValueError as e:
        logger.warning("push_tienda_to_ghl(%s): %s", tienda_id, e)
        if existing:
            await _record_sync_result("tienda", tienda_id, existing["ghl_object_id"], "failed", str(e))
        return None

    try:
        if existing:
            ghl_id = existing["ghl_object_id"]
            await _request("PUT", f"/businesses/{ghl_id}", params={"locationId": _GHL_LOCATION_ID}, json=standard)
        else:
            resp = await _request(
                "POST", "/businesses/", json={**standard, "locationId": _GHL_LOCATION_ID}
            )
            ghl_id = resp.json()["business"]["id"]
        if custom:
            await _request(
                "PUT",
                f"/objects/{_BUSINESS_OBJECT_KEY}/records/{ghl_id}",
                params={"locationId": _GHL_LOCATION_ID},
                json={"properties": custom},
            )
    except Exception as e:
        logger.warning("push_tienda_to_ghl(%s) falló: %s", tienda_id, e)
        if existing:
            await _record_sync_result("tienda", tienda_id, existing["ghl_object_id"], "failed", str(e))
        return None

    await _record_sync_result("tienda", tienda_id, ghl_id, "synced", None)
    return ghl_id


_TIENDA_SELECT = """
    SELECT t.nombre, t.descripcion, t.subcategoria, t.direccion, t.telefono,
           t.whatsapp, t.instagram, t.website, t.google_place_id,
           t.precio_rango, t.rating_google, t.activo, t.verificado, t.destacado,
           t.featured_badge, t.featured_desde, t.horario,
           b.nombre AS barrio_nombre, c.nombre AS ciudad_nombre
    FROM public.tiendas t
    LEFT JOIN raw.barrios b ON b.id = t.barrio_id
    LEFT JOIN public.ciudades c ON c.id = t.ciudad_id
    WHERE t.id = $1
"""


async def sync_tienda(tienda_id: int) -> Optional[str]:
    """Lee el estado actual de public.tiendas (+ barrio/ciudad resueltos) y
    lo empuja a GHL. Mismo patrón que sync_listing."""
    if not is_configured():
        return None
    pool = get_pool()
    row = await pool.fetchrow(_TIENDA_SELECT, tienda_id)
    if row is None:
        return None
    return await push_tienda_to_ghl(tienda_id, dict(row))


async def push_evento_to_ghl(evento_id: int, campos: dict) -> Optional[str]:
    raise NotImplementedError("ghl_client.push_evento_to_ghl: falta contrato GHL para evento")


async def push_deal_to_ghl(deal_id: int, campos: dict) -> Optional[str]:
    raise NotImplementedError("ghl_client.push_deal_to_ghl: falta contrato GHL para deal")
