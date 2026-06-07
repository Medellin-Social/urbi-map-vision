"""
Unified normalizer + DB loader for eventos scrapers.

Handles:
  - categoria_raw → canonical categoria
  - categoria → tipo_audiencia
  - barrio assignment via PostGIS PIP
  - UPSERT into public.eventos
  - Cleanup of past events
"""
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import time

import psycopg2
import psycopg2.extras
import requests

sys.path.insert(0, str(Path(__file__).parent))
from config import get_conn, asignar_barrio

_NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
_NOMINATIM_HEADERS = {"User-Agent": "urbidata-eventos/1.0 info.facturIA@gmail.com"}


def geocodificar_direccion(direccion: str) -> tuple[float, float] | tuple[None, None]:
    if not direccion:
        return None, None
    try:
        r = requests.get(
            _NOMINATIM_URL,
            params={"q": direccion, "format": "json", "limit": 1, "countrycodes": "co"},
            headers=_NOMINATIM_HEADERS,
            timeout=8,
        )
        hits = r.json()
        if hits:
            return float(hits[0]["lat"]), float(hits[0]["lon"])
    except Exception:
        pass
    return None, None

CATEGORIAS_MAP: dict[str, str] = {
    # Meetup
    "SOCIAL": "social",
    "TECH": "tech",
    "HEALTH_WELLBEING": "bienestar",
    "SPORTS_FITNESS": "deporte",
    "ARTS_CULTURE": "cultura",
    "FOOD_DRINK": "gastronomia",
    "MUSIC": "musica",
    "BUSINESS": "networking",
    "OUTDOORS_ADVENTURE": "deporte",
    "PHOTOGRAPHY": "cultura",
    "LANGUAGE_CULTURE": "cultura",
    # Eventbrite
    "music": "musica",
    "business": "networking",
    "food-and-drink": "gastronomia",
    "community": "social",
    "arts": "cultura",
    "sports-and-fitness": "deporte",
    "health": "bienestar",
    "science-and-tech": "tech",
    "travel-and-outdoor": "deporte",
    "charity-and-causes": "social",
    # Lu.ma
    "tech": "tech",
    "wellness": "bienestar",
    "social": "social",
    "sports": "deporte",
    # medellin.travel (schema.org eventAttendanceMode / @type)
    "EventMovieScreening": "cultura",
    "EventMusicPerformance": "musica",
    "SportsEvent": "deporte",
    "TheaterEvent": "cultura",
    "VisualArtsEvent": "cultura",
    "FoodEvent": "gastronomia",
    "EducationEvent": "networking",
    "BusinessEvent": "networking",
    "SocialEvent": "social",
    "ExhibitionEvent": "cultura",
    "DanceEvent": "cultura",
    # tuboleta
    "Concierto": "musica",
    "Teatro": "cultura",
    "Deporte": "deporte",
    "Stand Up": "cultura",
    "Festival": "musica",
    "Opera": "cultura",
    "Danza": "cultura",
    "Infantil": "social",
    "Humor": "cultura",
    # Alcaldía Medellín
    "Cultura": "cultura",
    "Educación": "networking",
    "Inclusión": "social",
    "Recreación": "deporte",
    # Cultura Etérea
    "teatro": "cultura",
    "musica_en_vivo": "musica",
    "jazz": "musica",
    "hip_hop": "musica",
    "rock": "musica",
    "electronica": "musica",
    "danza": "cultura",
    "cine": "cultura",
    "galeria": "cultura",
    "exposición": "cultura",
    "exposicion": "cultura",
    "arte_contemporaneo": "cultura",
    "arte": "cultura",
    "literatura": "cultura",
    "poesia": "cultura",
    "fotografia": "cultura",
    "casa_cultura": "cultura",
    "centro_cultural": "cultura",
    "festival": "cultura",
    "feria": "social",
    "hibrido": "social",
    # Passthrough (already canonical)
    "musica": "musica",
    "networking": "networking",
    "gastronomia": "gastronomia",
    "cultura": "cultura",
    "bienestar": "bienestar",
    "deporte": "deporte",
}

