"""Domain logic for zone sponsorships."""
from __future__ import annotations

from datetime import date
from typing import Any, Sequence
from uuid import UUID


def _vigentes(
    sponsorships: Sequence[Any],
    zona_nivel: str,
    zona_codigo: str,
    hoy: date | None = None,
) -> list[UUID]:
    """Pure filter: returns agency_ids from active sponsorships for a zone today.

    sponsorships: iterable of objects/namespaces with fields
        agency_id, zona_nivel, zona_codigo, estado, fecha_inicio, fecha_fin.
    """
    hoy = hoy or date.today()
    return [
        s.agency_id
        for s in sponsorships
        if (
            str(s.zona_nivel) == zona_nivel
            and str(s.zona_codigo) == str(zona_codigo)
            and str(s.estado) == "activa"
            and s.fecha_inicio <= hoy <= s.fecha_fin
        )
    ]


async def patrocinadores_vigentes(
    zona_nivel: str,
    zona_codigo: str,
    pool: Any,
    hoy: date | None = None,
) -> list[str]:
    """Return agency_ids (as str) that actively sponsor a zone today.

    Uses the composite index (zona_nivel, zona_codigo, estado) + date range filter.
    """
    hoy = hoy or date.today()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT agency_id::text
            FROM sponsorship
            WHERE zona_nivel = $1::sponsorship_zona_nivel
              AND zona_codigo = $2
              AND estado      = 'activa'
              AND fecha_inicio <= $3
              AND fecha_fin    >= $3
            """,
            zona_nivel,
            str(zona_codigo),
            hoy,
        )
    return [r["agency_id"] for r in rows]
