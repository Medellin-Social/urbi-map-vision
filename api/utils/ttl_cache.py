"""Cache en memoria con TTL y tope de tamaño (por worker).

Para respuestas públicas pesadas (/viewport, /barrios) que solo cambian cuando
`refresh_listings_cache` reconstruye la tabla (cada hora). TTL corto = datos
frescos y cada worker absorbe las ráfagas idénticas sin tocar la DB.
"""
import time
from collections import OrderedDict
from typing import Any, Hashable


class TTLCache:
    def __init__(self, ttl: float, maxsize: int = 256) -> None:
        self.ttl = ttl
        self.maxsize = maxsize
        self._d: OrderedDict[Hashable, tuple[float, Any]] = OrderedDict()

    def get(self, key: Hashable) -> Any | None:
        item = self._d.get(key)
        if item is None:
            return None
        ts, val = item
        if time.monotonic() - ts > self.ttl:
            self._d.pop(key, None)
            return None
        self._d.move_to_end(key)
        return val

    def set(self, key: Hashable, val: Any) -> None:
        self._d[key] = (time.monotonic(), val)
        self._d.move_to_end(key)
        while len(self._d) > self.maxsize:
            self._d.popitem(last=False)

    def clear(self) -> None:
        self._d.clear()
