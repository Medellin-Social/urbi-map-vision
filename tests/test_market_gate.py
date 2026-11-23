"""Gate server-side de inteligencia de mercado.

Unit (ambos roles): python3 tests/test_market_gate.py
Integración público (API local arriba): incluida al final, se salta si no responde.
"""
import json
import os
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from api.routers.listings import (
    _MARKET_INTEL_FIELDS, _REALTOR_FIELDS, _gate_market_fields,
)

SAMPLE = {
    "precio_cop": 100, "area_m2": 50.0, "fotos": ["x"], "descripcion": "d",
    "estrato_real": 4, "precio_m2": 2, "habitaciones": 3, "dias_en_mercado": 12,
    **{f: 1 for f in _MARKET_INTEL_FIELDS},
}
PUBLICOS = ("precio_cop", "area_m2", "fotos", "descripcion", "estrato_real",
            "precio_m2", "habitaciones", "dias_en_mercado")
AGENTE = {"plan": "agente", "es_agente": True}
FREE_LOGUEADO = {"plan": "free"}  # registrado sin ser agente (también 'pro')


def test_publico_nullea_mercado():
    out = _gate_market_fields(dict(SAMPLE), None)  # anónimo
    assert all(out[f] is None for f in _MARKET_INTEL_FIELDS), "mercado debe ir null"
    assert all(out[f] == SAMPLE[f] for f in PUBLICOS), "públicos intactos"


def test_free_logueado_no_ve_kpi_inversor():
    # Política: KPIs de perfil inversor (buena_oferta/pct, scores) nunca en free,
    # ni siquiera logueado. Solo is_agente los conserva.
    out = _gate_market_fields(dict(SAMPLE), FREE_LOGUEADO)
    assert all(out[f] is None for f in _REALTOR_FIELDS), "realtor-only debe ir null para free"
    assert out["buena_oferta"] is None and out["pct_bajo_mediana"] is None


def test_agente_conserva_todo():
    out = _gate_market_fields(dict(SAMPLE), AGENTE)
    assert all(out[f] == 1 for f in _MARKET_INTEL_FIELDS), "agente recibe todo"


if __name__ == "__main__":
    test_publico_nullea_mercado()
    test_free_logueado_no_ve_kpi_inversor()
    test_agente_conserva_todo()
    print("unit OK")
    # Integración: detail anónimo contra API local → mercado null
    base = os.environ.get("API_URL", "http://localhost:8011")
    try:
        vp = json.load(urllib.request.urlopen(
            f"{base}/api/v1/listings/viewport?min_lng=-75.65&min_lat=6.1&max_lng=-75.5&max_lat=6.3&zoom=15",
            timeout=5))
        lid = vp["listings"][0]["id"]
        d = json.load(urllib.request.urlopen(f"{base}/api/v1/listings/{lid}", timeout=10))
        leaked = [f for f in _MARKET_INTEL_FIELDS if d.get(f) is not None]
        assert not leaked, f"campos filtrados a público: {leaked}"
        print(f"integración OK (listing {lid}: mercado null para anónimo)")
    except (urllib.error.URLError, TimeoutError):
        print("integración saltada (API local no responde)")
