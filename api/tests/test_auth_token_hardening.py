"""Hardening de auth: tokens de un solo uso hasheados y tope absoluto de /refresh."""
import hashlib
from datetime import datetime, timedelta, timezone

import jwt
import pytest

from api.dependencies import JWT_ALGORITHM, JWT_SECRET
from api.routers import auth as A


def test_hash_token_es_sha256_y_estable():
    assert A._hash_token("abc") == hashlib.sha256(b"abc").hexdigest()
    assert A._hash_token("abc") != "abc"
    assert A._hash_token("abc") == A._hash_token("abc")


def test_make_token_hereda_inicio_de_sesion():
    inicio = datetime.now(timezone.utc) - timedelta(days=10)
    p = jwt.decode(A._make_token(1, 0, session_start=inicio), JWT_SECRET, algorithms=[JWT_ALGORITHM])
    assert p["oiat"] == int(inicio.timestamp())
    nuevo = jwt.decode(A._make_token(1, 0), JWT_SECRET, algorithms=[JWT_ALGORITHM])
    assert nuevo["oiat"] == nuevo["iat"]


def test_session_max_days_env(monkeypatch):
    monkeypatch.delenv("SESSION_MAX_DAYS", raising=False)
    assert A._session_max_days() == 30
    monkeypatch.setenv("SESSION_MAX_DAYS", "7")
    assert A._session_max_days() == 7
    monkeypatch.setenv("SESSION_MAX_DAYS", "x")
    assert A._session_max_days() == 30


class _Pool:
    async def fetchval(self, *a, **k):
        return 1


async def test_refresh_rechaza_sesion_pasada_del_tope(monkeypatch):
    from fastapi import HTTPException
    monkeypatch.setattr(A, "get_pool", lambda: _Pool())
    vieja = A._make_token(1, 0, session_start=datetime.now(timezone.utc) - timedelta(days=31))
    with pytest.raises(HTTPException) as e:
        await A.refresh_token.__wrapped__(request=None, token=vieja, current_user={"id": 1})
    assert e.value.status_code == 401
