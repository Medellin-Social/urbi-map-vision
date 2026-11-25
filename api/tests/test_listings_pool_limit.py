"""El listado nunca usa más de 8 conexiones a la vez (pool = 10)."""
import asyncio

import pytest

from api.routers import listings as L


@pytest.mark.asyncio
async def test_limited_caps_concurrency():
    activos = maximo = 0

    async def consulta():
        nonlocal activos, maximo
        activos += 1
        maximo = max(maximo, activos)
        await asyncio.sleep(0.01)
        activos -= 1

    await asyncio.gather(*[L._limited(consulta()) for _ in range(40)])
    assert maximo == 8
