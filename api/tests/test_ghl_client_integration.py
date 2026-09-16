"""Integración real contra GHL — prueba los dos lados: push (nuestra DB →
GHL) y lectura de vuelta (GET a GHL) para confirmar que lo que se mandó es
lo que quedó guardado allá.

Pega contra la location real de GHL (la misma que usa la app en prod), por
eso usa solo registros marcados 'pytest-ghl-'/'Pytest GHL' y los borra al
final (local + ghl_object_mapping). El objeto en sí queda huérfano del lado
GHL — no hay DELETE en el contrato probado (ver PDF §20) — igual que los
"Test Records" documentados en §19 del handoff.

Se salta solo si faltan credenciales (CI sin GHL_PRIVATE_TOKEN/GHL_LOCATION_ID).

    pytest -m require_db api/tests/test_ghl_client_integration.py -v
"""
import os
import uuid

import asyncpg
import httpx
import pytest
import pytest_asyncio

from api.utils import ghl_client

pytestmark = [
    pytest.mark.require_db,
    pytest.mark.skipif(
        not ghl_client.is_configured(),
        reason="GHL_PRIVATE_TOKEN/GHL_LOCATION_ID no configurados en .env",
    ),
]


@pytest_asyncio.fixture
async def db():
    conn = await asyncpg.connect(os.environ["DATABASE_URL"])
    yield conn
    await conn.execute("DELETE FROM listing WHERE slug LIKE 'pytest-ghl-%'")
    await conn.execute("DELETE FROM tiendas WHERE nombre LIKE 'Pytest GHL%'")
    await conn.execute("DELETE FROM agency WHERE nombre LIKE 'Pytest GHL%'")
    await conn.execute(
        "DELETE FROM ghl_object_mapping WHERE internal_object_id IN ("
        "  SELECT id::text FROM listing WHERE slug LIKE 'pytest-ghl-%'"
        "  UNION SELECT id::text FROM tiendas WHERE nombre LIKE 'Pytest GHL%'"
        "  UNION SELECT id::text FROM agency WHERE nombre LIKE 'Pytest GHL%'"
        ")"
    )
    await conn.close()


async def _get_from_ghl(path: str) -> dict:
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(
            f"{ghl_client._BASE_URL}{path}",
            headers=ghl_client._headers(),
            params={"locationId": ghl_client._GHL_LOCATION_ID},
        )
    r.raise_for_status()
    return r.json()


async def test_sync_listing_push_and_readback(client, db):
    listing_id = str(uuid.uuid4())
    slug = f"pytest-ghl-{listing_id[:8]}"
    await db.execute(
        """
        INSERT INTO listing (id, slug, geom, operacion, precio, tipo_inmueble, direccion_aprox)
        VALUES ($1, $2, ST_GeomFromText('POINT(-75.57 6.24)', 4326), 'venta', 100000000, 'apartamento', 'Calle Pytest 123')
        """,
        listing_id, slug,
    )

    ghl_id = await ghl_client.sync_listing(listing_id)
    assert ghl_id, "sync_listing no devolvió ghl_object_id — revisar warning logueado por push_listing_to_ghl"

    row = await db.fetchrow(
        "SELECT sync_status FROM ghl_object_mapping WHERE object_type = 'listing' AND internal_object_id = $1",
        listing_id,
    )
    assert row["sync_status"] == "synced"

    remote = await _get_from_ghl(f"/objects/{ghl_client._LISTING_OBJECT_KEY}/records/{ghl_id}")
    assert remote["record"]["properties"]["operation"] == "sale"

    # Update: mismo listing, precio nuevo -> debe reusar el ghl_id existente (PUT, no POST).
    await db.execute("UPDATE listing SET precio = 200000000 WHERE id = $1", listing_id)
    ghl_id_2 = await ghl_client.sync_listing(listing_id)
    assert ghl_id_2 == ghl_id

    remote2 = await _get_from_ghl(f"/objects/{ghl_client._LISTING_OBJECT_KEY}/records/{ghl_id}")
    assert remote2["record"]["properties"]["price"] == 200000000


async def test_sync_tienda_push_and_readback(client, db):
    tienda_id = await db.fetchval(
        "INSERT INTO tiendas (nombre) VALUES ('Pytest GHL Tienda') RETURNING id"
    )

    ghl_id = await ghl_client.sync_tienda(tienda_id)
    assert ghl_id, "sync_tienda no devolvió ghl_object_id — revisar warning logueado por push_tienda_to_ghl"

    remote = await _get_from_ghl(f"/businesses/{ghl_id}")
    assert remote["business"]["name"] == "Pytest GHL Tienda"


async def test_sync_agency_push_and_readback(client, db):
    agency_id = await db.fetchval(
        "INSERT INTO agency (nombre) VALUES ('Pytest GHL Agency') RETURNING id"
    )

    ghl_id = await ghl_client.sync_agency(str(agency_id))
    assert ghl_id, "sync_agency no devolvió ghl_object_id — revisar warning logueado por push_agency_to_ghl"

    remote = await _get_from_ghl(f"/businesses/{ghl_id}")
    assert remote["business"]["name"] == "Pytest GHL Agency"
