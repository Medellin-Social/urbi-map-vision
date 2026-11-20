"""Lógica pura de Realtor Preferido con una conexión simulada (sin DB)."""
import asyncio
import pytest
from api.services import realtor_preferido_service as svc


class FakeConn:
    def __init__(self, activos, propio=None):
        self.activos, self.propio, self.inserts, self.cancelados = activos, propio, [], []

    async def execute(self, q, *a):
        if "SET estado = 'cancelado'" in q:
            self.cancelados.append(a[0])
        return "UPDATE 0"

    async def fetchval(self, q, *a):
        if "INSERT INTO realtor_slot" in q:
            self.inserts.append(a)
            return "nuevo-id"
        if "precio_mensual FROM realtor_slot_precio" in q:
            return 200000
        return None

    async def fetchrow(self, q, *a):
        return self.propio

    async def fetch(self, q, *a):
        return self.activos


def _slot(pos, tipo="pago"):
    return {"id": f"s{pos}", "posicion": pos, "agent_id": f"a{pos}", "tipo": tipo, "fecha_fin": None}


def run(c):
    return asyncio.run(c)


def test_capacidades():
    assert svc.CAPACIDAD == {"barrio": 4, "comuna": 8}


def test_toma_primera_posicion_libre():
    c = FakeConn([_slot(1), _slot(3)])
    r = run(svc.asignar_slot(c, "nuevo", "barrio", "1"))
    assert r["posicion"] == 2


def test_zona_llena_rechaza_pagador_si_todos_pagan():
    c = FakeConn([_slot(i) for i in range(1, 5)])
    with pytest.raises(svc.SlotError):
        run(svc.asignar_slot(c, "nuevo", "barrio", "1", tipo="pago"))


def test_pagador_reemplaza_slot_gratis():
    c = FakeConn([_slot(1), _slot(2), _slot(3), _slot(4, "gratis")])
    r = run(svc.asignar_slot(c, "nuevo", "barrio", "1", tipo="pago"))
    assert r["posicion"] == 4 and c.cancelados == ["s4"]


def test_gratis_no_desplaza_a_nadie():
    c = FakeConn([_slot(i) for i in range(1, 5)])
    with pytest.raises(svc.SlotError):
        run(svc.asignar_slot(c, "nuevo", "barrio", "1", tipo="gratis"))


def test_comuna_tiene_8():
    c = FakeConn([_slot(i) for i in range(1, 8)])
    assert run(svc.asignar_slot(c, "nuevo", "comuna", "3"))["posicion"] == 8


def test_zona_invalida():
    with pytest.raises(svc.SlotError):
        run(svc.asignar_slot(FakeConn([]), "x", "ciudad", "1"))
