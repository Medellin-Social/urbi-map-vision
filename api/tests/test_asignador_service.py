"""Tests del asignador — zona y sponsorship mockeados, sin DB real."""
from types import SimpleNamespace

import pytest

import api.services.asignador_service as asig
from api.services.asignador_service import (
    AsignadorError, asignar_intake, tomar_del_pool,
)


# ── Pool mockeado ─────────────────────────────────────────────────────────────

class FakeConn:
    def __init__(self, fetchrow_result="__row__"):
        self.executed = []
        self._fetchrow_result = fetchrow_result

    async def execute(self, sql, *args):
        self.executed.append((sql, args))
        return "OK"

    async def fetchrow(self, sql, *args):
        # Para tomar_del_pool: RETURNING id → row o None (carrera)
        if self._fetchrow_result == "__row__":
            return {"id": args[1] if len(args) > 1 else "x"}
        return self._fetchrow_result


class FakePool:
    def __init__(self, conn):
        self._conn = conn

    def acquire(self):
        conn = self._conn

        class _Ctx:
            async def __aenter__(self):
                return conn

            async def __aexit__(self, *a):
                return False

        return _Ctx()


def _intake(estado="nuevo", zona_codigo="42"):
    return SimpleNamespace(id="i-1", estado=estado, zona_nivel="barrio",
                           zona_codigo=zona_codigo, agent_id=None, geom="POINT(-75.5 6.2)")


@pytest.fixture
def patch_deps(monkeypatch):
    """Helper: mockea patrocinadores_vigentes y owner activo con valores dados."""
    def _apply(agencies, owner_map):
        async def fake_patrocinadores(nivel, codigo, pool, hoy=None):
            return list(agencies)

        async def fake_owner(agency_id, pool):
            return owner_map.get(agency_id)

        monkeypatch.setattr(asig, "patrocinadores_vigentes", fake_patrocinadores)
        monkeypatch.setattr(asig, "_owner_activo_de_agency", fake_owner)
    return _apply


# ── asignar_intake ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_un_patrocinador_asigna(patch_deps):
    patch_deps(["ag-1"], {"ag-1": "agent-owner-1"})
    conn = FakeConn()
    res = await asignar_intake(_intake(), FakePool(conn))
    assert res["resultado"] == "asignado"
    assert res["agent_id"] == "agent-owner-1"
    assert res["agency_id"] == "ag-1"
    assert res["reparto"] is False
    upd = " ".join(s for s, _ in conn.executed)
    assert "estado = 'asignado'" in upd


@pytest.mark.asyncio
async def test_dos_patrocinadores_toma_el_mas_antiguo(patch_deps):
    """patrocinadores_vigentes ya devuelve ordenado por antigüedad → [0] gana."""
    patch_deps(["ag-viejo", "ag-nuevo"], {"ag-viejo": "owner-viejo", "ag-nuevo": "owner-nuevo"})
    res = await asignar_intake(_intake(), FakePool(FakeConn()))
    assert res["agency_id"] == "ag-viejo"    # el primero = más antiguo
    assert res["agent_id"] == "owner-viejo"
    assert res["reparto"] is True


@pytest.mark.asyncio
async def test_cero_patrocinadores_va_al_pool(patch_deps):
    patch_deps([], {})
    conn = FakeConn()
    res = await asignar_intake(_intake(), FakePool(conn))
    assert res["resultado"] == "en_pool"
    assert res["agent_id"] is None
    upd = " ".join(s for s, _ in conn.executed)
    assert "estado = 'en_pool'" in upd


@pytest.mark.asyncio
async def test_agency_sin_owner_activo_pasa_a_siguiente(patch_deps, caplog):
    """1ª agency sin owner activo → salta (con warning) → 2ª gana."""
    patch_deps(["ag-1", "ag-2"], {"ag-1": None, "ag-2": "owner-2"})
    import logging
    with caplog.at_level(logging.WARNING):
        res = await asignar_intake(_intake(), FakePool(FakeConn()))
    assert res["agency_id"] == "ag-2"
    assert res["agent_id"] == "owner-2"
    assert any("Sponsorship saltado" in r.message for r in caplog.records)
    assert any("ag-1" in r.message for r in caplog.records)


@pytest.mark.asyncio
async def test_todas_sin_owner_activo_va_al_pool(patch_deps):
    """Patrocinan pero ninguna tiene owner asignable → pool (degradación)."""
    patch_deps(["ag-1", "ag-2"], {"ag-1": None, "ag-2": None})
    res = await asignar_intake(_intake(), FakePool(FakeConn()))
    assert res["resultado"] == "en_pool"


@pytest.mark.asyncio
async def test_idempotente_sobre_asignado(patch_deps):
    """Sobre un intake ya 'asignado' devuelve estado sin reasignar."""
    patch_deps(["ag-1"], {"ag-1": "owner-1"})
    conn = FakeConn()
    res = await asignar_intake(_intake(estado="asignado"), FakePool(conn))
    assert res["resultado"] == "idempotente"
    assert res["estado"] == "asignado"
    assert conn.executed == []   # no tocó nada


# ── tomar_del_pool ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tomar_del_pool_ok():
    conn = FakeConn(fetchrow_result="__row__")  # UPDATE afectó 1 fila
    agent = SimpleNamespace(id="agent-1", estado="activo")
    res = await tomar_del_pool("i-1", agent, FakePool(conn))
    assert res["resultado"] == "tomado"
    assert res["agent_id"] == "agent-1"


@pytest.mark.asyncio
async def test_tomar_concurrente_segundo_recibe_ya_tomado():
    """UPDATE condicional afecta 0 filas → 'ya_tomado', NO excepción."""
    conn = FakeConn(fetchrow_result=None)  # RETURNING vacío = ya no estaba en pool
    agent = SimpleNamespace(id="agent-2", estado="activo")
    res = await tomar_del_pool("i-1", agent, FakePool(conn))
    assert res["resultado"] == "ya_tomado"


@pytest.mark.asyncio
async def test_tomar_agente_no_activo_rechazado():
    """Usa ESTADOS_ASIGNABLES: inactivo/suspendido/pendiente no toman."""
    for estado in ("inactivo", "pendiente", "rechazado"):
        agent = SimpleNamespace(id="agent-x", estado=estado)
        with pytest.raises(AsignadorError, match="activo"):
            await tomar_del_pool("i-1", agent, FakePool(FakeConn()))
