"""Shared fixtures for API tests. Uses httpx.AsyncClient against the real FastAPI app."""
import os
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

os.environ.setdefault("JWT_SECRET", "test-secret-key-not-for-production")
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost/urbidata_test")

from api.main import app  # noqa: E402  (import after env vars set)


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
