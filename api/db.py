import os
from pathlib import Path

import asyncpg
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

_pool: asyncpg.Pool | None = None


async def create_pool() -> None:
    global _pool
    _pool = await asyncpg.create_pool(
        dsn=os.getenv("DATABASE_URL"),
        min_size=2,
        max_size=10,
        command_timeout=30,
        timeout=10,
    )


async def close_pool() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("DB pool not initialized")
    return _pool
