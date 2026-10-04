"""
RSS scraper — El Colombiano cultural news ticker.
Filters: neg keywords (title+body), positive keywords (title), last 48h only.
Long titles summarized via HF Inference API (mT5 multilingual XLSum).
"""
import os
import time
from datetime import datetime, timedelta

import feedparser
import psycopg2
from bs4 import BeautifulSoup

# El Colombiano no tiene RSS nativo; Google News RSS por sección
_GN_BASE = "https://news.google.com/rss/search?hl=es-419&gl=CO&ceid=CO:es-419&q="

RSS_FEEDS = [
    {"url": f"{_GN_BASE}site:elcolombiano.com+cultura+medellín", "fuente": "el_colombiano", "seccion": "cultura"},
    {"url": f"{_GN_BASE}site:elcolombiano.com+entretenimiento+medellín", "fuente": "el_colombiano", "seccion": "entretenimiento"},
    {"url": f"{_GN_BASE}site:elcolombiano.com+medellín", "fuente": "el_colombiano", "seccion": "medellin"},
    {"url": f"{_GN_BASE}site:elcolombiano.com+deporte+medellín", "fuente": "el_colombiano", "seccion": "deportes"},
]

PALABRAS_NEGATIVAS = [
    # Violencia y crimen
    "muerto", "muertos", "asesinado", "asesinaron",
    "homicidio", "balacera", "disparo", "bala",
    "herido", "heridos", "masacre", "sicario",
    "capturado", "capturaron", "detenido", "preso",
    "robo", "hurto", "atraco", "fleteo",
    "extorsión", "secuestro", "violación",
    "narcotráfico", "droga", "cocaína",
    "ELN", "guerrilla", "paramilitar", "banda",
    # Accidentes
    "accidente", "choque", "volcó", "cayó",
    "derrumbe", "incendio", "emergencia",
    "desastre", "tragedia", "víctima", "víctimas",
    # Política (todo tema político fuera)
    "presidente", "presidenta", "expresidente",
    "política", "político", "políticos",
    "elección", "elecciones", "electoral", "votación", "urnas",
    "senador", "senadora", "senado", "congreso", "congresista",
    "ministro", "ministra", "ministerio",
    "alcalde", "alcaldesa", "gobernador", "gobernadora",
    "candidato", "candidata", "candidatura",
    "gobierno", "oposición", "referendo", "plebiscito",
    "diputado", "concejal", "decreto", "reforma",
    "petro", "uribe", "duque", "maduro", "trump", "biden",
    # Política negativa
    "escándalo", "corrupción", "investigado",
    "demanda", "destitución", "sanción",
    "protesta", "bloqueo", "paro", "huelga",
    # Economía negativa
    "crisis", "quiebra", "cierre", "desempleo",
    "inflación", "pobreza", "deuda",
    # Salud negativa
    "epidemia", "pandemia", "contagio", "brote",
    "muerte", "fallecido", "hospital", "urgencias",
    # Alertas
    "urgente", "alerta", "peligro", "amenaza",
    "advertencia", "prohibición", "restricción",
    # Judicial
    "juicio", "condena", "sentencia", "fiscal",
    "imputado", "acusado", "procesado",
    "cárcel", "prisión", "reclusión",
    # Desastres naturales
    "terremoto", "inundación", "deslizamiento",
    "avalancha", "vendaval", "granizada",
    # Adicional
    "heroína", "bazuco", "marihuana",
    "ataque", "atentado", "bomba",
    "tiroteo", "enfrentamiento", "combate",
    "fallecimiento", "luto", "sepelio",
    "lesionado", "mutilado", "quemado",
    "murió", "robaron",
    # Salud negativa adicional
    "espera", "remisión", "clínica", "eps",
    "tutela", "queja", "denuncia", "demora",
    "falla", "negligencia", "paciente",
    "enfermo", "diagnóstico", "cirugía",
    # Acoso y violencia social
    "acoso", "abuso", "agresión", "maltrato",
    "discriminación", "insulto",
    "gringo", "xenofobia", "racismo",
    # Problemas sociales
    "habitante de calle", "habitantes de calle",
    "habitante de la calle", "habitantes de la calle",
    "indigente", "indigencia", "mendigo", "mendicidad",
    "polémica", "controversia",
    # Vivienda / desalojos (raíces cubren variantes)
    "desaloj", "demol", "desahucio", "desplazad",
    "desplazamiento forzado", "tumbaron", "invasores",
    "rechazo", "inconformidad",
    "reclamo", "anomalía",
    "irregularidad", "problema",
    # Política negativa adicional
    "pelea", "disputa",
    "pugna", "división", "conflicto",
    # Economía negativa adicional
    "carestía", "escasez", "desabastecimiento",
    # Seguridad vial
    "volcamiento", "atropellado",
    # Desapariciones (raíz cubre desapareció/desaparecer/desaparecido/desaparecieron)
    "desaparec",
    # Guerra y conflicto armado
    "guerra", "guerras", "bélico", "invasión",
    # Minería
    "minería", "mineria", "minero", "minera",
    # Feminicidio y violencia de género
    "feminicidio", "feminicidios", "feminicida",
    "femicidio", "femicidios",
    "violencia de género", "violencia intrafamiliar",
    "violencia doméstica", "violencia machista",
    "violador", "violadores", "abuso sexual",
    "abusador", "abusadores",
    # Rescates y operativos
    "rescate", "rescates", "rescatado", "rescatada",
    "rescatados", "rescatadas", "rescataron", "rescatar",
    "salvó", "salvaron", "salvamento", "salvar",
    "operativo", "operativos", "allanamiento",
    "redada", "evacuación", "evacuados", "evacuadas",
    "socorro", "auxilio",
    # Política adicional
    "asamblea", "concejo municipal", "curul", "veto",
    # Economía (toda mención, no solo negativa)
    "economía", "económic", "dólar", "impuesto", "impuestos",
    "arancel", "aranceles", "pib", "bolsa de valores",
    "tasa de cambio", "salario mínimo",
    # Otros países (blindaje extra; el query RSS ya exige "medellín")
    # nota: se excluyen "chile"/"china" por choque con gastronomía/uso común
    "estados unidos", "venezuela", "ecuador", "perú",
    "argentina", "brasil", "méxico", "rusia", "ucrania",
    "israel", "palestina", "europa", "españa",
]

