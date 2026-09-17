import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scraping" / "noticias"))

from rss_scraper import es_noticia_positiva, es_noticia_relevante  # noqa: E402


def test_bloquea_politica():
    assert not es_noticia_positiva("Concejo municipal debate curul del alcalde")


def test_bloquea_economia():
    assert not es_noticia_positiva("La economía de Medellín crece 3% según el dólar")


def test_bloquea_otros_paises():
    assert not es_noticia_positiva("Venezuela y Ecuador firman acuerdo comercial")


def test_no_bloquea_gastronomia_con_chile():
    assert es_noticia_positiva("Festival gastronómico ofrece platos con chile en Medellín")


def test_permite_noticia_cultural():
    titulo = "Festival de música y arte llega a Medellín este fin de semana"
    assert es_noticia_positiva(titulo)
    assert es_noticia_relevante(titulo)
