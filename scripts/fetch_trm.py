"""
Fetch the latest official TRM (COP/USD) from datos.gov.co (Socrata 32sa-8pi3)
and upsert the single row of public.trm. Run weekly via Airflow (trm_semanal).

Fail-safe: on any network/parse error it KEEPS the last stored value (returns
None, does not write) — never nulls the rate.

Usage: python scripts/fetch_trm.py
"""
import os

import requests
from sqlalchemy import create_engine, text

SOCRATA_URL = "https://www.datos.gov.co/resource/32sa-8pi3.json"


def fetch_and_save_trm():
    try:
        r = requests.get(
            SOCRATA_URL,
            params={"$order": "vigenciadesde DESC", "$limit": 1},
            timeout=15,
        )
        r.raise_for_status()
        rows = r.json()
        if not rows:
            print("[trm] respuesta vacía — conservo valor actual")
            return None
        valor = float(rows[0]["valor"])
        vigencia = (rows[0].get("vigenciadesde") or "")[:10] or None

        engine = create_engine(os.getenv("DATABASE_URL"))
        with engine.connect() as conn:
            conn.execute(
                text("""
                    INSERT INTO public.trm (id, valor, vigencia, updated_at)
                    VALUES (1, :valor, :vigencia, NOW())
                    ON CONFLICT (id) DO UPDATE
                        SET valor = :valor, vigencia = :vigencia, updated_at = NOW()
                """),
                {"valor": valor, "vigencia": vigencia},
            )
            conn.commit()
        print(f"[trm] actualizado: {valor} (vigencia {vigencia})")
        return valor

    except Exception as e:
        print(f"[trm] error, conservo valor actual: {e}")
        return None  # keep last value — never null


if __name__ == "__main__":
    fetch_and_save_trm()
