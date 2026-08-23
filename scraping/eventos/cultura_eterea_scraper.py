"""
Cultura Etérea scraper — REST API pública.

API: https://www.culturaetereamed.com/api/v1/eventos/
     Devuelve lista JSON, paginación con limit/offset.
     Sin auth, sin Playwright.

Campos fuente → normalizer:
  id, titulo, slug, fecha_inicio, fecha_fin,
  categoria_principal, municipio, barrio,
  lat, lng, nombre_lugar, descripcion,
  imagen_url, precio, es_gratuito, fuente_url, oculto
"""
import argparse
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

import requests

sys.path.insert(0, str(Path(__file__).parent))

FUENTE = "cultura_eterea"
BASE_URL = "https://www.culturaetereamed.com/api/v1"
PAGE_SIZE = 500
HEADERS = {
    "Accept": "application/json",
    "User-Agent": "social-eventos/1.0 info.facturIA@gmail.com",
}

_MUNICIPIOS_VALLE = {
    "medellín", "medellin", "bello", "envigado",
    "itagui", "itagüí", "sabaneta", "la estrella", "la_estrella",
    "copacabana", "caldas", "girardota", "barbosa",
}

# Fuentes de CE que producen noticias/artículos, no eventos presenciales
_FUENTES_NOTICIAS_CE = frozenset({
    "agenda_Vivir en el Poblado - Agenda C",
    "agenda_Vivir en El Poblado - Agenda C",
    "agenda_Telemedellín - Agenda Cultural",
    "agenda_Bureau Medellín - Agenda Event",
    "smart_listener_rss",
    "smart_listener_caption",
})

# URLs genéricas de página de agenda (no URL de evento específico)
_GENERIC_URL_PATTERNS = (
    "/agenda-cultural-en-medellin/",
    "/agenda-cultural/",
    "/agenda-eventos-de-medellin/",
    "/index.php/agenda",
    "events/search?search=",
    "/agenda-eventos/",
)


_GENERIC_URL_PATHS = (
    "/programacion", "/agenda", "/eventos", "/cultura",
    "/noticias", "/actividades/agenda",
)
_SOCIAL_HOSTS = ("instagram.com", "facebook.com", "twitter.com", "x.com")


def _url_especifica(url: str) -> bool:
    """True solo si la URL apunta a un evento específico, no a homepage/perfil/lista genérica."""
    if not url:
        return False
    if not url.startswith(("http://", "https://")):
        return False
    parsed = urlparse(url)
    host = parsed.netloc.lower().replace("www.", "")
    path = parsed.path.rstrip("/")

    # Redes sociales: solo aceptar posts/reels específicos
    for social in _SOCIAL_HOSTS:
        if social in host:
            return "/p/" in path or "/reel/" in path

    # Short-link services → asumir que apuntan a evento específico
    if host in ("bit.ly", "buff.ly", "tinyurl.com", "ow.ly", "t.co", "lnkd.in"):
        return True

    # Sin path real → homepage genérica
    if not path or path == "":
        return False

    # Path de un solo nivel genérico
    parts = [p for p in path.split("/") if p]
    if len(parts) < 2:
        return False

    # Rutas conocidas como listas genéricas
    for generic in _GENERIC_URL_PATHS:
        if path == generic or path.endswith(generic):
            return False

    return True


def _es_noticia_ce(raw: dict) -> bool:
    """True si el item de CE es noticia/artículo, no evento presencial."""
    if raw.get("fuente", "") in _FUENTES_NOTICIAS_CE:
        return True
    url = (raw.get("fuente_url") or "").lower()
    if any(pat in url for pat in _GENERIC_URL_PATTERNS):
        return True
    return False

_CATEGORIA_MAP: dict[str, str] = {
    "teatro": "cultura",
    "música": "musica",
    "musica": "musica",
    "musica_en_vivo": "musica",
    "jazz": "musica",
    "hip_hop": "musica",
    "rock": "musica",
    "electronica": "musica",
    "concierto": "musica",
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
    "taller": "networking",
    "conferencia": "networking",
    "educación": "networking",
    "educacion": "networking",
    "deporte": "deporte",
    "deportes": "deporte",
    "gastronomia": "gastronomia",
    "bienestar": "bienestar",
    "social": "social",
    "otro": "social",
    "hibrido": "social",
}


def _normalizar_municipio(raw: str) -> str:
    if not raw:
        return ""
    return raw.strip().lower().replace("_", " ")


def _normalizar_precio(precio_raw, es_gratuito_raw) -> tuple[float, bool]:
    if isinstance(es_gratuito_raw, bool):
        if es_gratuito_raw:
            return 0.0, True
    if not precio_raw:
        return 0.0, True
    p = str(precio_raw).lower().strip()
    if any(x in p for x in ["gratis", "free", "gratuito", "libre", "$0", "entrada libre"]):
        return 0.0, True
    import re
    nums = re.findall(r"[\d]+", p.replace(",", "").replace(".", ""))
    if nums:
        try:
            return float(nums[0]), False
        except ValueError:
            pass
    return 0.0, True


