"""Email sender via Gmail API (OAuth2 refresh-token flow).

No google-api-python-client dependency — plain REST calls with httpx
(already a project dep), matching the lazy style of email.py.

Env vars required:
  GOOGLE_CLIENT_ID     — OAuth2 client ID (Web application type)
  GOOGLE_CLIENT_SECRET — OAuth2 client secret
  GOOGLE_REFRESH_TOKEN — refresh token for the sending Gmail account, minted
                         once via the OAuth consent flow with scope
                         https://www.googleapis.com/auth/gmail.send.
                         ⚠️ The OAuth consent screen must be in "In production"
                         publishing status — refresh tokens issued while it's
                         in "Testing" expire after ~7 days and mail silently
                         stops sending again.
  GMAIL_SENDER         — email address that authorized the refresh token
                         (used as the From header)

If any of GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN is
unset, is_configured() is False and callers (api/utils/email.py) fall back
to plain SMTP.
"""
from __future__ import annotations

import base64
import os
import time
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import httpx

_TOKEN_URL = "https://oauth2.googleapis.com/token"
_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"

# In-memory access-token cache — refreshed on demand, not at import time
# (env vars are read fresh so tests can monkeypatch them).
_access_token: str | None = None
_expires_at: float = 0.0


def is_configured() -> bool:
    return bool(
        os.getenv("GOOGLE_CLIENT_ID")
        and os.getenv("GOOGLE_CLIENT_SECRET")
        and os.getenv("GOOGLE_REFRESH_TOKEN")
    )


async def _get_access_token() -> str:
    global _access_token, _expires_at
    if _access_token and time.time() < _expires_at - 60:
        return _access_token

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            _TOKEN_URL,
            data={
                "client_id": os.getenv("GOOGLE_CLIENT_ID", ""),
                "client_secret": os.getenv("GOOGLE_CLIENT_SECRET", ""),
                "refresh_token": os.getenv("GOOGLE_REFRESH_TOKEN", ""),
                "grant_type": "refresh_token",
            },
        )
    resp.raise_for_status()
    data = resp.json()
    _access_token = data["access_token"]
    _expires_at = time.time() + data.get("expires_in", 3600)
    return _access_token


def _build_raw_message(to: str, subject: str, html: str) -> str:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["To"] = to
    sender = os.getenv("GMAIL_SENDER", "")
    if sender:
        msg["From"] = sender
    msg.attach(MIMEText(html, "html"))
    return base64.urlsafe_b64encode(msg.as_bytes()).decode()


async def send_via_gmail_api(to: str, subject: str, html: str) -> None:
    token = await _get_access_token()
    raw = _build_raw_message(to, subject, html)
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            _SEND_URL,
            headers={"Authorization": f"Bearer {token}"},
            json={"raw": raw},
        )
    resp.raise_for_status()
