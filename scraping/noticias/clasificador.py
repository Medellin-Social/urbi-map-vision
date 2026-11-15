"""Clasificador zero-shot offline de noticias por tema.

transformers `zero-shot-classification` + modelo Spanish ELECTRA (SELECTRA),
100% offline: el modelo se bakea en el build de Dockerfile.cron (mismo patrón
que el traductor Opus-MT). Sin API, sin key, sin costo.

Decide si un título es de interés cultural/positivo para Medellín Social:
puntúa el título contra temas positivos (cultura/deporte/gastronomía/comunidad)
y negativos (crimen/política/economía/accidentes/salud). Se queda si el mejor
tema positivo supera el umbral Y gana al mejor negativo. Esto captura "de qué
trata" por semántica — robusto a frases nuevas que una blocklist de keywords
no cubre (ej. "Capturan a..." que no está en la lista).

Si el modelo no está disponible (DEV sin modelo bakeado), `clasificador_disponible()`
devuelve False y el scraper cae a filtro keyword-only sin romperse.

Self-test:  python scraping/noticias/clasificador.py
"""
import os
from functools import lru_cache

# Ruta al modelo bakeado (ver Dockerfile.cron). Override por env para swap/pruebas.
# ponytail: SELECTRA medium (~150MB) alcanza para títulos cortos en español; si da
# ruido, subir a 'MoritzLaurer/mDeBERTa-v3-base-mnli-xnli' (~560MB) vía esta env.
_MODEL = os.environ.get("NOTICIAS_CLF_MODEL", "/app/models/zeroshot-noticias")

# Piso de confianza del mejor tema positivo (anti-ruido). La señal que manda es
# pos>neg; SELECTRA puntúa bajo títulos cortos aun siendo claros (ej. "museo de
# arte abre" ~0.47), así que el piso es laxo. Perilla de calibración (env).
_UMBRAL = float(os.environ.get("NOTICIAS_CLF_UMBRAL", "0.35"))

# Temas candidatos. Español — el modelo está entrenado en XNLI es.
_POS = [
    "cultura, arte y música",
    "deporte",
    "gastronomía y turismo",
    "comunidad, festival o celebración",
]
_NEG = [
    "crimen, violencia o accidente",
    "política y economía",
    "salud, enfermedad o judicial",
]
_LABELS = _POS + _NEG
_HYP = "Esta noticia trata sobre {}."


@lru_cache(maxsize=1)
def _pipe():
    from transformers import pipeline  # import perezoso: no cargar torch al importar módulo
    return pipeline("zero-shot-classification", model=_MODEL)


@lru_cache(maxsize=1)
def clasificador_disponible() -> bool:
    """True si el modelo carga. Cacheado: se intenta una sola vez por proceso."""
    try:
        _pipe()
        return True
    except Exception as e:  # modelo no bakeado / transformers ausente → keyword-only
        print(f"[clf] zero-shot no disponible, fallback keyword-only: {e}")
        return False


def clasificar(titulo: str) -> dict:
    res = _pipe()(titulo, _LABELS, multi_label=True, hypothesis_template=_HYP)
    scores = dict(zip(res["labels"], res["scores"]))
    pos = max(scores[l] for l in _POS)
    neg = max(scores[l] for l in _NEG)
    top = max(scores, key=scores.get)
    return {"pos": pos, "neg": neg, "top": top, "scores": scores}


def decidir(pos: float, neg: float, umbral: float = _UMBRAL) -> bool:
    """Lógica pura de keep/drop. Se queda si el tema positivo convence y gana."""
    return pos >= umbral and pos > neg


def es_interesante(titulo: str) -> bool:
    i = clasificar(titulo)
    return decidir(i["pos"], i["neg"])


if __name__ == "__main__":
    # Check de la lógica de decisión — puro, sin modelo.
    assert decidir(0.9, 0.1) is True          # positivo fuerte, gana
    assert decidir(0.6, 0.95) is False         # crimen domina (ej. "Capturan a ladrón")
    assert decidir(0.47, 0.0) is True          # cultural claro pero score bajo ("museo abre")
    assert decidir(0.3, 0.2) is False          # bajo el piso -> ruido, fuera
    assert decidir(0.37, 0.46) is False        # negativo gana ("accidente deja heridos")
    print("decidir() OK")

    # Si hay modelo bakeado, probar títulos reales.
    if clasificador_disponible():
        for t in [
            "Festival de jazz llega a Medellín este fin de semana",
            "Capturan a presunto ladrón en el centro de Medellín",
            "La economía de Antioquia crece 3% según el dólar",
            "Nuevo museo de arte abre sus puertas en El Poblado",
        ]:
            i = clasificar(t)
            print(f"  {'KEEP' if es_interesante(t) else 'DROP'}  "
                  f"pos={i['pos']:.2f} neg={i['neg']:.2f} [{i['top']}]  {t}")
