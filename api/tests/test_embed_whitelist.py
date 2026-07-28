"""Whitelist de embed (tour 3D/video) — sanea URLs en el insert de listings propios."""
from api.routers.listings_propios import _safe_embed_url


def test_permite_hosts_whitelist():
    for u in [
        "https://my.matterport.com/show/?m=abc",
        "https://kuula.co/share/xyz",
        "https://www.youtube.com/watch?v=ID",
        "https://vimeo.com/123",
    ]:
        assert _safe_embed_url(u) == u


def test_bloquea_hosts_no_whitelist():
    assert _safe_embed_url("https://evil.com/x") is None
    assert _safe_embed_url("https://matterport.com.evil.com/x") is None  # sufijo falso
    assert _safe_embed_url("javascript:alert(1)") is None
    assert _safe_embed_url("no-es-url") is None


def test_vacio_none():
    assert _safe_embed_url(None) is None
    assert _safe_embed_url("") is None
