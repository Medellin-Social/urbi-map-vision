"""/aplicar (EmailStr, límites, dedup 24 h) y POST de visitas (URL real, dedup)."""
import pytest

pytestmark = [pytest.mark.require_db, pytest.mark.asyncio]


async def _limpia():
    from api.db import get_pool
    pool = get_pool()
    await pool.execute("DELETE FROM public.throttle_hits")
    await pool.execute("DELETE FROM public.aplicacion_referidor WHERE email LIKE 'hard_%@example.com'")
    await pool.execute("DELETE FROM public.aplicaciones_pasantia WHERE email LIKE 'hard_%@example.com'")
    return pool


async def test_aplicar_rechaza_email_invalido_y_textos_largos(client):
    await _limpia()
    r = await client.post("/api/v1/afiliados/aplicar", json={"nombre": "A", "email": "no-es-email"})
    assert r.status_code == 422
    r = await client.post("/api/v1/embajadores/aplicar",
                          json={"nombre": "A", "email": "hard_x@example.com", "motivacion": "x" * 5000})
    assert r.status_code == 422


async def test_aplicar_dedup_24h_devuelve_la_misma_solicitud(client):
    await _limpia()
    body = {"nombre": "Hard", "email": "Hard_Dup@example.com"}
    r1 = await client.post("/api/v1/afiliados/aplicar", json=body)
    r2 = await client.post("/api/v1/afiliados/aplicar", json=body)
    assert r1.status_code == r2.status_code == 200
    assert r1.json()["aplicacion_id"] == r2.json()["aplicacion_id"]


async def test_visita_con_url_inexistente_es_404(client):
    await _limpia()
    r = await client.post("/api/v1/visitas", json={"listing_url": "https://no-existe.example/zzz", "sin_agente": True})
    assert r.status_code == 404