_KEYWORD_CATEGORIA: list[tuple[str, list[str]]] = [
    ("musica",      ["concierto", "música", "musica", "rock", "jazz", "reggaeton", "banda", "cantante", "dj set", "festival music", "pop", "metal", "salsa", "cumbia", "vallenato"]),
    ("deporte",     ["hyrox", "run club", "carrera", "maratón", "marathon", "fútbol", "futbol", "crossfit", "yoga", "ciclismo", "natación", "tenis", "basketball", "voleibol", "triatlón", "trail"]),
    ("bienestar",   ["meditación", "meditacion", "mindfulness", "wellness", "salud mental", "bienestar", "respiración", "terapia", "sanación"]),
    ("tech",        ["flutter", "python", "javascript", "react", "aws", "cloud", "ia", "inteligencia artificial", "hackathon", "startup", "devops", "blockchain", "web3", "data science", "machine learning", "ai", "tech", "código", "codigo", "programación", "developer"]),
    ("networking",  ["networking", "coworking", "emprendimiento", "negocios", "inversión", "pitch", "workshop", "bootcamp", "capacitación", "formación", "conferencia", "summit", "meetup"]),
    ("gastronomia", ["gastronomía", "gastronomia", "cocina", "chef", "cata", "wine", "cerveza", "bar", "restaurante", "food", "brunch", "cena", "degustación", "maridaje"]),
    ("cultura",     ["teatro", "exposición", "exposicion", "arte", "cine", "museum", "museo", "danza", "ballet", "ópera", "opera", "stand up", "comedia", "literatura", "libro", "poesía", "poesia", "fotografía", "fotografia", "cultura", "festival cultural"]),
    ("social",      ["comunidad", "community", "social", "encuentro", "reunión", "reunion", "fiesta", "party", "celebración", "kids", "familiar", "familia", "intercambio"]),
]


def _infer_categoria(titulo: str, descripcion: str = "") -> str:
    text = (titulo + " " + descripcion).lower()
    for categoria, keywords in _KEYWORD_CATEGORIA:
        if any(kw in text for kw in keywords):
            return categoria
    return "social"

TIPO_AUDIENCIA_MAP: dict[str, str] = {
    "networking": "profesional",
    "tech": "profesional",
    "musica": "social",
    "gastronomia": "social",
    "cultura": "social",
    "social": "social",
    "deporte": "activo",
    "bienestar": "activo",
}

_VIRTUAL_KEYWORDS = (
    "online", "virtual", "zoom", "teams", "meet.google",
    "webinar", "livestream", "streaming", "remoto",
    "digital", "youtube.com", "twitch",
)


def es_evento_virtual(raw: dict) -> bool:
    if raw.get("is_presencial"):
        return False
    if raw.get("is_online"):
        return True
    titulo = (raw.get("titulo") or "").lower()
    desc = (raw.get("descripcion") or "").lower()
    url = (raw.get("url_externo") or "").lower()
    for kw in _VIRTUAL_KEYWORDS:
        if kw in titulo or kw in desc or kw in url:
            return True
    # No coords + no dirección → probable virtual
    if not raw.get("lat") and not raw.get("lon") and not raw.get("direccion"):
        return True
    return False

UPSERT_SQL = """
INSERT INTO public.eventos (
    fuente, fuente_id, titulo, descripcion,
    foto_url, url_externo,
    fecha_inicio, fecha_fin,
    gratuito, precio, moneda, organizador,
    lat, lon, barrio_id, ciudad_id,
    categoria, tipo_audiencia, activo
) VALUES (
    %(fuente)s, %(fuente_id)s, %(titulo)s, %(descripcion)s,
    %(foto_url)s, %(url_externo)s,
    %(fecha_inicio)s, %(fecha_fin)s,
    %(gratuito)s, %(precio)s, %(moneda)s, %(organizador)s,
    %(lat)s, %(lon)s, %(barrio_id)s, 1,
    %(categoria)s, %(tipo_audiencia)s, TRUE
)
ON CONFLICT (fuente, fuente_id) WHERE fuente_id IS NOT NULL
DO UPDATE SET
    titulo        = EXCLUDED.titulo,
    descripcion   = EXCLUDED.descripcion,
    foto_url      = COALESCE(EXCLUDED.foto_url, public.eventos.foto_url),
    gratuito      = EXCLUDED.gratuito,
    precio        = EXCLUDED.precio,
    moneda        = EXCLUDED.moneda,
    lat           = COALESCE(EXCLUDED.lat,       public.eventos.lat),
    lon           = COALESCE(EXCLUDED.lon,       public.eventos.lon),
    barrio_id     = COALESCE(EXCLUDED.barrio_id, public.eventos.barrio_id),
    fecha_inicio  = EXCLUDED.fecha_inicio,
    fecha_fin     = EXCLUDED.fecha_fin,
    updated_at    = NOW()
WHERE public.eventos.fecha_inicio > NOW()
"""


