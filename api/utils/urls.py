"""Shared URL validation for user-submitted link fields (event url_externo,
business website, etc.) — rejects javascript:/data: schemes that would
execute when rendered as <a href> or img src on the public site."""
from urllib.parse import urlparse


def require_safe_url(value: str | None) -> str | None:
    if not value:
        return None
    value = value.strip()
    if not value:
        return None
    scheme = urlparse(value).scheme.lower()
    if scheme not in ("http", "https"):
        raise ValueError("URL debe empezar con http:// o https://")
    return value
