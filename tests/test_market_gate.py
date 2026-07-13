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
from api.routers.listings import _MARKET_INTEL_FIELDS, _gate_market_fields

SAMPLE = {
    "precio_cop": 100, "area_m2": 50.0, "fotos": ["x"], "descripcion": "d",
    "estrato_real": 4, "precio_m2": 2, "habitaciones": 3, "dias_en_mercado": 12,
    **{f: 1 for f in _MARKET_INTEL_FIELDS},
}
PUBLICOS = ("precio_cop", "area_m2", "fotos", "descripcion", "estrato_real",
            "precio_m2", "habitaciones", "dias_en_mercado")


def test_publico_nullea_mercado():
    out = _gate_market_fields(dict(SAMPLE), agente=False)
    assert all(out[f] is None for f in _MARKET_INTEL_FIELDS), "mercado debe ir null"
    assert all(out[f] == SAMPLE[f] for f in PUBLICOS), "públicos intactos"


def test_agente_conserva_todo():
    out = _gate_market_fields(dict(SAMPLE), agente=True)
    assert all(out[f] == 1 for f in _MARKET_INTEL_FIELDS), "agente recibe todo"


if __name__ == "__main__":
    test_publico_nullea_mercado()
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
