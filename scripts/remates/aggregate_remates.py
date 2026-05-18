"""
Compute salud_financiera score per municipio from remates data.

Input:  ../data/raw/remates_antioquia.json
        ../data/processed/barrios_stats.json  (for listing counts per municipio)
Output: ../data/processed/remates_por_municipio.json

Score thresholds (remates per 100 listings):
  No data        → 100  (neutral — sin datos no se penaliza)
  < 1  / 100     → 85   MUY SALUDABLE
  < 3  / 100     → 65   SALUDABLE
  < 5  / 100     → 45   PRECAUCIÓN
  < 10 / 100     → 25   ALERTA
  >= 10 / 100    → 10   CRÍTICO

Run:
  python aggregate_remates.py
"""

import json
from collections import Counter
from pathlib import Path

RAW_REMATES  = Path(__file__).parent.parent / "data" / "raw" / "remates_antioquia.json"
BARRIOS_STATS = Path(__file__).parent.parent / "data" / "processed" / "barrios_stats.json"
OUTPUT       = Path(__file__).parent.parent / "data" / "processed" / "remates_por_municipio.json"

SCORE_THRESHOLDS = [
    (1,  85, "MUY SALUDABLE"),
    (3,  65, "SALUDABLE"),
    (5,  45, "PRECAUCIÓN"),
    (10, 25, "ALERTA"),
]


def compute_score(remates_por_100: float | None) -> tuple[int, str]:
    if remates_por_100 is None:
        return 100, "SIN DATOS"
    for threshold, score, cat in SCORE_THRESHOLDS:
        if remates_por_100 < threshold:
            return score, cat
    return 10, "CRÍTICO"


def nota(cat: str, municipio: str) -> str:
    msgs = {
        "SIN DATOS":     f"Sin remates registrados en {municipio}. Score neutro.",
        "MUY SALUDABLE": f"Zona financieramente estable. Baja presión de venta forzada.",
        "SALUDABLE":     f"Baja tasa de remates. Mercado con poca tensión financiera.",
        "PRECAUCIÓN":    f"Tasa moderada de remates. Monitorear tendencia.",
        "ALERTA":        f"Tasa elevada de remates. Señal de estrés financiero zonal.",
        "CRÍTICO":       f"Alta concentración de remates. Riesgo de depreciación.",
    }
    return msgs.get(cat, "")


def main():
    # Load remates
    remates: list[dict] = []
    if RAW_REMATES.exists():
        with open(RAW_REMATES, encoding="utf-8") as f:
            remates = [r for r in json.load(f) if r.get("estado", "activo") == "activo"]
    print(f"Remates activos: {len(remates)}")

    # Count listings per municipio from barrios_stats
    listings_por_municipio: Counter = Counter()
    if BARRIOS_STATS.exists():
        with open(BARRIOS_STATS, encoding="utf-8") as f:
            barrios = json.load(f)
        for b in barrios:
            mun = b.get("municipio", "")
            n = (b.get("n_venta") or 0) + (b.get("n_arriendo") or 0)
            listings_por_municipio[mun] += n
    print(f"Municipios con listings: {dict(listings_por_municipio)}")

    # Count remates per municipio
    remates_por_municipio: Counter = Counter()
    tipo_por_municipio: dict[str, Counter] = {}
    precios_por_municipio: dict[str, list] = {}

    for r in remates:
        mun = r.get("municipio")
        if not mun:
            continue
        remates_por_municipio[mun] += 1
        tipo_por_municipio.setdefault(mun, Counter())[r.get("tipo_inmueble", "inmueble")] += 1
        if r.get("precio_base_cop"):
            precios_por_municipio.setdefault(mun, []).append(r["precio_base_cop"])

    # Compute scores
    all_municipios = set(listings_por_municipio.keys()) | set(remates_por_municipio.keys())
    result: dict[str, dict] = {}

    for mun in all_municipios:
        if not mun:
            continue
        n_remates = remates_por_municipio.get(mun, 0)
        n_listings = listings_por_municipio.get(mun, 0)
        precios = precios_por_municipio.get(mun, [])

        if n_listings > 0 and n_remates > 0:
            ratio = n_remates * 100.0 / n_listings
        elif n_remates == 0:
            ratio = None
        else:
            ratio = None  # no listing data → can't normalize

        score, categoria = compute_score(ratio)

        result[mun] = {
            "municipio": mun,
            "n_remates_activos": n_remates,
            "n_listings_referencia": n_listings,
            "remates_por_100_listings": round(ratio, 2) if ratio is not None else None,
            "score_salud": score,
            "categoria_salud": categoria,
            "n_remates_apto": tipo_por_municipio.get(mun, {}).get("apartamento", 0),
            "precio_base_promedio": int(sum(precios) / len(precios)) if precios else None,
            "nota": nota(categoria, mun),
            "fuente": "rematesjudiciales.click",
        }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"\n== Salud financiera por municipio ==")
    for mun, d in sorted(result.items(), key=lambda x: -x[1]["n_remates_activos"]):
        print(
            f"  {mun:20s} | remates={d['n_remates_activos']:3d} "
            f"| ratio={str(d['remates_por_100_listings']):6s} "
            f"| score={d['score_salud']:3d} | {d['categoria_salud']}"
        )
    print(f"\n✓ Guardado: {OUTPUT}")


if __name__ == "__main__":
    main()
