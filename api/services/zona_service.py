"""Domain logic for zone resolution — used by intake, sponsorship, asignador."""
from __future__ import annotations

from typing import Any, TypedDict


class ZonaResuelto(TypedDict, total=False):
    """Stable zone identifiers resolved from geometry.

    ponytail: only barrio_id is stable today (raw.barrios.id PK).
    comuna/municipio would require canonical DANE codes; skipped for now.
    """
    barrio_id: str  # raw.barrios.id::text


async def resolver_zona(geom: Any, pool: Any) -> ZonaResuelto:
    """Resolve stable zone from Point geometry (SRID 4326).

    Uses ST_Contains(raw.barrios.geometry, geom) to find the barrio.
    Returns { barrio_id } if found; raises ValueError if no match.

    geom: WKT or binary Point, SRID 4326 (e.g. 'POINT(-75.5 6.2)')
    pool: asyncpg connection pool
    """
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT b.id::text AS barrio_id
            FROM raw.barrios b
            WHERE ST_Contains(b.geometry, ST_GeomFromText($1, 4326))
            LIMIT 1
            """,
            geom,
        )
    if not row:
        raise ValueError(f"Punto {geom} no cae en ningún barrio conocido")
    return {"barrio_id": row["barrio_id"]}
