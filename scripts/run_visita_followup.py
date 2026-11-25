"""Cron (cada 30 min): recordatorio 12 h + reasignación 24 h de visitas sin respuesta."""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv()


async def main() -> None:
    import asyncpg
    from api.services.visita_followup_service import reasignar_vencidas, recordar_pendientes

    pool = await asyncpg.create_pool(os.environ["DATABASE_URL"], min_size=1, max_size=2)
    try:
        r = await recordar_pendientes(pool)
        out = await reasignar_vencidas(pool)
        print(f"visita_followup: {r} recordatorio(s), {out}")
    finally:
        await pool.close()


if __name__ == "__main__":
    asyncio.run(main())
