from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.db import get_pool
from api.dependencies import get_current_user

router = APIRouter()


# ── Models ────────────────────────────────────────────────────────────────────

class OnboardingRequest(BaseModel):
    presupuesto: Optional[str] = None          # "$200M-$500M COP"
    presupuesto_min_cop: Optional[int] = None
    presupuesto_max_cop: Optional[int] = None
    objetivo: Optional[str] = None             # airbnb/nomadas/largo_plazo/mixto
    perfil_riesgo: Optional[str] = None        # conservador/moderado/agresivo


class MapConfigRequest(BaseModel):
    zoom_default: Optional[float] = None
    centro_lat: Optional[float] = None
    centro_lng: Optional[float] = None
    capas_visibles: Optional[list[str]] = None
    score_display: Optional[str] = None        # corto/mediano/largo/recomendado
    mostrar_oportunidades: Optional[bool] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_presupuesto(text: str) -> tuple[Optional[int], Optional[int]]:
    """Parse '$200M-$500M COP' → (200_000_000, 500_000_000). Best-effort."""
    import re
    nums = re.findall(r"\d+", text.replace(".", "").replace(",", ""))
    if len(nums) >= 2:
        return int(nums[0]) * 1_000_000, int(nums[1]) * 1_000_000
    if len(nums) == 1:
        v = int(nums[0]) * 1_000_000
        return v, v
    return None, None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/perfil")
async def get_perfil(current_user: dict = Depends(get_current_user)):
    pool = get_pool()
    row = await pool.fetchrow(
        "SELECT * FROM perfil_inversor WHERE usuario_id = $1 ORDER BY id DESC LIMIT 1",
        current_user["id"],
    )
    if row is None:
        return {}
    return dict(row)


@router.post("/onboarding", status_code=201)
async def onboarding(req: OnboardingRequest, current_user: dict = Depends(get_current_user)):
    pool = get_pool()

    pmin = req.presupuesto_min_cop
    pmax = req.presupuesto_max_cop
    if req.presupuesto and (pmin is None or pmax is None):
        pmin, pmax = _parse_presupuesto(req.presupuesto)

    row = await pool.fetchrow(
        """
        INSERT INTO perfil_inversor
            (usuario_id, presupuesto, presupuesto_min_cop, presupuesto_max_cop, objetivo, perfil_riesgo)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (usuario_id) DO UPDATE SET
            presupuesto      = EXCLUDED.presupuesto,
            presupuesto_min_cop = EXCLUDED.presupuesto_min_cop,
            presupuesto_max_cop = EXCLUDED.presupuesto_max_cop,
            objetivo         = EXCLUDED.objetivo,
            perfil_riesgo    = EXCLUDED.perfil_riesgo,
            updated_at       = NOW()
        RETURNING *
        """,
        current_user["id"], req.presupuesto, pmin, pmax, req.objetivo, req.perfil_riesgo,
    )
    return dict(row)


@router.put("/perfil")
async def update_perfil(req: OnboardingRequest, current_user: dict = Depends(get_current_user)):
    return await onboarding(req, current_user)


@router.get("/configuracion_mapa")
async def get_map_config(current_user: dict = Depends(get_current_user)):
    pool = get_pool()
    row = await pool.fetchrow(
        "SELECT * FROM configuracion_mapa WHERE usuario_id = $1", current_user["id"]
    )
    if row is None:
        return {
            "usuario_id": current_user["id"],
            "zoom_default": 12,
            "centro_lat": 6.2442,
            "centro_lng": -75.5812,
            "capas_visibles": ["scores"],
            "score_display": "recomendado",
            "mostrar_oportunidades": False,
        }
    return dict(row)


@router.put("/configuracion_mapa")
async def update_map_config(req: MapConfigRequest, current_user: dict = Depends(get_current_user)):
    pool = get_pool()
    row = await pool.fetchrow(
        """
        INSERT INTO configuracion_mapa
            (usuario_id, zoom_default, centro_lat, centro_lng, capas_visibles, score_display, mostrar_oportunidades)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (usuario_id) DO UPDATE SET
            zoom_default          = COALESCE($2, configuracion_mapa.zoom_default),
            centro_lat            = COALESCE($3, configuracion_mapa.centro_lat),
            centro_lng            = COALESCE($4, configuracion_mapa.centro_lng),
            capas_visibles        = COALESCE($5, configuracion_mapa.capas_visibles),
            score_display         = COALESCE($6, configuracion_mapa.score_display),
            mostrar_oportunidades = COALESCE($7, configuracion_mapa.mostrar_oportunidades),
            updated_at            = NOW()
        RETURNING *
        """,
        current_user["id"],
        req.zoom_default, req.centro_lat, req.centro_lng,
        req.capas_visibles, req.score_display, req.mostrar_oportunidades,
    )
    return dict(row)
