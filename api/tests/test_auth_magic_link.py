"""Tests for passwordless login: POST /auth/magic-link (request) and
POST /auth/magic-link/verificar (redeem). All require a live DB — the whole
flow is token-in-DB round trips, nothing to unit-test in isolation.
"""
import pytest
from datetime import datetime, timedelta, timezone


async def _get_token_for_email(email: str) -> str:
    from api.db import get_pool
    pool = get_pool()
    return await pool.fetchval(
        "SELECT token FROM magic_link_tokens WHERE email = $1", email
    )


@pytest.mark.require_db
@pytest.mark.asyncio
async def test_request_magic_link_returns_generic_message(client):
    r = await client.post("/api/v1/auth/magic-link", json={"email": "pytest_magic_any@example.com"})
    assert r.status_code == 200
    assert "message" in r.json()


@pytest.mark.require_db
@pytest.mark.asyncio
async def test_request_magic_link_creates_token_row(client):
    email = "pytest_magic_tokenrow@example.com"
    r = await client.post("/api/v1/auth/magic-link", json={"email": email})
    assert r.status_code == 200

    token = await _get_token_for_email(email)
    assert token is not None


@pytest.mark.require_db
@pytest.mark.asyncio
async def test_verify_magic_link_creates_new_user(client):
    email = "pytest_magic_newuser@example.com"
    await client.post("/api/v1/auth/magic-link", json={"email": email})
    token = await _get_token_for_email(email)

    r = await client.post("/api/v1/auth/magic-link/verificar", json={"token": token})

    assert r.status_code == 200
    data = r.json()
    assert data["user"]["email"] == email
    assert data["user"]["origen_registro"] == "magic_link"
    assert "token" in data and data["token"]


@pytest.mark.require_db
@pytest.mark.asyncio
async def test_verify_magic_link_existing_user_logs_in_same_account(client):
    email = "pytest_magic_existing@example.com"

    await client.post("/api/v1/auth/magic-link", json={"email": email})
    token1 = await _get_token_for_email(email)
    r1 = await client.post("/api/v1/auth/magic-link/verificar", json={"token": token1})
    assert r1.status_code == 200
    user_id_1 = r1.json()["user"]["id"]

    await client.post("/api/v1/auth/magic-link", json={"email": email})
    token2 = await _get_token_for_email(email)
    r2 = await client.post("/api/v1/auth/magic-link/verificar", json={"token": token2})
    assert r2.status_code == 200
    user_id_2 = r2.json()["user"]["id"]

    assert user_id_1 == user_id_2  # same account, no duplicate created


@pytest.mark.require_db
@pytest.mark.asyncio
async def test_verify_magic_link_rejects_unknown_token(client):
    r = await client.post("/api/v1/auth/magic-link/verificar", json={"token": "not-a-real-token"})
    assert r.status_code == 400


@pytest.mark.require_db
@pytest.mark.asyncio
async def test_verify_magic_link_rejects_reused_token(client):
    email = "pytest_magic_reuse@example.com"
    await client.post("/api/v1/auth/magic-link", json={"email": email})
    token = await _get_token_for_email(email)

    r1 = await client.post("/api/v1/auth/magic-link/verificar", json={"token": token})
    assert r1.status_code == 200

    r2 = await client.post("/api/v1/auth/magic-link/verificar", json={"token": token})
    assert r2.status_code == 400


@pytest.mark.require_db
@pytest.mark.asyncio
async def test_verify_magic_link_rejects_expired_token(client):
    from api.db import get_pool
    pool = get_pool()
    email = "pytest_magic_expired@example.com"
    expired_token = "pytest-expired-token-fixed-value"
    expired_at = datetime.now(timezone.utc) - timedelta(minutes=1)

    await pool.execute(
        """INSERT INTO magic_link_tokens (email, token, expires_at)
           VALUES ($1, $2, $3)
           ON CONFLICT (email) DO UPDATE
               SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at, used = FALSE""",
        email, expired_token, expired_at,
    )

    r = await client.post("/api/v1/auth/magic-link/verificar", json={"token": expired_token})
    assert r.status_code == 400
