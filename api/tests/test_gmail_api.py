"""Tests for the Gmail API sender (api/utils/gmail_api.py).

No live network calls — httpx.AsyncClient is replaced with a fake that
records calls and returns canned responses.
"""
import base64
import time

import pytest

import api.utils.email as email_mod
import api.utils.gmail_api as gmail_api


class _FakeResponse:
    def __init__(self, status_code=200, json_data=None):
        self.status_code = status_code
        self._json_data = json_data or {}

    def json(self):
        return self._json_data

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP error {self.status_code}")


def _fake_httpx(calls, token_response=None, send_response=None):
    """Build a stand-in for the `httpx` module with a fake AsyncClient."""

    class FakeAsyncClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, **kwargs):
            calls.append((url, kwargs))
            if url == gmail_api._TOKEN_URL:
                return token_response or _FakeResponse(200, {"access_token": "tok123", "expires_in": 3600})
            return send_response or _FakeResponse(200, {"id": "msg1"})

    class FakeHttpx:
        AsyncClient = FakeAsyncClient

    return FakeHttpx


@pytest.fixture(autouse=True)
def _reset_token_cache():
    gmail_api._access_token = None
    gmail_api._expires_at = 0.0
    yield
    gmail_api._access_token = None
    gmail_api._expires_at = 0.0


def _set_env(monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "client-id")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "client-secret")
    monkeypatch.setenv("GOOGLE_REFRESH_TOKEN", "refresh-token")
    monkeypatch.setenv("GMAIL_SENDER", "noreply@medellinsocial.com")


# ── is_configured ──────────────────────────────────────────────────────────

def test_is_configured_false_without_env(monkeypatch):
    monkeypatch.delenv("GOOGLE_CLIENT_ID", raising=False)
    monkeypatch.delenv("GOOGLE_CLIENT_SECRET", raising=False)
    monkeypatch.delenv("GOOGLE_REFRESH_TOKEN", raising=False)
    assert gmail_api.is_configured() is False


def test_is_configured_true_with_env(monkeypatch):
    _set_env(monkeypatch)
    assert gmail_api.is_configured() is True


# ── token refresh ─────────────────────────────────────────────────────────

async def test_get_access_token_calls_token_endpoint(monkeypatch):
    _set_env(monkeypatch)
    calls = []
    monkeypatch.setattr(gmail_api, "httpx", _fake_httpx(calls))

    token = await gmail_api._get_access_token()

    assert token == "tok123"
    assert len(calls) == 1
    url, kwargs = calls[0]
    assert url == gmail_api._TOKEN_URL
    assert kwargs["data"] == {
        "client_id": "client-id",
        "client_secret": "client-secret",
        "refresh_token": "refresh-token",
        "grant_type": "refresh_token",
    }


async def test_get_access_token_uses_cache(monkeypatch):
    _set_env(monkeypatch)
    calls = []
    monkeypatch.setattr(gmail_api, "httpx", _fake_httpx(calls))

    token1 = await gmail_api._get_access_token()
    token2 = await gmail_api._get_access_token()

    assert token1 == token2 == "tok123"
    assert len(calls) == 1  # second call served from cache, no new HTTP request


async def test_get_access_token_refreshes_when_expired(monkeypatch):
    _set_env(monkeypatch)
    calls = []
    monkeypatch.setattr(gmail_api, "httpx", _fake_httpx(calls))

    await gmail_api._get_access_token()
    gmail_api._expires_at = time.time() - 1  # force expiry
    await gmail_api._get_access_token()

    assert len(calls) == 2


# ── message building ────────────────────────────────────────────────────────

def test_build_raw_message_encodes_headers_and_body(monkeypatch):
    _set_env(monkeypatch)
    raw = gmail_api._build_raw_message("dest@example.com", "Confirma tu correo", "<p>hola</p>")
    decoded = base64.urlsafe_b64decode(raw.encode()).decode()

    assert "To: dest@example.com" in decoded
    assert "Subject: Confirma tu correo" in decoded
    assert "From: noreply@medellinsocial.com" in decoded
    assert "<p>hola</p>" in decoded


# ── send ─────────────────────────────────────────────────────────────────

async def test_send_via_gmail_api_posts_with_bearer_token(monkeypatch):
    _set_env(monkeypatch)
    calls = []
    monkeypatch.setattr(gmail_api, "httpx", _fake_httpx(calls))

    await gmail_api.send_via_gmail_api("dest@example.com", "Hola", "<p>cuerpo</p>")

    assert len(calls) == 2  # token exchange + send
    send_url, send_kwargs = calls[1]
    assert send_url == gmail_api._SEND_URL
    assert send_kwargs["headers"]["Authorization"] == "Bearer tok123"
    assert "raw" in send_kwargs["json"]


async def test_send_via_gmail_api_raises_on_error_response(monkeypatch):
    _set_env(monkeypatch)
    calls = []
    fake_httpx = _fake_httpx(calls, send_response=_FakeResponse(500, {}))
    monkeypatch.setattr(gmail_api, "httpx", fake_httpx)

    with pytest.raises(RuntimeError):
        await gmail_api.send_via_gmail_api("dest@example.com", "Hola", "<p>x</p>")


# ── email.py dispatch (Gmail API vs SMTP fallback) ──────────────────────────

async def test_send_email_uses_gmail_api_when_configured(monkeypatch):
    called = {}

    async def fake_send(to, subject, html):
        called["args"] = (to, subject, html)

    monkeypatch.setattr(gmail_api, "is_configured", lambda: True)
    monkeypatch.setattr(gmail_api, "send_via_gmail_api", fake_send)

    await email_mod.send_email("dest@example.com", "Asunto", "<p>x</p>")

    assert called["args"] == ("dest@example.com", "Asunto", "<p>x</p>")


async def test_send_email_falls_back_to_smtp_when_not_configured(monkeypatch):
    monkeypatch.setattr(gmail_api, "is_configured", lambda: False)
    called = {"smtp": False}
    monkeypatch.setattr(email_mod, "_send_sync", lambda *a, **k: called.__setitem__("smtp", True))

    await email_mod.send_email("dest@example.com", "Asunto", "<p>x</p>")

    assert called["smtp"] is True
