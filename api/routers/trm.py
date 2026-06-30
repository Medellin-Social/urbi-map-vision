"""TRM endpoint — canonical COP/USD rate for the frontend (cards/drawer/filter)."""
from fastapi import APIRouter, Response

from api.config import USD_TO_COP
from api.db import get_pool

router = APIRouter()


@router.get("")
async def get_trm(response: Response):
    """Current TRM (COP per USD) from public.trm; falls back to config if absent."""
    valor = float(USD_TO_COP)
    vigencia = None
    try:
        row = await get_pool().fetchrow(
            "SELECT valor::float8 AS valor, vigencia::text AS vigencia FROM public.trm WHERE id = 1"
        )
        if row and row["valor"]:
            valor = float(row["valor"])
            vigencia = row["vigencia"]
    except Exception:
        pass  # keep config fallback — never break the map over the rate
    response.headers["Cache-Control"] = "public, max-age=3600"
    return {"valor": valor, "vigencia": vigencia}
