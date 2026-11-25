"""Plan "pro" retirado (precios 21-nov): no acepta checkouts nuevos, pero los
suscriptores existentes siguen siendo válidos."""
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

import api.routers.suscripciones as sus
import api.utils.stripe_client as sc
from api.config.planes import PLANES, plan_gte, plan_vendible
from api.dependencies import _PLAN_ORDEN, get_current_user


class _Pool:
    async def fetchrow(self, *a):
        return None  # sin agente verificado


@pytest.fixture
async def client(monkeypatch):
    app = FastAPI()
    app.include_router(sus.router, prefix="/s")
    app.dependency_overrides[get_current_user] = lambda: {"id": 1, "email": "a@x.co", "plan": "free"}
    monkeypatch.setattr(sus, "get_pool", lambda: _Pool())
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        yield c


def test_pro_marcado_retirado_pero_sigue_definido():
    assert PLANES["pro"]["activo"] is False
    assert not plan_vendible("pro") and plan_vendible("agente")
    # existentes con plan "pro" mantienen su nivel de acceso
    assert "pro" in _PLAN_ORDEN and plan_gte("pro", "pro") and plan_gte("agente", "pro")


async def test_checkout_pro_nuevo_da_410(client):
    r = await client.post("/s/iniciar", data={"plan": "pro", "moneda": "USD"})
    assert r.status_code == 410
    assert r.json()["detail"] == {"error": "plan_retirado", "upgrade_url": "/agentes/registro"}


async def test_flujo_agente_sin_cambios(client):
    r = await client.post("/s/iniciar", data={"plan": "agente", "moneda": "USD"})
    assert r.status_code == 200
    assert r.json() == {"requiere_verificacion": True, "redirect": "/agentes/registro"}


async def test_planes_publicos_no_ofrecen_pro(client):
    ids = [p["id"] for p in (await client.get("/s/planes")).json()["planes"]]
    assert "pro" not in ids and "agente" in ids


async def test_stripe_no_crea_sesion_para_pro(monkeypatch):
    monkeypatch.setattr(sc, "is_configured", lambda: True)
    assert await sc.crear_checkout_session(1, "a@x.co", "pro", "s", "c") is None
