"""
Fetch tasas de cambio oficiales/vigentes y upsert en public.trm (multi-moneda,
PK = moneda — fusionado 2026-08-23, antes fila única id=1 solo USD).

USD: datos.gov.co (Socrata 32sa-8pi3) — TRM oficial Banco de la República.
EUR: no existe "TRM" oficial colombiana para EUR (el concepto TRM es
     específicamente USD/COP); se usa exchangerate-api.com como fuente
     razonable, mismo proveedor que ya usaba scripts/fetch_usd_rate.py.

Fail-safe: on any network/parse error it KEEPS the last stored value for esa
moneda (no upsert) — never nulls the rate. Run weekly via Airflow (trm_semanal).

Usage: python scripts/fetch_trm.py
"""
import os

import requests
from sqlalchemy import create_engine, text

SOCRATA_URL = "https://www.datos.gov.co/resource/32sa-8pi3.json"
EXCHANGERATE_EUR_URL = "https://api.exchangerate-api.com/v4/latest/EUR"

_UPSERT_SQL = text("""
    INSERT INTO public.trm (moneda, valor, vigencia, updated_at)
    VALUES (:moneda, :valor, :vigencia, NOW())
    ON CONFLICT (moneda) DO UPDATE
        SET valor = :valor, vigencia = :vigencia, updated_at = NOW()
""")


def _upsert(moneda: str, valor: float, vigencia: str | None) -> None:
    engine = create_engine(os.getenv("DATABASE_URL"))
    with engine.connect() as conn:
        conn.execute(_UPSERT_SQL, {"moneda": moneda, "valor": valor, "vigencia": vigencia})
        conn.commit()


def fetch_and_save_usd() -> float | None:
    try:
        r = requests.get(
            SOCRATA_URL,
            params={"$order": "vigenciadesde DESC", "$limit": 1},
            timeout=15,
        )
        r.raise_for_status()
        rows = r.json()
        if not rows:
            print("[trm] USD: respuesta vacía — conservo valor actual")
            return None
        valor = float(rows[0]["valor"])
        vigencia = (rows[0].get("vigenciadesde") or "")[:10] or None
        _upsert("USD", valor, vigencia)
        print(f"[trm] USD actualizado: {valor} (vigencia {vigencia})")
        return valor
    except Exception as e:
        print(f"[trm] USD error, conservo valor actual: {e}")
        return None  # keep last value — never null


def fetch_and_save_eur() -> float | None:
    try:
        r = requests.get(EXCHANGERATE_EUR_URL, timeout=15)
        r.raise_for_status()
        data = r.json()
        valor = float(data["rates"]["COP"])
        vigencia = (data.get("date") or "") or None
        _upsert("EUR", valor, vigencia)
        print(f"[trm] EUR actualizado: {valor} (vigencia {vigencia})")
        return valor
    except Exception as e:
        print(f"[trm] EUR error, conservo valor actual: {e}")
        return None


def fetch_and_save_trm() -> float | None:
    """Compat: nombre usado por trm_semanal DAG. Refresca USD y EUR."""
    usd = fetch_and_save_usd()
    fetch_and_save_eur()
    return usd


if __name__ == "__main__":
    fetch_and_save_trm()
