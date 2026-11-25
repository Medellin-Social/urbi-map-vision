from api.utils.ttl_cache import TTLCache


def test_hit_miss_y_expiracion(monkeypatch):
    t = [100.0]
    monkeypatch.setattr("api.utils.ttl_cache.time.monotonic", lambda: t[0])
    c = TTLCache(ttl=30, maxsize=2)
    assert c.get("a") is None
    c.set("a", 1)
    assert c.get("a") == 1
    t[0] += 31
    assert c.get("a") is None


def test_tope_de_tamano():
    c = TTLCache(ttl=30, maxsize=2)
    c.set("a", 1); c.set("b", 2); c.set("c", 3)
    assert c.get("a") is None and c.get("b") == 2 and c.get("c") == 3
