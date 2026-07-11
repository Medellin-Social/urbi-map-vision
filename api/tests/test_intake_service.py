"""Unit tests for intake domain logic — pool mockeado, sin DB real."""
from types import SimpleNamespace

import pytest

from api.schemas.intake_cuestionario import cuestionario_para
from api.services.intake_service import (
    IntakeError, _validar_payload, aceptar_intake, crear_intake,
)


# ── Pool mockeado ─────────────────────────────────────────────────────────────

class FakeConn:
    """Conn asyncpg falso. Responde fetchrow según el SQL; captura execute."""

    def __init__(self, barrio_id="42", barrio_nombre="Laureles", municipio="Medellín"):
        self.barrio_id = barrio_id
        self.barrio_nombre = barrio_nombre
        self.municipio = municipio
        self.executed = []  # [(sql, args)]

    async def fetchrow(self, sql, *args):
        if "ST_Contains" in sql:
            # resolver_zona: punto cae en barrio de prueba
            return {"barrio_id": self.barrio_id} if self.barrio_id else None
        if "nombre" in sql and "municipio" in sql:
            return {"nombre": self.barrio_nombre, "municipio": self.municipio}
        return None

    async def fetch(self, sql, *args):
        return []

    async def execute(self, sql, *args):
        self.executed.append((sql, args))
        return "OK"


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


# ── Validación de cuestionario ────────────────────────────────────────────────

def test_validar_obligatoria_presente():
    payload = {"operacion": "venta", "tipo_inmueble": "casa", "geom": "POINT(-75.5 6.2)",
               "en_propiedad_horizontal": False, "al_dia_predial": True,
               "tiene_hipoteca": False, "tiene_escritura": True, "servicios_al_dia": True}
    _validar_payload(payload, cuestionario_para("venta"))  # no raise


def test_validar_obligatoria_falta():
    with pytest.raises(IntakeError, match="obligatorio"):
        _validar_payload({}, cuestionario_para("venta"))


def test_condicional_ph_false_no_exige_administracion():
    """al_dia_administracion NO se exige si en_propiedad_horizontal=False."""
    payload = {"operacion": "venta", "tipo_inmueble": "casa", "geom": "POINT(-75.5 6.2)",
               "en_propiedad_horizontal": False, "al_dia_predial": True,
               "tiene_hipoteca": False, "tiene_escritura": True, "servicios_al_dia": True}
    _validar_payload(payload, cuestionario_para("venta"))  # no raise


def test_condicional_ph_true_exige_administracion():
    """al_dia_administracion SÍ se exige si en_propiedad_horizontal=True."""
    payload = {"operacion": "venta", "tipo_inmueble": "apartamento", "geom": "POINT(-75.5 6.2)",
               "en_propiedad_horizontal": True, "al_dia_predial": True,
               "tiene_hipoteca": False, "tiene_escritura": True, "servicios_al_dia": True}
    with pytest.raises(IntakeError, match="al_dia_administracion"):
        _validar_payload(payload, cuestionario_para("venta"))


def test_condicional_ph_true_con_administracion_ok():
    payload = {"operacion": "venta", "tipo_inmueble": "apartamento", "geom": "POINT(-75.5 6.2)",
               "en_propiedad_horizontal": True, "al_dia_administracion": True,
               "al_dia_predial": True, "tiene_hipoteca": False,
               "tiene_escritura": True, "servicios_al_dia": True}
    _validar_payload(payload, cuestionario_para("venta"))  # no raise


def test_venta_pide_mas_que_arriendo():
    venta = {p["id"] for p in cuestionario_para("venta")}
    arriendo = {p["id"] for p in cuestionario_para("arriendo")}
    assert venta.issuperset(arriendo)
    assert "tiene_hipoteca" in venta and "tiene_hipoteca" not in arriendo


def test_operacion_invalida():
    with pytest.raises(ValueError, match="Operación desconocida"):
        cuestionario_para("compraventa")


