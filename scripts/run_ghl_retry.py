"""Cron: reintenta los pushes a GHL que fallaron (public.ghl_push_failures).

Run: python scripts/run_ghl_retry.py   (Dockerfile.cron, cada 15 min)
"""
from __future__ import annotations

import asyncio
import logging
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")


async def main() -> None:
    from api import db
    from api.services.ghl_retry_service import reintentar_pendientes
    from api.utils import ghl_client

    await db.create_pool()
    try:
        res = await reintentar_pendientes(db.get_pool())
        print(f"ghl_retry: {res}")
    finally:
        await ghl_client.aclose()
        await db.close_pool()


if __name__ == "__main__":
    asyncio.run(main())
