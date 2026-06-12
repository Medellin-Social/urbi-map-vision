"""Stripe integration — activates automatically when STRIPE_SECRET_KEY is set."""
from __future__ import annotations

import os
from typing import Optional

from api.config.planes import PLANES

_STRIPE_KEY = os.getenv("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")

# Import stripe lazily so the app starts without the package installed
try:
    import stripe as _stripe
    if _STRIPE_KEY:
        _stripe.api_key = _STRIPE_KEY
    _stripe_available = bool(_STRIPE_KEY)
except ImportError:
    _stripe = None          # type: ignore[assignment]
    _stripe_available = False


def is_configured() -> bool:
    return _stripe_available and bool(_STRIPE_KEY)


async def crear_checkout_session(
    usuario_id: int,
    email: str,
    plan: str,
    success_url: str,
    cancel_url: str,
) -> Optional[str]:
    """Returns Stripe Checkout URL, or None if not configured."""
    if not is_configured():
        return None
    price_id = PLANES[plan].get("stripe_price_id_usd")
    if not price_id:
        return None

    session = _stripe.checkout.Session.create(
        mode="subscription",
        payment_method_types=["card"],
        customer_email=email,
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=success_url + "&session_id={CHECKOUT_SESSION_ID}",
        cancel_url=cancel_url,
        metadata={"usuario_id": str(usuario_id), "plan": plan},
    )
    return session.url


async def cancelar_suscripcion(stripe_subscription_id: str) -> None:
    if not is_configured():
        return
    _stripe.Subscription.modify(
        stripe_subscription_id,
        cancel_at_period_end=True,
    )


def verificar_webhook(payload: bytes, sig_header: str):
    """Returns parsed Stripe event or raises ValueError."""
    if not is_configured() or not STRIPE_WEBHOOK_SECRET:
        raise ValueError("Stripe webhook no configurado")
    return _stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