def normalizar(raw: dict) -> dict | None:
    if es_evento_virtual(raw):
        return None

    cat_raw = (raw.get("categoria_raw") or "").strip()
    if cat_raw in CATEGORIAS_MAP:
        categoria = CATEGORIAS_MAP[cat_raw]
    else:
        categoria = _infer_categoria(
            raw.get("titulo", ""),
            raw.get("descripcion", ""),
        )
    tipo_audiencia = TIPO_AUDIENCIA_MAP.get(categoria, "social")

    fecha_inicio = raw.get("fecha_inicio")
    if isinstance(fecha_inicio, str):
        fecha_inicio = fecha_inicio.replace("Z", "+00:00")

    fecha_fin = raw.get("fecha_fin")
    if isinstance(fecha_fin, str):
        fecha_fin = fecha_fin.replace("Z", "+00:00")

    return {
        "fuente": raw["fuente"],
        "fuente_id": str(raw.get("fuente_id", "") or "")[:255] or None,
        "titulo": (raw.get("titulo") or "")[:500],
        "descripcion": (raw.get("descripcion") or "")[:2000],
        "foto_url": raw.get("foto_url"),
        "url_externo": (raw.get("url_externo") or "")[:1000] or None,
        "fecha_inicio": fecha_inicio,
        "fecha_fin": fecha_fin,
        "gratuito": bool(raw.get("gratuito", True)),
        "precio": float(raw.get("precio") or 0),
        "moneda": (raw.get("moneda") or "COP").upper()[:10],
        "organizador": (raw.get("organizador") or "")[:300],
        "lat": raw.get("lat"),
        "lon": raw.get("lon"),
        "categoria": categoria,
        "tipo_audiencia": tipo_audiencia,
    }


def cargar_eventos(conn, eventos: list[dict]) -> tuple[int, int, int]:
    insertados = 0
    errores = 0
    filtrados = 0
    with conn.cursor() as cur:
        for raw in eventos:
            try:
                e = normalizar(raw)
                if e is None:
                    filtrados += 1
                    continue
                if not e["fuente_id"] or not e["fecha_inicio"]:
                    continue
                if not e["lat"] and raw.get("direccion"):
                    e["lat"], e["lon"] = geocodificar_direccion(raw["direccion"])
                    if e["lat"]:
                        time.sleep(1)  # Nominatim rate limit: 1 req/s
                e["barrio_id"] = asignar_barrio(cur, e["lat"], e["lon"])
                cur.execute(UPSERT_SQL, e)
                insertados += 1
            except Exception as exc:
                errores += 1
                print(f"[normalizer] error en '{raw.get('titulo', '?')}': {exc}")
                conn.rollback()
                continue
    conn.commit()
    return insertados, errores, filtrados


def limpiar_eventos_pasados(conn) -> int:
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE public.eventos
            SET activo = FALSE
            WHERE fecha_inicio < NOW() - INTERVAL '1 day'
            AND activo = TRUE
        """)
        count = cur.rowcount
    conn.commit()
    return count


def run_todos(
    meetup_eventos: list[dict],
    eventbrite_eventos: list[dict],
    luma_eventos: list[dict],
    medellin_travel_eventos: list[dict] | None = None,
    tuboleta_eventos: list[dict] | None = None,
    alcaldia_eventos: list[dict] | None = None,
    cultura_eterea_eventos: list[dict] | None = None,
) -> dict:
    medellin_travel_eventos = medellin_travel_eventos or []
    tuboleta_eventos = tuboleta_eventos or []
    alcaldia_eventos = alcaldia_eventos or []
    cultura_eterea_eventos = cultura_eterea_eventos or []

    conn = get_conn()
    try:
        todos = (
            meetup_eventos + eventbrite_eventos + luma_eventos
            + medellin_travel_eventos + tuboleta_eventos + alcaldia_eventos
            + cultura_eterea_eventos
        )
        insertados, errores, filtrados = cargar_eventos(conn, todos)
        limpiados = limpiar_eventos_pasados(conn)
        return {
            "total_procesados": len(todos),
            "virtuales_filtrados": filtrados,
            "insertados_actualizados": insertados,
            "errores": errores,
            "eventos_pasados_desactivados": limpiados,
            "por_fuente": {
                "meetup": len(meetup_eventos),
                "eventbrite": len(eventbrite_eventos),
                "luma": len(luma_eventos),
                "medellin_travel": len(medellin_travel_eventos),
                "tuboleta": len(tuboleta_eventos),
                "alcaldia": len(alcaldia_eventos),
                "cultura_eterea": len(cultura_eterea_eventos),
            },
        }
    finally:
        conn.close()
