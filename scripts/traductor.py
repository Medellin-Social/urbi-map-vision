"""Traductor offline bidireccional es<->en para descripciones de listings.

Opus-MT (Helsinki-NLP) via CTranslate2 int8 — 100% offline, sin API, sin costo.
Dos modelos: opus-mt-es-en y opus-mt-en-es (la mayoría de listings son ES, pero
premium/VRBO/nómadas pueden venir en EN). Se detecta el idioma del source y se
traduce al opuesto; el front muestra el source en su idioma y la traducción en el
otro. Los modelos se convierten en el build (Dockerfile.cron) y se bakean ->
traducción sin red en runtime.

NMT genérico falla en jerga inmobiliaria; GLOS reescribe términos ES ambiguos a
ES claro ANTES de traducir (solo dirección es->en).
ponytail: glosario mínimo de errores observados; crece si aparecen más.

Uso:  from traductor import translate_pairs
      translate_pairs(["texto..."]) -> [("traducción al idioma opuesto", "es"|"en"), ...]
Self-test: python scripts/traductor.py   (requiere ambos modelos convertidos)
"""
import os
import re

# (src, tgt) -> (dir_modelo_ct2, tokenizer_dir_o_id_HF)
_MODELS = {
    ("es", "en"): (
        os.environ.get("TRANSLATE_MODEL_ES_EN", "/app/models/opus-es-en-ct2"),
        os.environ.get("TRANSLATE_TOK_ES_EN", "Helsinki-NLP/opus-mt-es-en"),
    ),
    ("en", "es"): (
        os.environ.get("TRANSLATE_MODEL_EN_ES", "/app/models/opus-en-es-ct2"),
        os.environ.get("TRANSLATE_TOK_EN_ES", "Helsinki-NLP/opus-mt-en-es"),
    ),
}

# Glosario ES->ES (solo es->en): reescribe términos inmobiliarios ambiguos a
# español claro que el modelo sí traduce bien. Case-insensitive, largos primero.
GLOS = [
    (re.compile(r"\bapartaestudios?\b", re.I), "apartamento tipo estudio"),
    (re.compile(r"\bcocinetas?\b", re.I), "cocina pequeña"),
    (re.compile(r"\bzona de ropas\b", re.I), "zona de lavandería"),
    (re.compile(r"\bservicios al d[íi]a\b", re.I), "servicios públicos pagados"),
    (re.compile(r"\bescrituras?\b", re.I), "título de propiedad"),
    (re.compile(r"\bpredial al d[íi]a\b", re.I), "impuesto predial pagado"),
    (re.compile(r"\bbodegas?\b", re.I), "almacén"),  # warehouse, no "winery"/"storage tank"
]


def clean(t: str) -> str:
    """Port de cleanDescripcion (ListingDrawer.tsx) — mojibake, símbolos, backslashes."""
    t = t.replace("�", "")
    t = re.sub(r"^[\s]*[?*•·▪◦‣−–—-]+[\s]+", "• ", t, flags=re.M)
    t = re.sub(r"(^|\n)\s*\?\s+", r"\1", t)
    t = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", t)
    # Backslashes sueltos = mojibake del scraper ("\ \") — el modelo los alucina
    # como ♪. En descripciones inmobiliarias nunca hay backslash legítimo.
    t = re.sub(r"\\+", " ", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    t = re.sub(r"[ \t]{2,}", " ", t)
    t = re.sub(r"[ \t]+\n", "\n", t)
    return t.strip()


def detect_lang(text: str) -> str:
    """'es' o 'en' (default 'es' — los listings son mayoría colombianos)."""
    try:
        from langdetect import DetectorFactory, detect
        DetectorFactory.seed = 0  # determinista
        return "en" if detect(text[:800]) == "en" else "es"
    except Exception:
        return "es"


def _glos(t: str) -> str:
    for rx, repl in GLOS:
        t = rx.sub(repl, t)
    return t


def _segments(text: str, max_words: int = 60):
    """Parte por líneas; líneas largas por oraciones — evita truncado del tokenizer (~512)."""
    segs = []
    for line in text.split("\n"):
        line = line.strip()
        if not line:
            continue
        if len(line.split()) <= max_words:
            segs.append(line)
        else:
            segs += [s.strip() for s in re.split(r"(?<=[.!?])\s+", line) if s.strip()]
    return segs or [text]


_cache = {}  # (src,tgt) -> (tokenizer, translator)


def _load(src: str, tgt: str):
    key = (src, tgt)
    if key not in _cache:
        import ctranslate2
        import transformers
        model_dir, tok = _MODELS[key]
        _cache[key] = (
            transformers.AutoTokenizer.from_pretrained(tok),
            ctranslate2.Translator(model_dir, device="cpu", compute_type="int8"),
        )
    return _cache[key]


def _translate_batch(texts, src: str, tgt: str):
    """Traduce una lista de textos ya limpios en la dirección src->tgt (batch real)."""
    tok, tr = _load(src, tgt)
    seg_lists = [_segments(_glos(t) if src == "es" else t) for t in texts]
    flat, spans = [], []
    for segs in seg_lists:
        start = len(flat)
        flat.extend(segs)
        spans.append((start, len(flat)))
    if not flat:
        return ["" for _ in texts]
    toks = [tok.convert_ids_to_tokens(tok.encode(s)) for s in flat]
    out = tr.translate_batch(toks, max_batch_size=32)
    en = [tok.decode(tok.convert_tokens_to_ids(o.hypotheses[0]), skip_special_tokens=True) for o in out]
    return ["\n".join(en[a:b]).strip() for a, b in spans]


def translate(text: str, src: str, tgt: str) -> str:
    """Traduce un texto en la dirección dada, preservando saltos de línea."""
    return _translate_batch([clean(text)], src, tgt)[0]


def translate_pairs(texts):
    """Para cada texto: detecta idioma, traduce al opuesto. Devuelve
    [(traduccion_al_opuesto, src_lang), ...]. Agrupa por dirección para batch."""
    cleaned = [clean(t) for t in texts]
    langs = [detect_lang(t) for t in cleaned]
    out = [None] * len(texts)
    for src, tgt in (("es", "en"), ("en", "es")):
        idx = [i for i, l in enumerate(langs) if l == src]
        if not idx:
            continue
        trans = _translate_batch([cleaned[i] for i in idx], src, tgt)
        for j, i in enumerate(idx):
            out[i] = (trans[j], src)
    return out


if __name__ == "__main__":
    # ponytail: self-check bidireccional — falla ruidoso si algún modelo se rompe.
    samples = [
        "Casa campestre en Envigado, estrato 5, servicios al día, escrituras listas.",
        "Bright studio apartment near the metro, fully furnished, all utilities included.",
    ]
    for (trad, src), es in zip(translate_pairs(samples), samples):
        print(f"[{src}] {es}\n  -> {trad}\n")
    r = translate_pairs(["escrituras listas"])[0]
    assert r[1] == "es" and ("deed" in r[0].lower() or "title" in r[0].lower()), "es->en roto"
    r = translate_pairs(["fully furnished apartment with balcony"])[0]
    assert r[1] == "en" and len(r[0]) > 5, "en->es roto"
    print("OK self-check bidireccional")