KEYWORDS_POSITIVOS = [
    "medellín", "antioquia", "festival",
    "cultura", "música", "arte", "teatro",
    "gastronomía", "restaurante", "concierto",
    "exposición", "inauguración", "celebración",
    "premio", "reconocimiento", "récord",
    "deporte", "atletismo", "ciclismo",
    "patrimonio", "turismo", "innovación",
    "emprendimiento", "comunidad", "barrio",
    "parque", "museo", "biblioteca", "tango",
    "jazz", "folclor", "danza", "cine",
    "libro", "literatura", "fotografía",
]

_CUTOFF_48H = timedelta(hours=48)

_TITULO_SUFFIXES = [
    " | El Colombiano - El Colombiano",
    " - El Colombiano",
    " | El Colombiano",
]


_MAX_TITULO_CHARS = 80


def limpiar_titulo(titulo: str) -> str:
    for suffix in _TITULO_SUFFIXES:
        if titulo.endswith(suffix):
            titulo = titulo[: -len(suffix)]
    return titulo.strip()


def resumir_titulo(titulo: str) -> str:
    if len(titulo) <= _MAX_TITULO_CHARS:
        return titulo
    return titulo[:_MAX_TITULO_CHARS].rsplit(" ", 1)[0] + "..."


def es_noticia_positiva(titulo: str) -> bool:
    t = titulo.lower()
    return not any(p.lower() in t for p in PALABRAS_NEGATIVAS)


def es_noticia_relevante(titulo: str) -> bool:
    t = titulo.lower()
    return any(k in t for k in KEYWORDS_POSITIVOS)


def extraer_body(entry) -> str:
    """Extract plain text from RSS entry summary/content."""
    raw = ""
    if entry.get("content"):
        raw = entry.content[0].get("value", "")
    elif entry.get("summary"):
        raw = entry.get("summary", "")
    elif entry.get("description"):
        raw = entry.get("description", "")
    if not raw:
        return ""
    return BeautifulSoup(raw, "html.parser").get_text(separator=" ", strip=True)


def scrape_rss_feed(feed_config: dict) -> tuple[list[dict], int]:
    """Returns (noticias_aprobadas, total_entries)."""
    print(f"Scraping: {feed_config['seccion']}")
    feed = feedparser.parse(feed_config["url"])

    if feed.bozo:
        print(f"  Error parsing RSS: {feed.bozo_exception}")
        return [], 0

    cutoff = datetime.now() - _CUTOFF_48H
    noticias = []

    for entry in feed.entries:
        titulo = limpiar_titulo(entry.get("title", "").strip())
        url = entry.get("link", "").strip()
        if not titulo or not url:
            continue

        fecha = None
        if entry.get("published_parsed"):
            fecha = datetime(*entry.published_parsed[:6])

        if fecha and fecha < cutoff:
            continue

        if not es_noticia_positiva(titulo):
            print(f"  [-neg-t] {titulo[:70]}")
            continue

        if not es_noticia_relevante(titulo):
            print(f"  [-rel]   {titulo[:70]}")
            continue

        body = extraer_body(entry)
        if body and not es_noticia_positiva(body):
            print(f"  [-neg-b] {titulo[:70]}")
            continue

        titulo_final = resumir_titulo(titulo)
        noticias.append({"fuente": feed_config["fuente"], "titulo": titulo_final, "url": url, "fecha_publicacion": fecha})
        print(f"  [+]      {titulo_final[:70]}")

    return noticias, len(feed.entries)


