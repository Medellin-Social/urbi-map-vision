"""refresh_listings_cache: un solo worker refresca a la vez (advisory lock)."""
import pytest

from api import cache


class _Conn:
    def __init__(self, got):
        self.got, self.calls = got, []

    async def fetchval(self, sql, *a):
        self.calls.append(sql)
        return self.got

    async def execute(self, sql, *a):
        self.calls.append(sql)


class _Pool:
    def __init__(self, conn):
        self.conn = conn

    def acquire(self):
        conn = self.conn

        class _Ctx:
            async def __aenter__(self_):
                return conn

            async def __aexit__(self_, *e):
                return False
        return _Ctx()


@pytest.mark.asyncio
async def test_omite_si_otro_worker_tiene_el_lock(monkeypatch):
    hecho = []

    async def impl(pool):
        hecho.append(1)
    monkeypatch.setattr(cache, "_refresh_listings_cache_impl", impl)
    conn = _Conn(got=False)
    await cache.refresh_listings_cache(_Pool(conn))
    assert hecho == [] and not any("unlock" in c for c in conn.calls)


@pytest.mark.asyncio
async def test_corre_y_libera_el_lock_incluso_si_falla(monkeypatch):
    async def impl(pool):
        raise RuntimeError("boom")
    monkeypatch.setattr(cache, "_refresh_listings_cache_impl", impl)
    conn = _Conn(got=True)
    with pytest.raises(RuntimeError):
        await cache.refresh_listings_cache(_Pool(conn))
    assert any("pg_advisory_unlock" in c for c in conn.calls)
