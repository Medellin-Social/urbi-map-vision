"""
Runtime-editable financial parameters loaded from raw.parametros_sistema at startup.
Falls back to env vars / hardcoded defaults if the table is missing or empty.

Usage:
    from api import parametros
    tca = parametros.get("USD_TO_COP")

To refresh without restart (e.g. after a manual DB update):
    await parametros.load()
"""
from __future__ import annotations

import os

from api.db import get_pool

_DEFAULTS: dict[str, float] = {
    "USD_TO_COP":     float(os.getenv("USD_TO_COP", "4100")),
    "VAR_ANUAL_DANE": 10.1,
}

_cache: dict[str, float] = {}


async def load() -> None:
    global _cache
    try:
        rows = await get_pool().fetch(
            "SELECT nombre, valor FROM raw.parametros_sistema"
        )
        _cache = {r["nombre"]: float(r["valor"]) for r in rows}
        print(f"[parametros] loaded {len(_cache)} params from DB", flush=True)
    except Exception as exc:
        print(f"[parametros] using defaults — DB load failed: {exc}", flush=True)
        _cache = {}


def get(key: str) -> float:
    return _cache.get(key, _DEFAULTS[key])
