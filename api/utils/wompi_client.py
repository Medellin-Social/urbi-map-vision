"""Wompi integration — activates automatically when WOMPI_PUBLIC_KEY is set."""
from __future__ import annotations

import hashlib
import os
import time
from typing import Optional

from api.config.planes import PLANES

WOMPI_PUBLIC_KEY       = os.getenv("WOMPI_PUBLIC_KEY", "")
WOMPI_PRIVATE_KEY      = os.getenv("WOMPI_PRIVATE_KEY", "")
WOMPI_INTEGRITY_SECRET = os.getenv("WOMPI_INTEGRITY_SECRET", "")
WOMPI_BASE_URL         = "https://api.wompi.co/v1"
WOMPI_CHECKOUT_URL     = "https://checkout.wompi.co/p/"


def is_configured() -> bool:
    return bool(WOMPI_PUBLIC_KEY and WOMPI_INTEGRITY_SECRET)


async def crear_link_pago(
    usuario_id: int,
    plan: str,
    email: str,
    redirect_url: str,
) -> Optional[str]:
    """Returns Wompi checkout URL, or None if not configured."""
    if not is_configured():
        return None

    precio_cop = PLANES[plan]["precio_cop"]
    precio_centavos = precio_cop * 100
    referencia = f"mls_{plan}_{usuario_id}_{int(time.time())}"

    firma = hashlib.sha256(
        f"{referencia}{precio_centavos}COP{WOMPI_INTEGRITY_SECRET}".encode()
    ).hexdigest()

    params = (
        f"?public-key={WOMPI_PUBLIC_KEY}"
        f"&currency=COP"
        f"&amount-in-cents={precio_centavos}"
        f"&reference={referencia}"
        f"&signature:integrity={firma}"
        f"&redirect-url={redirect_url}"
        f"&customer-data:email={email}"
    )
    return WOMPI_CHECKOUT_URL + params


def verificar_webhook(payload: dict, checksum: str) -> bool:
    """Verifies Wompi webhook hash.
    Returns True unconditionally when WOMPI_INTEGRITY_SECRET is not set (dev mode).
    """
    if not WOMPI_INTEGRITY_SECRET:
        return True

    event = payload.get("data", {}).get("transaction", {})
    referencia = event.get("reference", "")
    monto = event.get("amount_in_cents", "")
    moneda = event.get("currency", "")
    estado = event.get("status", "")
    created_at = payload.get("timestamp", "")

    concat = f"{referencia}{monto}{moneda}{estado}{created_at}{WOMPI_INTEGRITY_SECRET}"
    expected = hashlib.sha256(concat.encode()).hexdigest()
    return expected == checksum


def referencia_to_plan_user(referencia: str) -> tuple[str, int]:
    """Parse 'mls_pro_42_1717000000' → ('pro', 42)."""
    parts = referencia.split("_")
    if len(parts) >= 3:
        plan = parts[1]
        try:
            usuario_id = int(parts[2])
            return plan, usuario_id
        except ValueError:
            pass
    return "", 0
