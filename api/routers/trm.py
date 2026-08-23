"""TRM endpoint — canonical COP/USD (o COP/EUR) rate for the frontend (cards/drawer/filter).

public.trm es multi-moneda desde 2026-08-23 (PK moneda, antes fila única id=1 solo USD).
"""
from fastapi import APIRouter, Query, Response

from api.config import EUR_TO_COP, USD_TO_COP
from api.db import get_pool

router = APIRouter()

_FALLBACK = {"USD": USD_TO_COP, "EUR": EUR_TO_COP}


@router.get("")
async def get_trm(response: Response, moneda: str = Query("USD", pattern="^(USD|EUR)$")):
    """Current rate (COP per `moneda`) from public.trm; falls back to config if absent."""
    valor = float(_FALLBACK[moneda])
    vigencia = None
    try:
        row = await get_pool().fetchrow(
            "SELECT valor::float8 AS valor, vigencia::text AS vigencia FROM public.trm WHERE moneda = $1",
            moneda,
        )
        if row and row["valor"]:
            valor = float(row["valor"])
            vigencia = row["vigencia"]
    except Exception:
        pass  # keep config fallback — never break the map over the rate
    response.headers["Cache-Control"] = "public, max-age=3600"
    return {"moneda": moneda, "valor": valor, "vigencia": vigencia}
