"""GHL webhook receiver — skeleton only, esperando contrato de Talal.

Dirección confirmada 2026-08-27 por entidad (no las 4 son bidireccionales):
  - listing, deal: bidireccional -> este router los recibe, ghl_client.py
    los envía.
  - tienda, evento: SOLO salida (nosotros -> GHL) -> sin handler acá a
    propósito; si GHL manda uno de estos igual, es contrato incumplido, no
    un tipo faltante por implementar.

Todo lo que depende del contrato real (firma del webhook, nombres de campo
del payload) está sin implementar a propósito — mejor un 501 explícito que
adivinar un mapeo de payload y fallar en silencio contra datos reales.

Nada de esto arranca en el startup ni corre nada al importar el módulo — el
crash de la migración 0081 (listing.barrio_id, revertida) fue por tocar el
arranque de la app sin red de seguridad; este router no repite ese patrón,
las excepciones solo ocurren dentro del handler de la request.

Dedup: listing.id es uuid, deals.id es integer — por eso ghl_object_mapping
(migración 0082) guarda internal_object_id como TEXT con object_type como
discriminador, en vez de una tabla de mapeo por entidad.

Loop-prevention (two-way sync): cuando este receptor sí escriba en nuestra
DB, esa escritura NO debe re-emitir un evento hacia GHL — pendiente de
diseñar cuando el contrato de Talal confirme si GHL notifica sus propios
webhooks de "outbound" o si el loop hay que cortarlo acá con un flag interno.

Necesario de Talal antes de implementar upgrade():
  - Firma del webhook (header + algoritmo) -> ghl_client.verificar_webhook
  - Payload de ejemplo real por entidad (listing/deal), para saber los
    nombres de campo exactos del lado GHL
  - Si el mismo endpoint recibe ambas entidades (con un campo tipo/object en
    el payload) o si Talal expone una URL por entidad
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from api.utils import ghl_client

router = APIRouter()

_OUTBOUND_ONLY = {"tienda", "evento"}


async def _upsert_listing_from_ghl(payload: dict) -> None:
    """Target: public.listing (uuid PK). Ver docs/GHL_DB_SCHEMA_FIELDS.pdf
    para la lista completa de columnas — falta el nombre de campo del lado
    GHL para cada una."""
    raise NotImplementedError("ghl_webhook: falta contrato de payload para listing")


async def _upsert_deal_from_ghl(payload: dict) -> None:
    """Target: public.deals (integer PK, FK tienda_id/barrio_id/ciudad_id)."""
    raise NotImplementedError("ghl_webhook: falta contrato de payload para deal")


_HANDLERS = {
    "listing": _upsert_listing_from_ghl,
    "deal": _upsert_deal_from_ghl,
}


@router.post("/ghl")
async def recibir_webhook_ghl(request: Request):
    body = await request.body()
    try:
        event = ghl_client.verificar_webhook(body, dict(request.headers))
    except NotImplementedError as e:
        raise HTTPException(status_code=501, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    object_type = event.get("object_type")
    if object_type in _OUTBOUND_ONLY:
        raise HTTPException(
            status_code=400,
            detail=f"{object_type} es solo outbound (nosotros -> GHL), no se recibe desde GHL",
        )
    handler = _HANDLERS.get(object_type)
    if handler is None:
        raise HTTPException(status_code=400, detail=f"object_type desconocido: {object_type!r}")

    try:
        await handler(event)
    except NotImplementedError as e:
        raise HTTPException(status_code=501, detail=str(e))

    return {"ok": True}
