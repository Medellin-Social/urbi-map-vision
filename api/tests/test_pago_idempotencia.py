"""P0: zona con lock por zona; webhook GHL de slot exige pago_ref real."""
import pytest
from unittest.mock import AsyncMock, MagicMock

from api.routers import ghl_webhook as g
from api.services import zona_sponsor_service as z


@pytest.mark.asyncio
@pytest.mark.parametrize("ref", [None, "", "  ", "simulado"])
async def test_slot_webhook_sin_pago_ref_real_da_400(ref):
    payload = {"agent_id": "a", "zona_nivel": "barrio", "zona_codigo": "1", "pago_ref": ref}
    with pytest.raises(g.HTTPException) as ei:
        await g._activar_slot_realtor_preferido(payload)
    assert ei.value.status_code == 400


@pytest.mark.asyncio
async def test_asignar_zona_toma_advisory_lock_antes_de_chequear(monkeypatch):
    calls = []
    conn = MagicMock()
    async def execute(sql, *a): calls.append(sql)
    conn.execute = execute
    monkeypatch.setattr(z, "get_or_create_agency", AsyncMock(side_effect=lambda *a: calls.append("agency") or "ag"))
    monkeypatch.setattr(z, "zona_ocupada_por_otro", AsyncMock(return_value=True))
    with pytest.raises(z.ZonaOcupadaError):
        await z.asignar_zona(conn, "x", "barrio", "5")
    assert "pg_advisory_xact_lock" in calls[0] and calls[1] == "agency"


def test_ghl_urls_inseguras_se_descartan():
    ev = g._evento_payload_to_row({"external_url": "javascript:alert(1)", "photo_url": "https://x.com/a.jpg", "event_title": "t"})
    assert "url_externo" not in ev and ev["foto_url"] == "https://x.com/a.jpg"
    tn = g._tienda_payload_to_row({"website": "data:text/html,<script>", "name": "n"})
    assert "website" not in tn and tn["nombre"] == "n"
