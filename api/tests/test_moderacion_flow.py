"""Tests paso 6 — mínimos + moderación + due diligence + verificación agentes.

Pool mockeado, sin DB real.
"""
from types import SimpleNamespace

import pytest

from api.services.listing_service import (
    EstadoError, datos_minimos_completos, transition,
)
from api.services.moderacion_service import aprobar, rechazar
from api.services.due_diligence_service import items_checklist, generar_checklist
from api.services.agent_service import (
    AgentError, ESTADOS_ASIGNABLES, aprobar_agente, rechazar_agente, suspender_agente,
)
from api.schemas.intake_cuestionario import DECLARACIONES_KEYS


# ── Pool mockeado ─────────────────────────────────────────────────────────────

class FakeConn:
    def __init__(self, fetchval=0):
        self.executed = []
        self._fetchval = fetchval

    async def execute(self, sql, *args):
        self.executed.append((sql, args))
        return "OK"

    async def fetchval(self, sql, *args):
        return self._fetchval


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


def _listing_completo(**over):
    base = dict(
        id="l-1", estado="borrador", published_at=None, tipo_inmueble="apartamento",
        operacion="venta", precio=350_000_000, geom="POINT(-75.5 6.2)",
        barrio="Laureles", municipio="Medellín", area_m2=80, titulo="Lindo apto",
        fotos_portada=1, habitaciones=3, banos=2,
    )
    base.update(over)
    return SimpleNamespace(**base)


# ── (A) datos_minimos_completos ───────────────────────────────────────────────

def test_minimos_completos_ok():
    assert datos_minimos_completos(_listing_completo())["ok"]


def test_minimos_precio_cero_falla():
    """Placeholder 0 de aceptar_intake NO cuenta como precio válido."""
    chk = datos_minimos_completos(_listing_completo(precio=0))
    assert not chk["ok"]
    assert "precio" in chk["faltan"]


def test_minimos_sin_foto_falla():
    chk = datos_minimos_completos(_listing_completo(fotos_portada=0))
    assert "foto_portada" in chk["faltan"]


def test_minimos_sin_area_falla():
    chk = datos_minimos_completos(_listing_completo(area_m2=None))
    assert "area_m2" in chk["faltan"]


def test_minimos_condicional_habitaciones_apto():
    chk = datos_minimos_completos(_listing_completo(habitaciones=None))
    assert "habitaciones" in chk["faltan"]


def test_minimos_condicional_no_aplica_a_local():
    """local NO exige habitaciones/baños."""
    chk = datos_minimos_completos(
        _listing_completo(tipo_inmueble="local", habitaciones=None, banos=None)
    )
    assert chk["ok"]


# ── (A) transition enchufada ──────────────────────────────────────────────────

def test_transition_a_revision_rechaza_incompleto():
    l = _listing_completo(precio=0, fotos_portada=0, area_m2=None)
    with pytest.raises(EstadoError, match="Faltan datos mínimos"):
        transition(l, "en_revision")
    assert l.estado == "borrador"  # no mutó


def test_transition_a_revision_acepta_completo():
    l = _listing_completo()
    transition(l, "en_revision")
    assert l.estado == "en_revision"


# ── (A) moderación escribe bitácora ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_aprobar_escribe_moderacion():
    conn = FakeConn()
    l = _listing_completo(estado="en_revision")
    await aprobar(l, "admin@x.com", FakePool(conn))
    assert l.estado == "publicado"
    assert l.published_at is not None
    sqls = " ".join(s for s, _ in conn.executed)
    assert "INSERT INTO listing_moderacion" in sqls
    assert "'aprobado'" in sqls


@pytest.mark.asyncio
async def test_rechazar_guarda_motivo():
    conn = FakeConn()
    l = _listing_completo(estado="en_revision")
    await rechazar(l, "admin@x.com", "fotos borrosas", FakePool(conn))
    assert l.estado == "rechazado"
    insert = [args for sql, args in conn.executed if "listing_moderacion" in sql][0]
    assert "fotos borrosas" in insert


@pytest.mark.asyncio
async def test_rechazar_sin_motivo_falla():
    with pytest.raises(ValueError, match="motivo"):
        await rechazar(_listing_completo(estado="en_revision"), "a@x.com", "", FakePool(FakeConn()))


# ── (B) due diligence ─────────────────────────────────────────────────────────

def test_items_checklist_desde_declaraciones_keys():
    decl = {"tiene_escritura": True, "al_dia_predial": False}
    items = items_checklist(decl)
    claves = {i["clave"] for i in items}
    assert claves == set(DECLARACIONES_KEYS)  # un item por cada key, no hardcode
    # declarado refleja lo dicho; None si no respondió
    por_clave = {i["clave"]: i["declarado"] for i in items}
    assert por_clave["tiene_escritura"] is True
    assert por_clave["es_persona_juridica"] is None


@pytest.mark.asyncio
async def test_generar_checklist_inserta_todos():
    conn = FakeConn()
    intake = SimpleNamespace(id="i-1", declaraciones={"tiene_escritura": True})
    n = await generar_checklist(intake, FakePool(conn))
    assert n == len(DECLARACIONES_KEYS)
    inserts = [s for s, _ in conn.executed if "due_diligence_item" in s]
    assert len(inserts) == len(DECLARACIONES_KEYS)


# ── (C) verificación de agentes ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_aprobar_agente_sin_usuario_error_controlado():
    """No revienta el CHECK: falla antes de tocar la DB."""
    conn = FakeConn()
    agent = SimpleNamespace(id="a-1", estado="pendiente", usuario_id=None)
    with pytest.raises(AgentError, match="cuenta antes de activarse"):
        await aprobar_agente(agent, "admin@x.com", FakePool(conn))
    assert conn.executed == []  # nunca ejecutó UPDATE


@pytest.mark.asyncio
async def test_aprobar_agente_con_cuenta_activa():
    conn = FakeConn()
    agent = SimpleNamespace(id="a-1", estado="pendiente", usuario_id=42)
    await aprobar_agente(agent, "admin@x.com", FakePool(conn))
    assert agent.estado == "activo"


@pytest.mark.asyncio
async def test_suspender_agente_inactivo():
    conn = FakeConn()
    agent = SimpleNamespace(id="a-1", estado="activo", usuario_id=42)
    await suspender_agente(agent, "admin@x.com", "baja voluntaria", FakePool(conn))
    assert agent.estado == "inactivo"


@pytest.mark.asyncio
async def test_rechazar_agente_guarda_motivo():
    conn = FakeConn()
    agent = SimpleNamespace(id="a-1", estado="pendiente", usuario_id=None)
    await rechazar_agente(agent, "admin@x.com", "cédula no válida", FakePool(conn))
    assert agent.estado == "rechazado"
    assert any("cédula no válida" in args for _, args in conn.executed)


def test_asignador_ignora_inactivo():
    """El asignador (paso 5) DEBE filtrar por este set. inactivo/pendiente fuera."""
    assert ESTADOS_ASIGNABLES == frozenset(["activo"])
    assert "inactivo" not in ESTADOS_ASIGNABLES
    assert "pendiente" not in ESTADOS_ASIGNABLES
    assert "rechazado" not in ESTADOS_ASIGNABLES
