from __future__ import annotations

PRESUPUESTO_MAX: dict[str, int] = {
    '<200':     200_000_000,
    '200-500':  500_000_000,
    '500-1000': 1_000_000_000,
    '>1000':    9_999_999_999,
}

# Base weights + per-field modificadores per (objetivo, perfil_riesgo).
# base values are fractions summing to 1.0; aplicar_modificadores re-normalises.
# Factors: score_zona, yield, liquidez, buena_oferta, indice_nomada, valorizacion, seguridad
PESOS_EXTENDIDOS: dict[tuple[str, str], dict] = {
    # ━━━ AIRBNB ━━━
    ('airbnb', 'conservador'): {
        'base': {
            'score_zona': 0.35, 'yield': 0.25,
            'liquidez': 0.30, 'buena_oferta': 0.10
        },
        'modificadores': {
            'n_unidades_1':    {'liquidez': +0.10, 'yield': -0.10},
            'n_unidades_5+':   {'yield': +0.10, 'liquidez': -0.10},
            'gestion_self':    {'liquidez': +0.05},
            'gestion_manager': {'yield': +0.05},
        }
    },
    ('airbnb', 'moderado'): {
        'base': {
            'score_zona': 0.25, 'yield': 0.45,
            'liquidez': 0.20, 'buena_oferta': 0.10
        },
        'modificadores': {
            'n_unidades_1':    {'liquidez': +0.05},
            'n_unidades_5+':   {'yield': +0.10, 'score_zona': -0.10},
            'gestion_manager': {'yield': +0.05},
        }
    },
    ('airbnb', 'agresivo'): {
        'base': {
            'score_zona': 0.15, 'yield': 0.60,
            'liquidez': 0.15, 'buena_oferta': 0.10
        },
        'modificadores': {
            'n_unidades_5+': {'yield': +0.05, 'liquidez': -0.05},
        }
    },

    # ━━━ RENTA MEDIA ━━━
    ('mediano_plazo', 'conservador'): {
        'base': {
            'score_zona': 0.40, 'yield': 0.25,
            'indice_nomada': 0.25, 'buena_oferta': 0.10
        },
        'modificadores': {
            'target_nomada':    {'indice_nomada': +0.15, 'yield': -0.15},
            'target_ejecutivo': {'seguridad': +0.15, 'indice_nomada': -0.15},
            'target_estudiante':{'buena_oferta': +0.10, 'score_zona': -0.10},
            'amoblado_si':      {'yield': +0.05},
        }
    },
    ('mediano_plazo', 'moderado'): {
        'base': {
            'score_zona': 0.25, 'yield': 0.35,
            'indice_nomada': 0.30, 'buena_oferta': 0.10
        },
        'modificadores': {
            'target_nomada':    {'indice_nomada': +0.10, 'score_zona': -0.10},
            'target_ejecutivo': {'seguridad': +0.10, 'indice_nomada': -0.10},
            'target_estudiante':{'buena_oferta': +0.10, 'yield': -0.10},
            'amoblado_si':      {'yield': +0.05},
        }
    },
    ('mediano_plazo', 'agresivo'): {
        'base': {
            'score_zona': 0.15, 'yield': 0.50,
            'indice_nomada': 0.25, 'buena_oferta': 0.10
        },
        'modificadores': {
            'target_nomada':    {'indice_nomada': +0.10, 'score_zona': -0.10},
            'target_ejecutivo': {'yield': +0.05},
        }
    },

    # ━━━ RENTA LARGA ━━━
    ('renta_larga', 'conservador'): {
        'base': {
            'score_zona': 0.40, 'yield': 0.20,
            'liquidez': 0.20, 'valorizacion': 0.20
        },
        'modificadores': {
            'pago_contado':  {'valorizacion': +0.10, 'liquidez': -0.10},
            'pago_credito':  {'yield': +0.15, 'valorizacion': -0.15},
            'horizonte_20+': {'valorizacion': +0.15, 'yield': -0.15},
            'horizonte_5':   {'yield': +0.15, 'valorizacion': -0.15},
        }
    },
    ('renta_larga', 'moderado'): {
        'base': {
            'score_zona': 0.30, 'yield': 0.35,
            'liquidez': 0.15, 'valorizacion': 0.20
        },
        'modificadores': {
            'pago_contado':  {'valorizacion': +0.10, 'yield': -0.10},
            'pago_credito':  {'yield': +0.20, 'valorizacion': -0.20},
            'horizonte_20+': {'valorizacion': +0.15, 'score_zona': -0.15},
            'horizonte_5':   {'yield': +0.20, 'liquidez': +0.05, 'valorizacion': -0.25},
        }
    },
    ('renta_larga', 'agresivo'): {
        'base': {
            'score_zona': 0.20, 'yield': 0.50,
            'liquidez': 0.10, 'valorizacion': 0.20
        },
        'modificadores': {
            'pago_contado':  {'valorizacion': +0.10, 'yield': -0.10},
            'pago_credito':  {'yield': +0.15, 'valorizacion': -0.15},
            'horizonte_20+': {'valorizacion': +0.20, 'yield': -0.20},
            'horizonte_5':   {'yield': +0.20, 'valorizacion': -0.20},
        }
    },
}

