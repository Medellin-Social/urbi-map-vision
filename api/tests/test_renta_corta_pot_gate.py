"""Gate POT renta corta (nuevo POT Medellín 2026): solo alta/media mixtura, solo Medellín.

El grano legal real es por predio; este veredicto es a nivel barrio y bloquea solo
donde NINGÚN predio podría ser legal (barrio sin alta/media mixtura) o fuera de Medellín
(sin dato POT → conservador).
"""
from api.routers.calculadora import (
    renta_corta_verdict,
    _RENTA_CORTA_BLOQUEO_RESIDENCIAL,
    _RENTA_CORTA_BLOQUEO_SIN_DATO,
)


def test_medellin_con_mixtura_apto():
    apto, msg = renta_corta_verdict("MEDELLIN", True)
    assert apto is True and msg is None


def test_medellin_sin_mixtura_bloqueado_residencial():
    apto, msg = renta_corta_verdict("MEDELLIN", False)
    assert apto is False and msg == _RENTA_CORTA_BLOQUEO_RESIDENCIAL


def test_fuera_de_medellin_bloqueado_sin_dato():
    # Aunque (hipotéticamente) tuviera mixtura, el POT no aplica fuera de Medellín.
    apto, msg = renta_corta_verdict("SABANETA", True)
    assert apto is False and msg == _RENTA_CORTA_BLOQUEO_SIN_DATO


def test_municipio_nulo_o_vacio_conservador():
    for m in (None, "", "  "):
        apto, msg = renta_corta_verdict(m, True)
        assert apto is False and msg == _RENTA_CORTA_BLOQUEO_SIN_DATO


def test_case_insensitive_medellin():
    assert renta_corta_verdict("medellin", True)[0] is True
    assert renta_corta_verdict(" Medellin ", True)[0] is True
