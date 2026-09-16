"""Unit tests for listing state machine — no DB required."""
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from api.services.listing_service import EstadoError, transition


def _l(estado, published_at=None):
    # Datos mínimos completos por defecto: borrador→en_revision valida completitud
    # (paso 6). Los tests de otras transiciones solo miran estado/published_at.
    return SimpleNamespace(
        estado=estado, published_at=published_at,
        tipo_inmueble="apartamento", operacion="venta", precio=350_000_000,
        geom="POINT(-75.5 6.2)", barrio="Laureles", municipio="Medellín",
        area_m2=80, titulo="Apto", fotos_portada=1, habitaciones=3, banos=2,
    )


# ── Valid transitions ──────────────────────────────────────────────────────────

def test_borrador_to_en_revision():
    l = _l("borrador")
    transition(l, "en_revision")
    assert l.estado == "en_revision"


def test_en_revision_to_publicado_sets_published_at():
    l = _l("en_revision")
    transition(l, "publicado")
    assert l.estado == "publicado"
    assert isinstance(l.published_at, datetime)


def test_borrador_to_publicado_directo_sets_published_at():
    """"Publica primero, verifica después" (commit 42267d3): borrador→publicado
    es directo, sin pasar por en_revision."""
    l = _l("borrador")
    transition(l, "publicado")
    assert l.estado == "publicado"
    assert isinstance(l.published_at, datetime)


def test_en_revision_to_rechazado():
    l = _l("en_revision")
    transition(l, "rechazado")
    assert l.estado == "rechazado"


def test_rechazado_to_borrador():
    l = _l("rechazado")
    transition(l, "borrador")
    assert l.estado == "borrador"


def test_publicado_to_pausado():
    ts = datetime(2025, 1, 1, tzinfo=timezone.utc)
    l = _l("publicado", published_at=ts)
    transition(l, "pausado")
    assert l.estado == "pausado"


def test_pausado_to_publicado():
    ts = datetime(2025, 1, 1, tzinfo=timezone.utc)
    l = _l("pausado", published_at=ts)
    transition(l, "publicado")
    assert l.estado == "publicado"


def test_publicado_to_cerrado():
    l = _l("publicado", published_at=datetime.now(timezone.utc))
    transition(l, "cerrado")
    assert l.estado == "cerrado"


def test_pausado_to_cerrado():
    l = _l("pausado", published_at=datetime.now(timezone.utc))
    transition(l, "cerrado")
    assert l.estado == "cerrado"


def test_published_at_not_overwritten_on_reactivation():
    """Reactivar pausado→publicado no pisa published_at original."""
    ts = datetime(2025, 1, 1, tzinfo=timezone.utc)
    l = _l("pausado", published_at=ts)
    transition(l, "publicado")
    assert l.published_at == ts


# ── Invalid transitions ────────────────────────────────────────────────────────

def test_borrador_to_cerrado_invalid():
    with pytest.raises(EstadoError):
        transition(_l("borrador"), "cerrado")


def test_en_revision_to_pausado_invalid():
    with pytest.raises(EstadoError):
        transition(_l("en_revision"), "pausado")


def test_publicado_to_borrador_invalid():
    with pytest.raises(EstadoError):
        transition(_l("publicado", datetime.now(timezone.utc)), "borrador")


def test_cerrado_is_terminal():
    for dest in ("borrador", "en_revision", "publicado", "rechazado", "pausado"):
        with pytest.raises(EstadoError):
            transition(_l("cerrado"), dest)


def test_error_message_contains_states():
    with pytest.raises(EstadoError, match="publicado.*borrador"):
        transition(_l("publicado", datetime.now(timezone.utc)), "borrador")
