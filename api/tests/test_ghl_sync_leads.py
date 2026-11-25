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


def test_lead_servicio_y_negocio_son_reintentables():
    """Antes se registraban en ghl_push_failures pero el cron no los reintentaba
    (quedaban con attempts=1 para siempre, sin llegar nunca al aviso de agotados)."""
    import api.services.ghl_retry_service as svc

    assert svc._SYNC["lead_servicio"] == (G.sync_lead_servicio, str)
    assert svc._SYNC["negocio"] == (G.sync_negocio, int)


async def test_sync_lead_servicio_reempuja_y_guarda_contact_id(ghl, monkeypatch):
    pool = FakePool({"tipo": "property_manager", "nombre": "Leo", "email": None,
                     "telefono": "300", "barrio": None, "listing_url": None, "mensaje": None})
    monkeypatch.setattr(G, "get_pool", lambda: pool)
    resolved = []

    async def fake_resolve(t, i):
        resolved.append((t, i))

    monkeypatch.setattr(G, "resolve_push_failure", fake_resolve)
    assert await G.sync_lead_servicio("u-1") == "c1"
    assert ghl["phone"] == "300"
    assert resolved == [("lead_servicio", "u-1")]
    updates = [q for q in pool.sql if isinstance(q, tuple) and "ghl_contact_id" in q[0]]
    assert updates and updates[0][1] == ("u-1", "c1")


async def test_sync_negocio_reempuja(ghl, monkeypatch):
    pool = FakePool({"nombre_negocio": "Café", "email": "c@x.co", "telefono": None, "categoria": None,
                     "barrio_id": None, "plan_tipo": "free", "mensaje": None})
    monkeypatch.setattr(G, "get_pool", lambda: pool)
    assert await G.sync_negocio(7) == "c1"
    assert ghl["email"] == "c@x.co"
    assert ghl["nombre"] == "Café"


async def test_sync_lead_servicio_fila_inexistente(ghl, monkeypatch):
    monkeypatch.setattr(G, "get_pool", lambda: FakePool(None))
    assert await G.sync_lead_servicio("nope") is None
