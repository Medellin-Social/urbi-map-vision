"""Guards de POST /listings-propios — matrícula obligatoria SOLO en venta.

Suite repetible, SIN tocar DB. Todos los guards de validación corren antes del
primer acceso a DB; monkeypatcheamos `_get_agente_id` (primer query real) para que
lance un sentinel 299 = "pasó todos los guards". Así un 299 prueba que el flujo
superó la validación, y un 400/401/422 prueba que un guard específico la cortó.

Cubre: sin cuenta, campos vacíos, acepta_*, ubicación, declaraciones legales,
operación inválida, y el fix: arriendo NO exige matrícula, venta sí.

Correr: pytest api/tests/test_listings_propios_matricula.py -v
"""
import json

import pytest
import pytest_asyncio
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from api.dependencies import get_current_user
from api.main import app
from api.routers import listings_propios as LP

URL = "/api/v1/listings-propios/"
_FAKE_USER = {"id": 1, "nombre": "Test"}
_SENTINEL = 299  # status único: el flujo llegó al primer acceso DB → pasó los guards

# Declaraciones legales válidas de venta: en_propiedad_horizontal=False hace que
# al_dia_administracion no aplique (condicional_si), el resto no-None.
_DECLS_VENTA_OK = json.dumps({
    "en_propiedad_horizontal": False, "al_dia_predial": True,
    "tiene_hipoteca": False, "tiene_escritura": True, "servicios_al_dia": True,
})


async def _reached_downstream(*a, **k):
    raise HTTPException(status_code=_SENTINEL, detail="REACHED_DOWNSTREAM")


def _form(**over):
    base = {
        "tipo_operacion": "arriendo",
        "tipo_inmueble": "apartamento",
        "precio_cop": "1500000",
        "direccion": "Carrera 35 #10A-25",
        "lat": "6.2",
        "lon": "-75.57",
        "acepta_terminos": "true",
        "acepta_propietario": "true",
    }
    base.update(over)
    # None = omitir el campo (simula campo vacío/ausente en el multipart).
    return {k: v for k, v in base.items() if v is not None}


@pytest_asyncio.fixture
async def client(monkeypatch):
    monkeypatch.setattr(LP, "_get_agente_id", _reached_downstream)
    monkeypatch.setattr(LP, "get_pool", lambda: object())  # nunca se usa antes del sentinel
    app.dependency_overrides[get_current_user] = lambda: _FAKE_USER
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.pop(get_current_user, None)


# ── Auth: sin cuenta no publica ──────────────────────────────────────────────

async def test_sin_cuenta_401():
    # SIN override de get_current_user y sin token → el endpoint exige auth.
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        r = await ac.post(URL, data=_form())
    assert r.status_code == 401, r.text


# ── Campos requeridos a nivel schema (FastAPI 422) ───────────────────────────

@pytest.mark.parametrize("falta", ["tipo_operacion", "tipo_inmueble", "precio_cop",
                                   "acepta_terminos", "acepta_propietario"])
async def test_campo_requerido_faltante_422(client, falta):
    r = await client.post(URL, data=_form(**{falta: None}))
    assert r.status_code == 422, r.text


# ── Guards de negocio (400) ──────────────────────────────────────────────────

async def test_acepta_terminos_false_400(client):
    r = await client.post(URL, data=_form(acepta_terminos="false"))
    assert r.status_code == 400 and "términos" in r.text


async def test_acepta_propietario_false_400(client):
    r = await client.post(URL, data=_form(acepta_propietario="false"))
    assert r.status_code == 400 and "términos" in r.text


async def test_sin_ubicacion_400(client):
    r = await client.post(URL, data=_form(lat=None, lon=None))
    assert r.status_code == 400 and "ubicación" in r.text


async def test_direccion_vacia_400(client):
    r = await client.post(URL, data=_form(direccion="   "))
    assert r.status_code == 400 and "dirección" in r.text


async def test_operacion_invalida_400(client):
    # "permuta" no está en _OPERACION_MAP y no es "venta" (salta el guard de matrícula).
    r = await client.post(URL, data=_form(tipo_operacion="permuta"))
    assert r.status_code == 400 and "Operación inválida" in r.text


# ── EL FIX: matrícula obligatoria en venta, no en arriendo ───────────────────

async def test_venta_sin_matricula_400(client):
    r = await client.post(URL, data=_form(tipo_operacion="venta", declaraciones=_DECLS_VENTA_OK))
    assert r.status_code == 400 and "matrícula" in r.text.lower()


async def test_arriendo_sin_matricula_pasa_guard(client):
    # Arriendo sin matrícula NO lo corta el guard → llega al sentinel.
    r = await client.post(URL, data=_form(tipo_operacion="arriendo"))
    assert r.status_code == _SENTINEL, r.text


async def test_arriendo_con_matricula_tambien_pasa(client):
    r = await client.post(URL, data=_form(tipo_operacion="arriendo", matricula_inmobiliaria="001-123456"))
    assert r.status_code == _SENTINEL, r.text


async def test_venta_con_matricula_y_declaraciones_pasa(client):
    r = await client.post(URL, data=_form(
        tipo_operacion="venta", matricula_inmobiliaria="001-123456", declaraciones=_DECLS_VENTA_OK))
    assert r.status_code == _SENTINEL, r.text


# ── Declaraciones legales (venta las exige, arriendo no) ─────────────────────

async def test_venta_sin_declaraciones_400(client):
    # Con matrícula pero sin declaraciones legales → corta en el guard de declaración.
    r = await client.post(URL, data=_form(tipo_operacion="venta", matricula_inmobiliaria="001-123456"))
    assert r.status_code == 400 and "declaración legal" in r.text.lower()


async def test_arriendo_no_exige_declaraciones(client):
    # Arriendo sin declaraciones pasa igual (no tiene obligatorias).
    r = await client.post(URL, data=_form(tipo_operacion="arriendo"))
    assert r.status_code == _SENTINEL, r.text
