"""Cron (día 1 de cada mes): reporte del mes anterior a cada realtor activo. Idempotente."""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv()


async def main() -> None:
    import asyncpg
    from api.services.reporte_mensual_service import enviar_reportes

    pool = await asyncpg.create_pool(os.environ["DATABASE_URL"], min_size=1, max_size=2)
    try:
        print(f"reporte_mensual: {await enviar_reportes(pool)}")
    finally:
        await pool.close()


if __name__ == "__main__":
    asyncio.run(main())