def fetch_all() -> list[dict]:
    todos: list[dict] = []
    offset = 0
    while True:
        url = f"{BASE_URL}/eventos/?limit={PAGE_SIZE}&offset={offset}"
        try:
            r = requests.get(url, headers=HEADERS, timeout=20)
            if r.status_code != 200:
                print(f"[cultura_eterea] HTTP {r.status_code} en offset={offset}")
                break
            batch = r.json()
        except Exception as exc:
            print(f"[cultura_eterea] error offset={offset}: {exc}")
            break

        if not isinstance(batch, list) or not batch:
            break

        todos.extend(batch)
        print(f"[cultura_eterea] offset={offset} +{len(batch)} → {len(todos)} total")

        if len(batch) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
        time.sleep(0.3)

    return todos


def _mapear_categoria(raw: dict) -> str:
    cat = (raw.get("categoria_principal") or "").lower().strip()
    if cat in _CATEGORIA_MAP:
        return _CATEGORIA_MAP[cat]
    for c in (raw.get("categorias") or []):
        mapped = _CATEGORIA_MAP.get(c.lower().strip())
        if mapped:
            return mapped
    return cat or "social"


def normalizar_evento(raw: dict) -> dict:
    precio, gratuito = _normalizar_precio(
        raw.get("precio"), raw.get("es_gratuito")
    )
    municipio = _normalizar_municipio(raw.get("municipio", ""))
    slug = raw.get("slug", "")
    fuente_url_raw = raw.get("fuente_url") or ""
    ce_url = f"https://www.culturaetereamed.com/evento/{slug}"
    # Usar fuente_url solo si apunta a evento específico; sino fallback a CE
    fuente_url = fuente_url_raw if _url_especifica(fuente_url_raw) else ce_url

    return {
        "fuente": FUENTE,
        "fuente_id": str(raw.get("id") or slug),
        "titulo": raw.get("titulo", ""),
        "descripcion": (raw.get("descripcion") or "")[:500],
        "foto_url": raw.get("imagen_url") or None,
        "url_externo": fuente_url,
        "fecha_inicio": raw.get("fecha_inicio"),
        "fecha_fin": raw.get("fecha_fin") or None,
        "gratuito": gratuito,
        "precio": precio,
        "organizador": raw.get("nombre_lugar", ""),
        "lat": raw.get("lat") or None,
        "lon": raw.get("lng") or None,
        "categoria_raw": _mapear_categoria(raw),
        "municipio_raw": municipio,
        "barrio_raw": raw.get("barrio") or "",
        # Cultura Etérea sólo publica eventos presenciales curados
        "is_presencial": True,
    }


def run() -> list[dict]:
    print("[cultura_eterea] iniciando scraper...")
    raw_list = fetch_all()
    print(f"[cultura_eterea] {len(raw_list)} eventos raw descargados")

    resultado: list[dict] = []
    filtrados_noticia = 0
    for raw in raw_list:
        if raw.get("oculto"):
            continue
        if _es_noticia_ce(raw):
            filtrados_noticia += 1
            continue
        municipio = _normalizar_municipio(raw.get("municipio", ""))
        if municipio and municipio not in _MUNICIPIOS_VALLE:
            continue
        resultado.append(normalizar_evento(raw))

    print(f"[cultura_eterea] {filtrados_noticia} noticias/agendas genéricas filtradas")
    print(f"[cultura_eterea] {len(resultado)} eventos presenciales del Valle normalizados")
    return resultado


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--test", action="store_true", help="Solo mostrar muestra, no escribir DB")
    args = parser.parse_args()

    eventos = run()

    if args.test:
        for e in eventos[:10]:
            print(f"\n  {e['titulo']}")
            print(f"    fecha:     {e['fecha_inicio']}")
            print(f"    municipio: {e['municipio_raw']}")
            print(f"    categoria: {e['categoria_raw']}")
            print(f"    foto:      {'✅' if e['foto_url'] else '❌'}")
            print(f"    precio:    {'Gratis' if e['gratuito'] else e['precio']}")
            print(f"    url:       {e['url_externo'][:70]}")
        print(f"\nTotal: {len(eventos)}")
    else:
        sys.path.insert(0, str(Path(__file__).parent))
        from config import get_conn
        from normalizer import cargar_eventos, limpiar_eventos_pasados

        conn = get_conn()
        try:
            ins, err, filt = cargar_eventos(conn, eventos)
            limpiados = limpiar_eventos_pasados(conn)
            print(f"[cultura_eterea] insertados/actualizados: {ins} | errores: {err} | filtrados: {filt} | pasados desactivados: {limpiados}")
        finally:
            conn.close()
