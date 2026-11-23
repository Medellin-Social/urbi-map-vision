"""El bucket de antigüedad del form → int para la columna SMALLINT antiguedad_anios.
Regresión: pasar el bucket string ('0-5', '+20', 'remodelado') reventaba el INSERT."""
from datetime import date

from api.routers.listings_propios import _antiguedad_anios


def test_buckets_map_to_int():
    assert _antiguedad_anios("0-5") == 3
    assert _antiguedad_anios("5-10") == 7
    assert _antiguedad_anios("10-20") == 15
    assert _antiguedad_anios("+20") == 25


def test_non_numeric_and_empty_are_none():
    assert _antiguedad_anios("remodelado") is None
    assert _antiguedad_anios("") is None
    assert _antiguedad_anios(None) is None


def test_exact_year_wins_over_bucket():
    assert _antiguedad_anios("+20", date.today().year - 4) == 4  # año exacto manda
    assert _antiguedad_anios("0-5", 1700) == 3   # año fuera de rango → cae al bucket


def test_direct_number_tolerated():
    assert _antiguedad_anios("8") == 8


def test_never_returns_str():
    for v in ["0-5", "+20", "remodelado", "8", "", None]:
        assert not isinstance(_antiguedad_anios(v), str)
