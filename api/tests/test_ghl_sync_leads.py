"""sync_* de GHL que leen la fila y la empujan — DB y push mockeados."""
import pytest

import api.utils.ghl_client as G


class FakePool:
    def __init__(self, row):
        self.row = row
        self.sql = []

    async def fetchrow(self, sql, *args):
        self.sql.append(sql)
        return self.row

    async def execute(self, sql, *args):
        self.sql.append((sql, args))


async def _noop(*a, **k):
    return None


@pytest.fixture
def ghl(monkeypatch):
    """GHL "configurado" con upsert_contact capturando los args."""
    monkeypatch.setattr(G, "is_configured", lambda: True)
    seen = {}

    async def fake_upsert(email=None, nombre=None, phone=None, tags=None):
        seen.update(email=email, phone=phone, nombre=nombre)
        return "c1"

    monkeypatch.setattr(G, "upsert_contact", fake_upsert)
    monkeypatch.setattr(G, "add_contact_note", _noop)
    monkeypatch.setattr(G, "upsert_opportunity", _noop)
    monkeypatch.setattr(G, "resolve_push_failure", _noop)
    return seen


async def test_sync_visita_pasa_email_sin_telefono(ghl, monkeypatch):
    """Una visita con email y sin teléfono debe llegar al push con el email
    (antes _VISITA_SELECT no traía email y el reintento fallaba siempre)."""
    assert "email" in G._VISITA_SELECT
    pool = FakePool({"listing_url": "u", "nombre": "Ana", "telefono": None,
                     "email": "ana@x.co", "fecha_visita": None, "mensaje": None, "agent_id": None})
    monkeypatch.setattr(G, "get_pool", lambda: pool)
    assert await G.sync_visita("v1") == "c1"
    assert ghl["email"] == "ana@x.co"
    assert ghl["phone"] is None