def cargar_noticias(conn, noticias: list[dict]) -> int:
    cur = conn.cursor()
    cargadas = 0
    for n in noticias:
        try:
            cur.execute(
                """
                INSERT INTO public.noticias (fuente, titulo, url, fecha_publicacion)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (url) DO UPDATE SET
                    titulo            = EXCLUDED.titulo,
                    fecha_publicacion = EXCLUDED.fecha_publicacion,
                    activa            = TRUE
                """,
                (n["fuente"], n["titulo"], n["url"], n["fecha_publicacion"]),
            )
            cargadas += 1
        except Exception as e:
            conn.rollback()
            print(f"  Error insert: {e}")
    conn.commit()
    cur.close()
    return cargadas


def limpiar_noticias_viejas(conn) -> int:
    cur = conn.cursor()
    cur.execute("""
        DELETE FROM public.noticias
        WHERE fecha_publicacion < NOW() - INTERVAL '48 hours'
           OR fecha_publicacion IS NULL
    """)
    deleted = cur.rowcount
    conn.commit()
    cur.close()
    print(f"Eliminadas {deleted} noticias viejas/sin fecha")
    return deleted


def run() -> dict:
    conn = psycopg2.connect(os.environ["DATABASE_URL"])

    total_cargadas = 0
    total_feed_entries = 0
    total_pasaron = 0
    ejemplos_ok: list[str] = []
    ejemplos_neg: list[str] = []
    ejemplos_irrel: list[str] = []

    for feed_config in RSS_FEEDS:
        feed_raw = feedparser.parse(feed_config["url"])
        total_feed_entries += len(feed_raw.entries)

        for entry in feed_raw.entries:
            titulo = limpiar_titulo(entry.get("title", "").strip())
            if not titulo:
                continue
            body = extraer_body(entry)
            neg_titulo = not es_noticia_positiva(titulo)
            neg_body   = bool(body) and not es_noticia_positiva(body)
            if (neg_titulo or neg_body) and len(ejemplos_neg) < 5:
                label = "[neg-b]" if not neg_titulo else "[neg-t]"
                ejemplos_neg.append(f"{label} {titulo}")
            elif es_noticia_positiva(titulo) and not es_noticia_relevante(titulo) and len(ejemplos_irrel) < 5:
                ejemplos_irrel.append(titulo)

        noticias, _ = scrape_rss_feed(feed_config)
        for n in noticias:
            if len(ejemplos_ok) < 5:
                ejemplos_ok.append(n["titulo"])

        total_pasaron += len(noticias)
        cargadas = cargar_noticias(conn, noticias)
        total_cargadas += cargadas
        print(f"  Cargadas: {cargadas}/{len(noticias)}")
        time.sleep(1)

    deleted = limpiar_noticias_viejas(conn)
    conn.close()

    total_filtradas = total_feed_entries - total_pasaron

    print(f"\n{'='*50}")
    print(f"Total feed entries : {total_feed_entries}")
    print(f"Pasaron filtro     : {total_pasaron}")
    print(f"Filtradas total    : {total_filtradas}")
    print(f"  por neg keywords : {sum(1 for e in ejemplos_neg)}")
    print(f"Cargadas en DB     : {total_cargadas}")
    print(f"Eliminadas (viejas): {deleted}")
    print(f"\nEjemplos OK:")
    for t in ejemplos_ok:
        print(f"  • {t}")
    print(f"\nFiltradas (neg):")
    for t in ejemplos_neg:
        print(f"  • {t}")
    print(f"\nFiltradas (irrelevantes):")
    for t in ejemplos_irrel:
        print(f"  • {t}")

    return {
        "total_feed_entries": total_feed_entries,
        "total_pasaron": total_pasaron,
        "total_filtradas": total_filtradas,
        "total_cargadas": total_cargadas,
        "deleted_old": deleted,
        "ejemplos_ok": ejemplos_ok,
        "ejemplos_neg": ejemplos_neg,
        "ejemplos_irrel": ejemplos_irrel,
    }


if __name__ == "__main__":
    run()
