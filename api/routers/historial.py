from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from api.db import get_pool
from api.dependencies import get_current_user

router = APIRouter()


class HistorialRequest(BaseModel):
    tipo: str  # vista_barrio | simulacion | comparacion
    barrio_id: Optional[int] = None
    metadata: Optional[dict] = None


@router.get("")
async def get_historial(current_user: dict = Depends(get_current_user)):
    pool = get_pool()
    rows = await pool.fetch(
        """
        SELECT h.id, h.tipo, h.barrio_id, h.metadata, h.created_at,
               b.nombre AS barrio_nombre, b.comuna
        FROM historial h
        LEFT JOIN raw.barrios b ON h.barrio_id = b.id
        WHERE h.usuario_id = $1
        ORDER BY h.created_at DESC
        LIMIT 20
        """,
        current_user["id"],
    )
    result = []
    for r in rows:
        d = dict(r)
        # metadata is already a dict from JSONB
        result.append(d)
    return result


@router.post("", status_code=201)
async def add_historial(req: HistorialRequest, current_user: dict = Depends(get_current_user)):
    pool = get_pool()
    import json
    metadata_json = json.dumps(req.metadata) if req.metadata else None
    row = await pool.fetchrow(
        """
        INSERT INTO historial (usuario_id, tipo, barrio_id, metadata)
        VALUES ($1, $2, $3, $4::jsonb)
        RETURNING id, tipo, barrio_id, created_at
        """,
        current_user["id"], req.tipo, req.barrio_id, metadata_json,
    )
    return dict(row)
