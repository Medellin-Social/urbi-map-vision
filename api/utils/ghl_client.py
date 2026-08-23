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
