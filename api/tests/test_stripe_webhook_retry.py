"""Si la activación falla, el event_id se libera y se responde 500 (Stripe reintenta)."""
import pytest
from unittest.mock import AsyncMock, MagicMock

from api.routers import suscripciones as s


class _Req:
    headers = {"stripe-signature": "x"}
    async def body(self): return b"{}"


def _event():
    return {"id": "evt_1", "type": "checkout.session.completed",
            "data": {"object": {"metadata": {"usuario_id": "7", "plan": "pro"}}}}


@pytest.mark.asyncio
async def test_falla_activacion_libera_evento_y_da_500(monkeypatch):
    pool = MagicMock(); pool.fetchval = AsyncMock(return_value="evt_1"); pool.execute = AsyncMock()
    monkeypatch.setattr(s, "get_pool", lambda: pool)
    monkeypatch.setattr(s.stripe_client, "verificar_webhook", lambda p, h: _event())
    monkeypatch.setattr(s, "_activar_plan", AsyncMock(side_effect=RuntimeError("db caída")))
    with pytest.raises(s.HTTPException) as ei:
        await s.webhook_stripe.__wrapped__(_Req()) if hasattr(s.webhook_stripe, "__wrapped__") else await s.webhook_stripe(_Req())
    assert ei.value.status_code == 500
    assert "DELETE FROM public.stripe_events" in pool.execute.call_args[0][0]


@pytest.mark.asyncio
async def test_exito_no_libera_evento(monkeypatch):
    pool = MagicMock(); pool.fetchval = AsyncMock(return_value="evt_1"); pool.execute = AsyncMock()
    monkeypatch.setattr(s, "get_pool", lambda: pool)
    monkeypatch.setattr(s.stripe_client, "verificar_webhook", lambda p, h: _event())
    monkeypatch.setattr(s, "_activar_plan", AsyncMock())
    r = await s.webhook_stripe.__wrapped__(_Req()) if hasattr(s.webhook_stripe, "__wrapped__") else await s.webhook_stripe(_Req())
    assert r == {"received": True}
    pool.execute.assert_not_called()