# largo_plazo kept as alias for backward compatibility
for _riesgo in ('conservador', 'moderado', 'agresivo'):
    PESOS_EXTENDIDOS[('largo_plazo', _riesgo)] = PESOS_EXTENDIDOS[('renta_larga', _riesgo)]

_OBJETIVO_SCORE_KEY: dict[str, str] = {
    "airbnb":       "score_corto",
    "mediano_plazo":"score_mediano",
    "renta_larga":  "score_largo",
    "largo_plazo":  "score_largo",
}


def aplicar_modificadores(base: dict[str, float], perfil: dict) -> dict[str, float]:
    pesos = base.copy()

    mods: list[str] = []

    n = perfil.get('n_unidades')
    if n == '1':
        mods.append('n_unidades_1')
    elif n == '5+':
        mods.append('n_unidades_5+')

    gestion = perfil.get('tipo_gestion')
    if gestion == 'self':
        mods.append('gestion_self')
    elif gestion == 'manager':
        mods.append('gestion_manager')

    target = perfil.get('target_inquilino')
    if target == 'nomada':
        mods.append('target_nomada')
    elif target == 'ejecutivo':
        mods.append('target_ejecutivo')
    elif target == 'estudiante':
        mods.append('target_estudiante')

    if perfil.get('amoblado') == 'si':
        mods.append('amoblado_si')

    pago = perfil.get('tipo_pago')
    if pago == 'contado':
        mods.append('pago_contado')
    elif pago == 'credito':
        mods.append('pago_credito')

    horizonte = perfil.get('horizonte_inversion')
    if horizonte == '20+':
        mods.append('horizonte_20+')
    elif horizonte == '5':
        mods.append('horizonte_5')

    objetivo = (perfil.get('objetivo') or 'renta_larga').lower()
    riesgo   = (perfil.get('perfil_riesgo') or 'moderado').lower()
    config = PESOS_EXTENDIDOS.get((objetivo, riesgo))
    if not config:
        return pesos

    modificadores = config.get('modificadores', {})
    for mod_key in mods:
        if mod_key in modificadores:
            for campo, delta in modificadores[mod_key].items():
                pesos[campo] = pesos.get(campo, 0.0) + delta

    # Clamp negatives (stacked modifiers can push a dimension below zero)
    pesos = {k: max(v, 0.0) for k, v in pesos.items()}
    total = sum(pesos.values())
    if total > 0:
        pesos = {k: round(v / total, 4) for k, v in pesos.items()}

    return pesos


