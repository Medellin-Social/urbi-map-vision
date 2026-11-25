"""Reintento de fallos GHL — DB y GHL mockeados."""
import pytest

import api.services.ghl_retry_service as svc


class FakePool:
    def __init__(self, rows, abiertos):
        self.rows = rows
        self.abiertos = abiertos  # ids que siguen abiertos tras el reintento
        self.queries = []

    async def fetch(self, sql, *args):
        self.queries.append((sql, args))
        return self.rows

    async def fetchval(self, sql, id_):
        return id_ if id_ in self.abiertos else None


@pytest.fixture
def calls(monkeypatch):
    calls = []
    monkeypatch.setattr(svc.ghl_client, "is_configured", lambda: True)

    def fake(name):
        async def _f(i):
            calls.append((name, i))
        return _f

    monkeypatch.setattr(svc, "_SYNC", {
        "listing": (fake("listing"), str),
        "tienda": (fake("tienda"), int),
    })
    return calls


async def test_reintenta_y_castea_ids(calls):
    rows = [
        {"id": 1, "object_type": "listing", "internal_object_id": "abc"},
        {"id": 2, "object_type": "tienda", "internal_object_id": "7"},
    ]
    res = await svc.reintentar_pendientes(FakePool(rows, abiertos={2}))
    assert calls == [("listing", "abc"), ("tienda", 7)]
    assert res == {"intentados": 2, "resueltos": 1, "fallaron": 1}


async def test_sin_credenciales_no_hace_nada(monkeypatch):
    monkeypatch.setattr(svc.ghl_client, "is_configured", lambda: False)
    pool = FakePool([{"id": 1, "object_type": "listing", "internal_object_id": "a"}], set())
    assert await svc.reintentar_pendientes(pool) == {"intentados": 0, "resueltos": 0, "fallaron": 0}
    assert pool.queries == []


async def test_una_excepcion_no_frena_el_resto(monkeypatch):
    seen = []

    async def boom(i):
        raise RuntimeError("x")

    async def ok(i):
        seen.append(i)

    monkeypatch.setattr(svc.ghl_client, "is_configured", lambda: True)
    monkeypatch.setattr(svc, "_SYNC", {"listing": (boom, str), "agent": (ok, str)})
    rows = [
        {"id": 1, "object_type": "listing", "internal_object_id": "a"},
        {"id": 2, "object_type": "agent", "internal_object_id": "b"},
    ]
    res = await svc.reintentar_pendientes(FakePool(rows, abiertos={1}))
    assert seen == ["b"]
    assert res["intentados"] == 2 and res["fallaron"] == 1


def test_todo_tipo_reintentable_tiene_sync():
    assert set(svc.TIPOS_REINTENTABLES) == {"listing", "agency", "agent", "visita", "tienda", "evento", "referidor",
                                            "lead_servicio", "negocio"}


class _FakePool:
    def __init__(self, rows):
        self.rows, self.updated = rows, None

    async def fetch(self, *a):
        return self.rows

    async def execute(self, sql, ids):
        self.updated = ids


def test_alertar_agotados_envia_y_marca(monkeypatch):
    import asyncio

    from api.services import ghl_retry_service as svc
    sent = []

    async def fake_send(to, subj, html):
        sent.append((to, subj, html))

    monkeypatch.setattr("api.utils.email.send_email", fake_send)
    pool = _FakePool([{"id": 7, "object_type": "agent", "internal_object_id": "x<b>", "error": "boom",
                       "attempts": 8, "last_failed_at": None}])
    assert asyncio.run(svc.alertar_agotados(pool)) == 1
    assert pool.updated == [7] and "x&lt;b&gt;" in sent[0][2]


def test_alertar_agotados_si_email_falla_no_marca(monkeypatch):
    import asyncio

    from api.services import ghl_retry_service as svc

    async def boom(*a):
        raise RuntimeError("smtp")

    monkeypatch.setattr("api.utils.email.send_email", boom)
    pool = _FakePool([{"id": 1, "object_type": "agent", "internal_object_id": "a", "error": "e",
                       "attempts": 8, "last_failed_at": None}])
    assert asyncio.run(svc.alertar_agotados(pool)) == 0 and pool.updated is None
