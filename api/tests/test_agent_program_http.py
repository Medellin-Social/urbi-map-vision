"""Flujo HTTP del Programa de agentes contra la DB local. Corre con: pytest -m require_db"""
import uuid

import bcrypt
import pytest

from api.dependencies import get_current_user
from api.main import app
from api.routers.admin import require_admin

pytestmark = [pytest.mark.require_db, pytest.mark.asyncio]

ADMIN_PW = "admin-pw-test"


@pytest.fixture
async def ctx(client, monkeypatch):
    from api.db import get_pool
    pool = get_pool()
    tag = uuid.uuid4().hex[:8]
    monkeypatch.setenv("ENABLE_SIMULATED_PAYMENTS", "1")
    for k in ("GHL_LINK_REGISTRO", "GHL_LINK_CERT_CUOTA", "GHL_LINK_CERT_MENSUAL",
              "GHL_LINK_CERT_ILIMITADO", "GHL_LINK_ANUNCIO"):
        monkeypatch.delenv(k, raising=False)
    pw = bcrypt.hashpw(ADMIN_PW.encode(), bcrypt.gensalt()).decode()
    uid = await pool.fetchval(
        "INSERT INTO usuarios (email, password_hash, email_verificado) VALUES ($1, 'x', true) RETURNING id",
        f"ag-{tag}@example.com")
    admin_id = await pool.fetchval(
        "INSERT INTO usuarios (email, password_hash, email_verificado) VALUES ($1, $2, true) RETURNING id",
        f"adm-{tag}@example.com", pw)
    aid = await pool.fetchval(
        "INSERT INTO agent (usuario_id, email, nombre, telefono) VALUES ($1, $2, 'Agente Test', '3001112233') "
        "RETURNING id::text", uid, f"ag-{tag}@example.com")
    urls = [r["url"] for r in await pool.fetch(
        "SELECT url FROM staging.stg_listings_unificado WHERE fuente <> 'propio' "
        "AND NOT EXISTS (SELECT 1 FROM listing_representacion r WHERE r.listing_url = url) LIMIT 7")]
    app.dependency_overrides[get_current_user] = lambda: {"id": uid, "email": f"ag-{tag}@example.com"}
    app.dependency_overrides[require_admin] = lambda: {"id": admin_id, "email": f"adm-{tag}@example.com"}
    try:
        yield {"pool": pool, "aid": aid, "uid": uid, "urls": urls, "tag": tag}
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_admin, None)
        await pool.execute("DELETE FROM agent WHERE id = $1::uuid", aid)
        await pool.execute("DELETE FROM leads_servicio WHERE nombre = $1", f"Lead {tag}")
        await pool.execute("DELETE FROM usuarios WHERE id = ANY($1::int[])", [uid, admin_id])


async def _pagar(client, producto, listing_url=None):
    body = {"producto": producto, **({"listing_url": listing_url} if listing_url else {})}
    r = await client.post("/api/v1/agent-program/checkout", json=body)
    assert r.status_code == 200, r.text
    assert r.json()["modo"] == "simulado" and r.json()["moneda"] == "USD"
    r = await client.post("/api/v1/agent-program/confirmar-simulado", json=body)
    assert r.status_code == 200, r.text
    return r.json()