def calcular_relevancia(
    listing: dict,
    barrio: dict,
    perfil: dict,
) -> tuple[float, list[str]]:
    """Return (score_0_100, razones[:3]) for a listing+barrio given an investor profile."""
    objetivo = (perfil.get("objetivo") or "renta_larga").lower()
    riesgo   = (perfil.get("perfil_riesgo") or "moderado").lower()

    config = PESOS_EXTENDIDOS.get((objetivo, riesgo)) or PESOS_EXTENDIDOS.get(("renta_larga", "moderado"), {"base": {}, "modificadores": {}})
    pesos = aplicar_modificadores(config["base"], perfil)

    total = 0.0
    razones: list[str] = []

    # 1. score_zona (barrio-level, 0–100)
    if "score_zona" in pesos:
        score_key = _OBJETIVO_SCORE_KEY.get(objetivo, "score_largo")
        score = float(barrio.get(score_key) or 0)
        total += (score / 100) * pesos["score_zona"]
        if score >= 70:
            razones.append(f"Barrio top ({score}pts)")

    # 2. indice_nomada (barrio-level, 0–100)
    if "indice_nomada" in pesos:
        nomada = float(barrio.get("indice_nomada") or 0)
        total += min(nomada / 100, 1.0) * pesos["indice_nomada"]
        if nomada >= 60:
            razones.append("Alto índice nómada")

    # 3. liquidez (barrio-level, 0–100)
    if "liquidez" in pesos:
        liq = float(barrio.get("liquidez_score") or 0)
        total += (liq / 100) * pesos["liquidez"]
        if liq >= 70:
            razones.append("Alta liquidez")

    # 4. seguridad (barrio-level, 0–100)
    if "seguridad" in pesos:
        seg = float(barrio.get("seguridad_score") or 0)
        total += (seg / 100) * pesos["seguridad"]
        if seg >= 70:
            razones.append("Zona segura")

    # 5. yield (barrio-level, %; normalize 4–12%)
    if "yield" in pesos:
        y = float(barrio.get("yield_bruto_pct") or 0)
        normalized = min(max((y - 4.0) / 8.0, 0.0), 1.0)
        total += normalized * pesos["yield"]
        if y >= 8:
            razones.append(f"Yield {y:.1f}%")

    # 6. valorizacion (barrio-level, %; normalize 0–12%)
    if "valorizacion" in pesos:
        v = float(barrio.get("var_anual_pct") or 0)
        normalized = min(max(v / 12.0, 0.0), 1.0)
        total += normalized * pesos["valorizacion"]
        if v >= 6:
            razones.append(f"Valor +{v:.1f}%/año")

    # 7. buena_oferta (listing-level, boolean)
    if "buena_oferta" in pesos and listing.get("buena_oferta"):
        total += pesos["buena_oferta"]
        if not any("mediana" in r for r in razones):
            razones.append("Precio bajo mercado")

    # ── Extended match reasons ────────────────────────────────────────────────
    target = perfil.get("target_inquilino")
    if target == "nomada" and float(barrio.get("indice_nomada") or 0) > 100:
        if "Zona ideal para nómadas digitales" not in razones:
            razones.append("Zona ideal para nómadas digitales")

    if perfil.get("tipo_pago") == "credito" and float(barrio.get("yield_bruto_pct") or 0) > 7:
        razones.append("Yield suficiente para cubrir cuota")

    if perfil.get("horizonte_inversion") == "20+" and float(barrio.get("var_anual_pct") or 0) > 10:
        razones.append("Alta valorización histórica")

    if perfil.get("n_unidades") == "5+" and (barrio.get("n_listings_airbnb") or 0) > 20:
        razones.append("Demanda Airbnb probada en la zona")

    if perfil.get("amoblado") == "si" and (barrio.get("pct_wifi") or 0) > 80:
        razones.append("Zona con alta demanda de amoblados")

    return min(round(total * 100, 1), 100.0), razones[:3]


def get_match_label(score: float) -> str:
    if score >= 75:
        return "Excelente match"
    if score >= 55:
        return "Buen match"
    if score >= 35:
        return "Match moderado"
    return "Bajo match"
