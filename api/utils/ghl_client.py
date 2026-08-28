"""GoHighLevel integration — target replacement for stripe_client.py +
wompi_client.py (decided 2026-08-23: GHL becomes the single payment gateway,
both COP and USD).

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
    thin; if it can't, this isn't a full Wompi replacement)
"""
from __future__ import annotations

import os
from typing import Optional

_GHL_API_KEY = os.getenv("GHL_API_KEY")
_GHL_LOCATION_ID = os.getenv("GHL_LOCATION_ID")
GHL_WEBHOOK_SECRET = os.getenv("GHL_WEBHOOK_SECRET")


def is_configured() -> bool:
    return bool(_GHL_API_KEY and _GHL_LOCATION_ID)


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

async def push_listing_to_ghl(listing_id: str, campos: dict) -> Optional[str]:
    """listing_id es uuid (public.listing.id). Retorna ghl_object_id creado."""
    raise NotImplementedError("ghl_client.push_listing_to_ghl: falta contrato GHL para listing")


async def push_tienda_to_ghl(tienda_id: int, campos: dict) -> Optional[str]:
    raise NotImplementedError("ghl_client.push_tienda_to_ghl: falta contrato GHL para tienda")


async def push_evento_to_ghl(evento_id: int, campos: dict) -> Optional[str]:
    raise NotImplementedError("ghl_client.push_evento_to_ghl: falta contrato GHL para evento")


async def push_deal_to_ghl(deal_id: int, campos: dict) -> Optional[str]:
    raise NotImplementedError("ghl_client.push_deal_to_ghl: falta contrato GHL para deal")
