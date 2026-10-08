import asyncio
import sys
sys.path.insert(0, "/home/edwlearn/urbi-map-vision")

import os

async def test():
    from httpx import AsyncClient, ASGITransport
    from api.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        try:
            r = await client.get("/api/v1/barrios?municipio=MEDELLIN&perfil=airbnb")
            print("Status:", r.status_code)
            if r.status_code == 200:
                data = r.json()
                print("Barrios count:", len(data))
                print("First barrio keys:", list(data[0].keys()) if data else "empty")
            else:
                print("Error:", r.text[:500])
        except Exception as e:
            import traceback
            traceback.print_exc()

asyncio.run(test())
