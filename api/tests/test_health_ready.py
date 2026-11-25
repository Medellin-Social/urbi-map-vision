"""/health = liveness (sin DB); /health/ready = readiness (SELECT 1)."""
import pytest
from httpx import ASGITransport, AsyncClient

import api.main as m


class _Pool:
    def __init__(self, fail=False):
        self.fail = fail

    async def fetchval(self, sql):
        if self.fail:
            raise ConnectionError("db down")
        assert sql == "SELECT 1"
        return 1


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=m.app), base_url="http://t") as c:
        yield c


async def test_liveness_no_toca_db(client, monkeypatch):
    def boom():
        raise RuntimeError("no debería llamarse")

    monkeypatch.setattr(m, "get_pool", boom)
    r = await client.get("/health")
    assert r.status_code == 200


async def test_ready_ok(client, monkeypatch):
    monkeypatch.setattr(m, "get_pool", lambda: _Pool())
    r = await client.get("/health/ready")
    assert r.status_code == 200 and r.json()["db"] == "ok"


async def test_ready_db_caida_503(client, monkeypatch):
    monkeypatch.setattr(m, "get_pool", lambda: _Pool(fail=True))
    r = await client.get("/health/ready")
    assert r.status_code == 503


async def test_ready_pool_sin_iniciar_503(client, monkeypatch):
    def not_init():
        raise RuntimeError("DB pool not initialized")

    monkeypatch.setattr(m, "get_pool", not_init)
    r = await client.get("/health/ready")
    assert r.status_code == 503