# ── crear_intake: resuelve zona ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_crear_intake_resuelve_zona():
    pool = FakePool(FakeConn(barrio_id="42", barrio_nombre="Laureles", municipio="Medellín"))
    payload = {"en_propiedad_horizontal": False, "al_dia_predial": True,
               "tiene_hipoteca": False, "tiene_escritura": True, "servicios_al_dia": True,
               "area_m2": 80}
    intake = await crear_intake(
        owner_id="owner-1", geom="POINT(-75.56 6.24)", operacion="venta",
        tipo_inmueble="casa", payload=payload, pool=pool,
    )
    assert intake["estado"] == "nuevo"
    assert intake["zona_nivel"] == "barrio"
    assert intake["zona_codigo"] == "42"
    assert intake["barrio"] == "Laureles"
    assert intake["municipio"] == "Medellín"
    assert intake["agent_id"] is None      # asignador lo llena luego
    assert intake["listing_id"] is None
    # Declaraciones legales extraídas al blob
    assert intake["declaraciones"]["tiene_escritura"] is True
    assert "area_m2" not in intake["declaraciones"]  # característica, no declaración


@pytest.mark.asyncio
async def test_crear_intake_punto_fuera_de_zona():
    pool = FakePool(FakeConn(barrio_id=None))  # ST_Contains no matchea
    payload = {"en_propiedad_horizontal": False, "al_dia_predial": True,
               "tiene_hipoteca": False, "tiene_escritura": True, "servicios_al_dia": True}
    with pytest.raises(ValueError, match="no cae en ningún barrio"):
        await crear_intake(
            owner_id="owner-1", geom="POINT(0 0)", operacion="venta",
            tipo_inmueble="casa", payload=payload, pool=pool,
        )


@pytest.mark.asyncio
async def test_crear_intake_valida_antes_de_resolver_zona():
    """Si el cuestionario falla, ni siquiera consulta la zona."""
    pool = FakePool(FakeConn())
    with pytest.raises(IntakeError, match="obligatorio"):
        await crear_intake(
            owner_id="owner-1", geom="POINT(-75.56 6.24)", operacion="venta",
            tipo_inmueble="casa", payload={}, pool=pool,  # faltan obligatorias
        )


# ── aceptar_intake: crea listing 'borrador' y enlaza ─────────────────────────

@pytest.mark.asyncio
async def test_aceptar_intake_crea_listing_borrador():
    conn = FakeConn()
    pool = FakePool(conn)
    intake = SimpleNamespace(
        estado="asignado", geom="POINT(-75.56 6.24)", municipio="Medellín",
        barrio="Laureles", direccion_aprox="Cra 70", operacion="venta",
        precio_esperado=350_000_000, tipo_inmueble="casa", area_m2=80,
        habitaciones=3, banos=2, zona_codigo="42",
    )
    listing_id = await aceptar_intake(
        intake_id="intake-1", intake=intake, agent_id="agent-1",
        agency_id="agency-1", pool=pool,
    )
    assert listing_id

    insert_sql, insert_args = conn.executed[0]
    assert "INSERT INTO listing" in insert_sql
    assert "'borrador'" in insert_sql          # nace en borrador, NO publicado
    assert "agency-1" in insert_args
    assert "agent-1" in insert_args

    update_sql, update_args = conn.executed[1]
    assert "UPDATE intake" in update_sql
    assert "aceptado" in update_sql
    assert listing_id in update_args           # enlaza listing_id
    assert "intake-1" in update_args


@pytest.mark.asyncio
async def test_aceptar_intake_sin_precio_usa_placeholder():
    conn = FakeConn()
    pool = FakePool(conn)
    intake = SimpleNamespace(
        estado="asignado", geom="POINT(-75.56 6.24)", municipio="M", barrio="B",
        direccion_aprox=None, operacion="arriendo", precio_esperado=None,
        tipo_inmueble="apartamento", area_m2=None, habitaciones=None,
        banos=None, zona_codigo="42",
    )
    listing_id = await aceptar_intake("i-1", intake, "ag", "agc", pool)
    _, insert_args = conn.executed[0]
    assert 0 in insert_args  # precio placeholder cuando no hay precio_esperado
    assert listing_id


@pytest.mark.asyncio
async def test_aceptar_intake_rechaza_estado_no_asignado():
    pool = FakePool(FakeConn())
    intake = SimpleNamespace(estado="nuevo", zona_codigo="42")
    with pytest.raises(IntakeError, match="no está listo"):
        await aceptar_intake("i-1", intake, "ag", "agc", pool)
