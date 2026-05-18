from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.db import get_pool
from api.dependencies import get_current_user

router = APIRouter()


class FavoritoRequest(BaseModel):
    barrio_id: int
    nota: Optional[str] = None


@router.get("")
async def list_favoritos(current_user: dict = Depends(get_current_user)):
    pool = get_pool()
    rows = await pool.fetch(
        """
        SELECT f.id, f.barrio_id, f.nota, f.created_at,
               b.nombre, b.comuna, b.municipio,
               bm.precio_venta_m2_p50, bm.yield_bruto,
               sc.score_corto, sc.score_mediano, sc.score_largo,
               sc.perfil_recomendado
        FROM favoritos f
        JOIN raw.barrios b ON f.barrio_id = b.id
        LEFT JOIN analytics.barrios_mercado bm ON f.barrio_id = bm.barrio_id
        LEFT JOIN analytics.barrios_score_consolidado sc ON f.barrio_id = sc.barrio_id
        WHERE f.usuario_id = $1
        ORDER BY f.created_at DESC
        """,
        current_user["id"],
    )
    return [dict(r) for r in rows]


@router.post("", status_code=201)
async def add_favorito(req: FavoritoRequest, current_user: dict = Depends(get_current_user)):
    pool = get_pool()
    try:
        row = await pool.fetchrow(
            """
            INSERT INTO favoritos (usuario_id, barrio_id, nota)
            VALUES ($1, $2, $3)
            ON CONFLICT (usuario_id, barrio_id) DO UPDATE SET nota = EXCLUDED.nota
            RETURNING *
            """,
            current_user["id"], req.barrio_id, req.nota,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return dict(row)


@router.delete("/{barrio_id}", status_code=204)
async def remove_favorito(barrio_id: int, current_user: dict = Depends(get_current_user)):
    pool = get_pool()
    deleted = await pool.fetchval(
        "DELETE FROM favoritos WHERE usuario_id = $1 AND barrio_id = $2 RETURNING id",
        current_user["id"], barrio_id,
    )
    if deleted is None:
        raise HTTPException(status_code=404, detail="Favorito no encontrado")
