"""Unit tests for sponsorship domain logic — no DB required."""
from datetime import date
from types import SimpleNamespace
from uuid import UUID

import pytest

from api.services.sponsorship_service import _vigentes

_HOY = date(2026, 7, 10)

_A1 = UUID("00000000-0000-0000-0000-000000000001")
_A2 = UUID("00000000-0000-0000-0000-000000000002")


def _s(agency_id, zona_nivel="barrio", zona_codigo="42", estado="activa",
        inicio=date(2026, 1, 1), fin=date(2026, 12, 31)):
    return SimpleNamespace(
        agency_id=agency_id,
        zona_nivel=zona_nivel,
        zona_codigo=zona_codigo,
        estado=estado,
        fecha_inicio=inicio,
        fecha_fin=fin,
    )


# ── 0 patrocinadores ──────────────────────────────────────────────────────────

def test_zona_sin_patrocinadores():
    assert _vigentes([], "barrio", "42", _HOY) == []


def test_zona_diferente_no_aparece():
    sps = [_s(_A1, zona_codigo="99")]
    assert _vigentes(sps, "barrio", "42", _HOY) == []


# ── Orden por antigüedad (garantía que consume el asignador) ──────────────────

def test_orden_por_fecha_inicio_ascendente():
    """2 patrocinadores de distinta fecha_inicio → orden ASC (más antiguo [0]).
    Compara LISTA, no set: vigila el ORDER BY que da determinismo al reparto."""
    viejo  = _s(_A2, inicio=date(2026, 1, 1))   # más antiguo
    nuevo  = _s(_A1, inicio=date(2026, 6, 1))
    # aunque entren desordenados, salen por antigüedad
    assert _vigentes([nuevo, viejo], "barrio", "42", _HOY) == [_A2, _A1]


def test_empate_fecha_desempata_por_agency_id():
    """Misma fecha_inicio → desempate estable por agency_id (no no-determinista)."""
    a = _s(_A1, inicio=date(2026, 1, 1))
    b = _s(_A2, inicio=date(2026, 1, 1))
    assert _vigentes([b, a], "barrio", "42", _HOY) == [_A1, _A2]


# ── 1 patrocinador ────────────────────────────────────────────────────────────

def test_un_patrocinador_vigente():
    sps = [_s(_A1)]
    assert _vigentes(sps, "barrio", "42", _HOY) == [_A1]


# ── 2 patrocinadores simultáneos ─────────────────────────────────────────────

def test_dos_patrocinadores_misma_zona():
    sps = [_s(_A1), _s(_A2)]
    result = _vigentes(sps, "barrio", "42", _HOY)
    assert set(result) == {_A1, _A2}


# ── Vencido por fecha — NO debe aparecer ─────────────────────────────────────

def test_vencido_fecha_fin_pasada():
    sps = [_s(_A1, fin=date(2026, 6, 30))]   # terminó antes de _HOY
    assert _vigentes(sps, "barrio", "42", _HOY) == []


def test_no_iniciado_aun():
    sps = [_s(_A1, inicio=date(2026, 8, 1))]  # todavía no empieza
    assert _vigentes(sps, "barrio", "42", _HOY) == []


# ── Cancelado — NO debe aparecer ─────────────────────────────────────────────

def test_cancelado_no_aparece():
    sps = [_s(_A1, estado="cancelada")]
    assert _vigentes(sps, "barrio", "42", _HOY) == []


def test_vencido_estado_no_aparece():
    sps = [_s(_A1, estado="vencida")]
    assert _vigentes(sps, "barrio", "42", _HOY) == []


# ── Bordes de fecha ───────────────────────────────────────────────────────────

def test_primer_dia_vigente():
    sps = [_s(_A1, inicio=_HOY, fin=_HOY)]
    assert _vigentes(sps, "barrio", "42", _HOY) == [_A1]


def test_ultimo_dia_vigente():
    sps = [_s(_A1, inicio=date(2026, 1, 1), fin=_HOY)]
    assert _vigentes(sps, "barrio", "42", _HOY) == [_A1]


# ── Niveles distintos ─────────────────────────────────────────────────────────

def test_nivel_comuna_filtrado_correcto():
    sps = [
        _s(_A1, zona_nivel="barrio",    zona_codigo="42"),
        _s(_A2, zona_nivel="comuna",    zona_codigo="Laureles"),
    ]
    assert _vigentes(sps, "comuna", "Laureles", _HOY) == [_A2]


def test_nivel_municipio():
    sps = [_s(_A1, zona_nivel="municipio", zona_codigo="Medellín")]
    assert _vigentes(sps, "municipio", "Medellín", _HOY) == [_A1]


# ── Mix: activo + cancelado en misma zona ────────────────────────────────────

def test_activo_y_cancelado_misma_zona():
    sps = [_s(_A1, estado="activa"), _s(_A2, estado="cancelada")]
    assert _vigentes(sps, "barrio", "42", _HOY) == [_A1]
