"""Seguimiento de visitas (recordatorio 12 h / reasignación 24 h) — DB y email mockeados."""
import pytest

import api.services.visita_followup_service as svc


class Conn:
    def __init__(self, fetch_rows=(), owner=None, claim=True):
        self.fetch_rows, self.owner, self.claim = list(fetch_rows), owner, claim
        self.sql = []

    async def fetch(self, sql, *a):
        self.sql.append(sql)
        return self.fetch_rows

    async def fetchval(self, sql, *a):
        return self.owner

    async def fetchrow(self, sql, *a):
        self.sql.append(sql)
        if "SELECT a.email" in sql:
            return None  # _avisar: sin email → no envía
        return {"id": a[0]} if self.claim else None


class Pool:
    def __init__(self, conn):
        self.conn = conn

    def acquire(self):
        conn = self.conn

        class _Ctx:
            async def __aenter__(self_):
                return conn

            async def __aexit__(self_, *a):
                return False
        return _Ctx()


async def test_recordatorio_cuenta_las_reclamadas():
    conn = Conn(fetch_rows=[{"id": "v1", "agent_id": "a1"}, {"id": "v2", "agent_id": "a2"}])
    assert await svc.recordar_pendientes(Pool(conn)) == 2
    assert "recordatorio_at IS NULL" in conn.sql[0]


async def test_reasigna_al_owner():
    due = [{"id": "v1", "agent_id": "a1", "listing_url": "u", "nombre": "N", "telefono": "1"}]
    conn = Conn(fetch_rows=due, owner="owner1")
    assert await svc.reasignar_vencidas(Pool(conn)) == {"reasignadas": 1, "escaladas": 0}


async def test_sin_owner_escala(monkeypatch):
    sent = []

    async def fake_send(to, subject, html):
        sent.append(to)

    import api.utils.email as em
    monkeypatch.setattr(em, "send_email", fake_send)
    due = [{"id": "v1", "agent_id": "a1", "listing_url": "u", "nombre": "N", "telefono": "1"}]
    conn = Conn(fetch_rows=due, owner=None)
    assert await svc.reasignar_vencidas(Pool(conn)) == {"reasignadas": 0, "escaladas": 1}
    assert sent == [svc.ESCALAR_A]


async def test_carrera_perdida_no_cuenta():
    due = [{"id": "v1", "agent_id": "a1", "listing_url": "u", "nombre": None, "telefono": None}]
    conn = Conn(fetch_rows=due, owner="owner1", claim=False)
    assert await svc.reasignar_vencidas(Pool(conn)) == {"reasignadas": 0, "escaladas": 0}
