"""Unit-level tests for auth endpoints that don't require a live DB.

Tests that need a real DB are skipped via the `require_db` marker — run them
with:  pytest -m require_db --env integration
"""
import pytest
from jose import jwt

from api.routers.auth import _hash_password, _verify_password, _make_token
from api.dependencies import JWT_SECRET, JWT_ALGORITHM


# ── Helper unit tests (no DB, no HTTP) ────────────────────────────────────────

def test_password_hash_roundtrip():
    pw = "S3cur3P@ss!"
    hashed = _hash_password(pw)
    assert _verify_password(pw, hashed)
    assert not _verify_password("wrong", hashed)


def test_make_token_contains_sub():
    token = _make_token(42)
    payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    assert payload["sub"] == "42"


def test_make_token_has_exp():
    token = _make_token(1)
    payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    assert "exp" in payload


# ── HTTP tests (require live DB) ──────────────────────────────────────────────

@pytest.mark.require_db
@pytest.mark.asyncio
async def test_register_then_login(client):
    email = "pytest_user@example.com"
    payload = {"email": email, "password": "Test1234!", "nombre": "Pytest", "apellido": "User"}

    r = await client.post("/api/v1/auth/register", json=payload)
    assert r.status_code in (201, 409)  # 409 if already registered from prior run

    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Test1234!"})
    assert r.status_code == 200
    data = r.json()
    assert "token" in data
    assert data["user"]["email"] == email


@pytest.mark.require_db
@pytest.mark.asyncio
async def test_login_wrong_password(client):
    r = await client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@example.com", "password": "wrong"},
    )
    assert r.status_code == 401


@pytest.mark.require_db
@pytest.mark.asyncio
async def test_forgot_password_unknown_email(client):
    r = await client.post(
        "/api/v1/auth/forgot-password",
        json={"email": "nobody_at_all@example.com"},
    )
    # Always 200 to avoid email enumeration
    assert r.status_code == 200
    data = r.json()
    assert data["reset_token"] is None