async def test_flujo_completo(client, ctx):
    pool, aid, urls = ctx["pool"], ctx["aid"], ctx["urls"]
    assert len(urls) >= 7, "la DB local necesita anuncios en staging.stg_listings_unificado"
    pre = "/api/v1/agent-program"

    # 1) pendiente: solo puede pagar registro
    r = await client.post(f"{pre}/checkout", json={"producto": "cert_cuota"})
    assert r.status_code == 403
    await _pagar(client, "registro")
    r = await client.post(f"{pre}/checkout", json={"producto": "registro"})
    assert r.status_code == 409  # no se cobra dos veces

    # 2) admin aprueba la cuenta
    await pool.execute("UPDATE agent SET estado = 'activo' WHERE id = $1::uuid", aid)
    est = (await client.get(f"{pre}/mi-estado")).json()
    assert est["registrado"] is True and est["precios_usd"]["registro"] == 25

    # 3) vincular 6 anuncios
    for u in urls[:6]:
        r = await client.post(f"{pre}/representacion", json={"listing_url": u, "relacion": "Exclusiva de venta"})
        assert r.status_code == 201, r.text
    r = await client.post(f"{pre}/representacion", json={"listing_url": urls[0], "relacion": "otra vez"})
    assert r.status_code == 409

    # 4) certificación: solicitud → evidencia → admin aprueba → pagos → insignia
    r = await client.post(f"{pre}/certificacion", json={"anios_experiencia": 6, "n_transacciones": 40,
                                                         "documentos": ["https://drive.example.com/cv"]})
    assert r.status_code == 201 and "Solicitud recibida" in r.json()["mensaje"]
    r = await client.post(f"{pre}/certificacion", json={"anios_experiencia": 6, "n_transacciones": 40})
    assert r.status_code == 409
    r = await client.patch(f"{pre}/certificacion/evidencia-examen",
                           json={"examen_evidencia_url": "https://ease.example.com/resultado/1"})
    assert r.json()["examen_estado"] == "enviado"
    cid = (await client.get(f"{pre}/mi-estado")).json()["certificacion"]["id"]
    r = await client.post(f"{pre}/admin/certificaciones/{cid}/resolver",
                          json={"campo": "examen", "decision": "aprobado", "password": "mal"})
    assert r.status_code == 403
    for campo in ("examen", "revision"):
        r = await client.post(f"{pre}/admin/certificaciones/{cid}/resolver",
                              json={"campo": campo, "decision": "aprobado", "password": ADMIN_PW})
        assert r.status_code == 200, r.text
    assert r.json()["certificado"] is False  # sin pagos no hay insignia
    await _pagar(client, "cert_cuota")
    res = await _pagar(client, "cert_mensual")
    assert res["certificado"] is True

    # 5) cobertura: 5 incluidos, el 6º pide $5
    est = (await client.get(f"{pre}/mi-estado")).json()
    assert est["cupos_usados"] == 5 and est["anuncios_sin_cobertura"] == 1
    sexto = next(x for x in est["representaciones"] if x["cobertura"] == "ninguna")["listing_url"]
    await _pagar(client, "anuncio", sexto)
    est = (await client.get(f"{pre}/mi-estado")).json()
    assert est["anuncios_sin_cobertura"] == 0

    # 6) admin aprueba la representación; un segundo agente no puede tomar el mismo anuncio
    reps = (await client.get(f"{pre}/admin/representaciones")).json()
    mia = next(x for x in reps if x["agent_id"] == aid)
    r = await client.post(f"{pre}/admin/representaciones/{mia['id']}/resolver", json={"decision": "aprobado"})
    assert r.status_code == 200
    r = await client.post(f"{pre}/admin/representaciones/{mia['id']}/resolver", json={"decision": "aprobado"})
    assert r.status_code == 404

    # 7) el anuncio muestra al representante; el directorio lo lista como certificado
    map_id = await pool.fetchval("SELECT ('x'||substr(md5($1::text),1,8))::bit(32)::int", mia["listing_url"])
    r = await client.get(f"/api/v1/listings/{map_id}/agente")
    rep = r.json()["representante"]
    assert rep and rep["id"] == aid and "certified" in rep["tipos"]
    dirs = (await client.get("/api/v1/listings/agentes")).json()
    yo = next(x for x in dirs if x["id"] == aid)
    assert "certified" in yo["tipos"] and yo["preferente"] == []
    perfil = (await client.get(f"/api/v1/listings/agentes/{aid}")).json()
    assert any(x["url"] == mia["listing_url"] for x in perfil["representados"])
    # un anuncio sin representación no muestra agente registrado
    otro = await pool.fetchval("SELECT ('x'||substr(md5($1::text),1,8))::bit(32)::int", urls[6])
    assert (await client.get(f"/api/v1/listings/{otro}/agente")).json()["representante"] is None


async def test_registro_con_agencia(client, ctx, monkeypatch):
    from api.dependencies import get_current_user as gcu
    pool = ctx["pool"]
    uid2 = await pool.fetchval(
        "INSERT INTO usuarios (email, password_hash, email_verificado) VALUES ($1, 'x', true) RETURNING id",
        f"reg-{ctx['tag']}@example.com")
    app.dependency_overrides[gcu] = lambda: {"id": uid2, "email": f"reg-{ctx['tag']}@example.com",
                                             "email_verificado": True}
    try:
        r = await client.post("/api/v1/suscripciones/agente/registro", json={
            "nombre": "Reg Test", "telefono": "3005556677", "bio": "Agente en Laureles",
            "anios_experiencia": 4, "zonas_servicio": ["Laureles", "El Poblado"],
            "agencia_tipo": "agencia", "agencia_nombre": f"Agencia {ctx['tag']}"})
        assert r.status_code == 200, r.text
        assert r.json()["estado"] == "pendiente"
        row = await pool.fetchrow(
            "SELECT a.bio, a.zonas_servicio, ag.nombre, ag.verificada FROM agent a "
            "JOIN agency_member am ON am.agent_id = a.id JOIN agency ag ON ag.id = am.agency_id "
            "WHERE a.usuario_id = $1", uid2)
        assert row["zonas_servicio"] == ["Laureles", "El Poblado"] and row["verificada"] is False
        r = await client.post("/api/v1/suscripciones/agente/registro", json={
            "nombre": "Reg Test", "telefono": "3005556677", "agencia_tipo": "agencia"})
        assert r.status_code == 422
    finally:
        ags = [r["agency_id"] for r in await pool.fetch(
            "SELECT am.agency_id FROM agency_member am JOIN agent a ON a.id = am.agent_id WHERE a.usuario_id = $1",
            uid2)]
        await pool.execute("DELETE FROM agent WHERE usuario_id = $1", uid2)
        await pool.execute("DELETE FROM agency WHERE id = ANY($1::uuid[])", ags)
        await pool.execute("DELETE FROM usuarios WHERE id = $1", uid2)


async def test_lead_servicio(client, ctx):
    r = await client.post("/api/v1/leads/servicio", json={
        "tipo": "property_manager", "nombre": f"Lead {ctx['tag']}", "telefono": "300 123 4567",
        "barrio": "Laureles", "consentimiento": True})
    assert r.status_code == 201, r.text
    r = await client.post("/api/v1/leads/servicio", json={
        "tipo": "realtor_casa", "nombre": f"Lead {ctx['tag']}", "consentimiento": True})
    assert r.status_code == 422  # sin contacto
    r = await client.post("/api/v1/leads/servicio", json={
        "tipo": "administracion", "nombre": f"Lead {ctx['tag']}", "email": "a@b.co", "consentimiento": False})
    assert r.status_code == 422
    leads = (await client.get("/api/v1/agent-program/admin/leads-servicio")).json()
    assert any(x["nombre"] == f"Lead {ctx['tag']}" and x["tipo"] == "property_manager" for x in leads)
