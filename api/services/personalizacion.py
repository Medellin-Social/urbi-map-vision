from __future__ import annotations

# Weights per (objetivo, riesgo) combination — must sum to 100 per key.
# Factors:
#   score_activo   – barrio score for the goal (0-100)
#   indice_nomada  – nomadic-friendly amenities index (0-100)
#   pct_bajo_mediana – how far below median price (positive = cheaper)
#   liquidez       – barrio liquidity score (0-100)
#   seguridad      – safety score (0-100)
#   yield_bruto    – gross rental yield % (typically 4-12)
#   var_anual      – annual appreciation % (typically 0-12)
#   buena_oferta   – listing is below market median by >10% (bool bonus)
PESOS: dict[tuple[str, str], dict[str, float]] = {
    ("airbnb", "conservador"): {
        "score_activo": 30, "indice_nomada": 20, "pct_bajo_mediana": 10,
        "liquidez": 15, "seguridad": 20, "buena_oferta": 5,
    },
    ("airbnb", "moderado"): {
        "score_activo": 30, "indice_nomada": 25, "pct_bajo_mediana": 20,
        "liquidez": 10, "seguridad": 10, "buena_oferta": 5,
    },
    ("airbnb", "agresivo"): {
        "score_activo": 25, "indice_nomada": 30, "pct_bajo_mediana": 30,
        "liquidez": 5, "seguridad": 5, "buena_oferta": 5,
    },
    ("mediano_plazo", "conservador"): {
        "score_activo": 30, "yield_bruto": 20, "pct_bajo_mediana": 15,
        "liquidez": 20, "seguridad": 10, "buena_oferta": 5,
    },
    ("mediano_plazo", "moderado"): {
        "score_activo": 30, "yield_bruto": 25, "pct_bajo_mediana": 25,
        "liquidez": 10, "seguridad": 5, "buena_oferta": 5,
    },
    ("mediano_plazo", "agresivo"): {
        "score_activo": 25, "yield_bruto": 30, "pct_bajo_mediana": 30,
        "liquidez": 5, "seguridad": 5, "buena_oferta": 5,
    },
    ("largo_plazo", "conservador"): {
        "score_activo": 25, "var_anual": 20, "pct_bajo_mediana": 15,
        "liquidez": 20, "seguridad": 15, "buena_oferta": 5,
    },
    ("largo_plazo", "moderado"): {
        "score_activo": 30, "var_anual": 25, "pct_bajo_mediana": 20,
        "liquidez": 15, "seguridad": 5, "buena_oferta": 5,
    },
    ("largo_plazo", "agresivo"): {
        "score_activo": 25, "var_anual": 30, "pct_bajo_mediana": 30,
        "liquidez": 5, "seguridad": 5, "buena_oferta": 5,
    },
}

_OBJETIVO_SCORE_KEY: dict[str, str] = {
    "airbnb": "score_corto",
    "mediano_plazo": "score_mediano",
    "largo_plazo": "score_largo",
}


def calcular_relevancia(
    listing: dict,
    barrio: dict,
    perfil: dict,
) -> tuple[float, list[str]]:
    """Return (score_0_100, razones[:3]) for a listing+barrio given an investor profile."""
    objetivo = (perfil.get("objetivo") or "largo_plazo").lower()
    riesgo = (perfil.get("perfil_riesgo") or "moderado").lower()
    pesos = PESOS.get((objetivo, riesgo), PESOS[("largo_plazo", "moderado")])

    total = 0.0
    razones: list[str] = []

    # 1. score_activo (barrio-level, 0–100)
    if "score_activo" in pesos:
        score_key = _OBJETIVO_SCORE_KEY.get(objetivo, "score_largo")
        score = barrio.get(score_key) or 0
        total += (score / 100) * pesos["score_activo"]
        if score >= 70:
            razones.append(f"Barrio top ({score}pts)")

    # 2. indice_nomada (barrio-level, 0–100)
    if "indice_nomada" in pesos:
        nomada = float(barrio.get("indice_nomada") or 0)
        total += min(nomada / 100, 1.0) * pesos["indice_nomada"]
        if nomada >= 60:
            razones.append("Alto índice nómada")

    # 3. pct_bajo_mediana (listing-level; negative = above median)
    if "pct_bajo_mediana" in pesos:
        pct = float(listing.get("pct_bajo_mediana") or 0)
        # >20% below → full score; at median → 50%; above median → 0–50%
        normalized = min(max((pct + 20) / 40, 0.0), 1.0)
        total += normalized * pesos["pct_bajo_mediana"]
        if pct > 10:
            razones.append(f"{pct:.0f}% bajo la mediana")

    # 4. liquidez (barrio-level, 0–100)
    if "liquidez" in pesos:
        liq = float(barrio.get("liquidez_score") or 0)
        total += (liq / 100) * pesos["liquidez"]
        if liq >= 70:
            razones.append("Alta liquidez")

    # 5. seguridad (barrio-level, 0–100)
    if "seguridad" in pesos:
        seg = float(barrio.get("seguridad_score") or 0)
        total += (seg / 100) * pesos["seguridad"]
        if seg >= 70:
            razones.append("Zona segura")

    # 6. yield_bruto (barrio-level, %; normalize 4–12%)
    if "yield_bruto" in pesos:
        y = float(barrio.get("yield_bruto_pct") or 0)
        normalized = min(max((y - 4.0) / 8.0, 0.0), 1.0)
        total += normalized * pesos["yield_bruto"]
        if y >= 8:
            razones.append(f"Yield {y:.1f}%")

    # 7. var_anual (barrio-level, %; normalize 0–12%)
    if "var_anual" in pesos:
        v = float(barrio.get("var_anual_pct") or 0)
        normalized = min(max(v / 12.0, 0.0), 1.0)
        total += normalized * pesos["var_anual"]
        if v >= 6:
            razones.append(f"Valor +{v:.1f}%/año")

    # 8. buena_oferta (listing-level, boolean)
    if "buena_oferta" in pesos and listing.get("buena_oferta"):
        total += pesos["buena_oferta"]
        if not any("mediana" in r for r in razones):
            razones.append("Precio bajo mercado")

    return min(round(total, 1), 100.0), razones[:3]


def get_match_label(score: float) -> str:
    if score >= 75:
        return "Excelente match"
    if score >= 55:
        return "Buen match"
    if score >= 35:
        return "Match moderado"
    return "Bajo match"
