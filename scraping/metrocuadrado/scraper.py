"""
Scraper Metrocuadrado — apartamentos y casas en venta y arriendo, Valle de Aburrá.

Lee los listings del HTML server-rendered (payload RSC de Next.js). La vieja REST
API con X-Api-Key quedó deprecada en 2026-11 (ver nota "Configuración" abajo).

Uso:
    python -m scraping.metrocuadrado.scraper                       # Medellín completo
    python -m scraping.metrocuadrado.scraper --municipios all_valle # 10 municipios
    python -m scraping.metrocuadrado.scraper --municipios envigado sabaneta
    python -m scraping.metrocuadrado.scraper --dry-run --max-pages 2
    python -m scraping.metrocuadrado.scraper --tipos venta

Captura de atribución (2026-11): cada listing guarda contacto_phone/whatsapp,
company_id (midempresa), anunciante_tipo (Inmobiliaria/Persona natural) y realtor_key
del payload de resultados; company_name se resuelve con 1 fetch por agencia a la
ficha. Dato personal → guardar, NO exponer el teléfono en el mapa público (Ley 1581).

Notas del payload de resultados:
    - Listings incluyen lat/lon directamente en campo `localizacion`
    - Parámetro `city` acepta slugs de municipio (medellin, envigado, itagui, etc.)
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import math
import os
import random
import re
import sys
import time
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import psycopg2
import psycopg2.extras
import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent.parent / ".env")

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from scraping.utils.db import get_connection
from scraping.utils.dedup import dedup_hash as _shared_dedup_hash
from scraping.utils.quality import (
    RunStats,
    http_get,
    implausible_reason,
    record_run,
    resolve_barrio,
    scraper_user_agent,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuración — fuente de datos
# ---------------------------------------------------------------------------
# Metrocuadrado migró (2026-11) a un SPA Next.js: la vieja REST API con X-Api-Key
# (/rest-search/search) quedó deprecada (da 401, el frontend la abandonó, la key
# pública desapareció del HTML). Los listings ahora llegan server-rendered dentro
# del HTML de las páginas de resultados, embebidos en el payload RSC
# (self.__next_f) como objetos JSON con los MISMOS campos m* de antes
# (mvalorventa/marea/localizacion/estrato/...) → _parse_listing se reusa tal cual,
# sin cambios. No se necesita API key.
#
# LÍMITE conocido: la paginación es 100% client-side (pedir ?page=N por requests —
# incluso con curl_cffi/cookies/headers RSC — devuelve ~la misma página 1). Solo la
# PÁGINA 1 por config es extraíble de forma confiable (~50-65 listings, pero con
# datos COMPLETOS: precio/área/lat-lon/estrato/fotos/amenidades). Cobertura parcial
# vs el total del portal → la pasada se registra como INCOMPLETA (ver record_run),
# así la regla de stale (deactivate_stale_listings) NUNCA da de baja los listings
# que esta pasada no alcanza (solo da de baja tras 2 pasadas 'complete' = ≥95%).
API_URL = "https://www.metrocuadrado.com"

# tipo (API/DB) -> slug plural de la URL de resultados del portal
_TIPO_URL_SLUG = {
    "apartamento":   "apartamentos",
    "apartaestudio": "apartaestudios",
    "casa":          "casas",
    "local":         "locales",
    "oficina":       "oficinas",
    "bodega":        "bodegas",
    "lote":          "lotes",
}


def _find_balanced(s: str, start: int) -> str | None:
    """Primer objeto {...} balanceado desde `start`. Sirve sobre el stream RSC
    escapado: las llaves NO van escapadas (solo las comillas: \\")."""
    i = s.find("{", start)
    if i < 0:
        return None
    depth = 0
    for j in range(i, len(s)):
        c = s[j]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return s[i:j + 1]
    return None


def _extract_initial_results(html: str) -> dict | None:
    """Saca initialResults{totalHits, results:[...]} del HTML de resultados. Viene
    escapado dentro del stream RSC (\\"initialResults\\":{...}): se decodifican los
    escapes de string JS (json.loads de la cadena) y luego se parsea el JSON."""
    key = html.find(r'\"initialResults\"')
    if key >= 0:
        esc = _find_balanced(html, key)
        if not esc:
            return None
        try:
            return json.loads(json.loads('"' + esc + '"'))
        except Exception:
            return None
    # fallback defensivo por si algún día viene sin escapar
    key = html.find('"initialResults"')
    if key < 0:
        return None
    raw = _find_balanced(html, key)
    try:
        return json.loads(raw) if raw else None
    except Exception:
        return None


def _norm_phone(raw) -> str | None:
    """Teléfono → solo dígitos, sin prefijo país 57. El payload da el whatsapp con
    57 (573028622656) y contactPhone sin él (3028622656); la ficha ambos sin él.
    Normalizar para que el mismo oferente no se parta en varias llaves."""
    d = re.sub(r"\D", "", str(raw or ""))
    if d.startswith("57") and len(d) > 10:
        d = d[2:]
    return d or None


def _company_name_from_html(html: str) -> str | None:
    """Nombre de la agencia de una ficha MC. Vive en el payload RSC como
    "companyName":"..." (escapado o no). Solo la ficha lo trae; los resultados no."""
    for pat in (r'\\"companyName\\":\\"((?:[^\\"]|\\.)*?)\\"',
                r'"companyName":"((?:[^"\\]|\\.)*?)"'):
        m = re.search(pat, html)
        if m:
            try:
                name = json.loads('"' + m.group(1) + '"')
            except Exception:
                name = m.group(1)
            return (name or "").strip() or None
    return None


PAGE_SIZE = 60  # tamaño natural de la página de resultados del portal (~50-65)

# Municipios del Valle de Aburrá — slug URL → nombre display
MUNICIPIOS_VALLE: dict[str, str] = {
    "medellin":    "Medellín",
    "envigado":    "Envigado",
    "itagui":      "Itagüí",
    "sabaneta":    "Sabaneta",
    "bello":       "Bello",
    "la-estrella": "La Estrella",
    "copacabana":  "Copacabana",
    "girardota":   "Girardota",
    "barbosa":     "Barbosa",
    "caldas":      "Caldas",
}

# Verified 2026-06-04: all values accepted by MQ REST API (realEstateTypeList param).
# lote: venta only (arriendo lots are not a real market segment).
BASE_CONFIGS = [
    {"tipo_inmueble": "apartamento",   "tipo_operacion": "venta"},
    {"tipo_inmueble": "apartamento",   "tipo_operacion": "arriendo"},
    {"tipo_inmueble": "apartaestudio", "tipo_operacion": "venta"},
    {"tipo_inmueble": "apartaestudio", "tipo_operacion": "arriendo"},
    {"tipo_inmueble": "casa",          "tipo_operacion": "venta"},
    {"tipo_inmueble": "casa",          "tipo_operacion": "arriendo"},
    {"tipo_inmueble": "local",         "tipo_operacion": "venta"},
    {"tipo_inmueble": "local",         "tipo_operacion": "arriendo"},
    {"tipo_inmueble": "oficina",       "tipo_operacion": "venta"},
    {"tipo_inmueble": "oficina",       "tipo_operacion": "arriendo"},
    {"tipo_inmueble": "bodega",        "tipo_operacion": "venta"},
    {"tipo_inmueble": "bodega",        "tipo_operacion": "arriendo"},
    {"tipo_inmueble": "lote",          "tipo_operacion": "venta"},
]

_BASE_HEADERS = {
    "User-Agent": scraper_user_agent(),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-CO,es;q=0.9,en;q=0.8",
    "Referer": "https://www.metrocuadrado.com/",
}

# ---------------------------------------------------------------------------
# Dedup hash
# ---------------------------------------------------------------------------

def calcular_dedup_hash(barrio_raw, tipo_inmueble, tipo_operacion, habitaciones, banos, area_m2, precio) -> str:
    """Kept for callers/tests; the formula lives in scraping/utils/dedup.py."""
    return _shared_dedup_hash(barrio_raw, tipo_inmueble, tipo_operacion, habitaciones, banos, area_m2, precio)


# ---------------------------------------------------------------------------
# SQL
# ---------------------------------------------------------------------------
CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS raw.listings_metrocuadrado (
    id                SERIAL PRIMARY KEY,
    fuente            TEXT NOT NULL DEFAULT 'metrocuadrado',
    tipo_operacion    TEXT,
    tipo_inmueble     TEXT,
    precio            NUMERIC,
    area_m2           NUMERIC,
    habitaciones      INTEGER,
    banos             INTEGER,
    direccion_raw     TEXT,
    barrio_raw        TEXT,
    municipio_raw     TEXT,
    url               TEXT,
    lat               DOUBLE PRECISION,
    lon               DOUBLE PRECISION,
    estrato           INTEGER,
    fecha_scraping    TIMESTAMPTZ DEFAULT NOW(),
    activo            BOOLEAN DEFAULT TRUE,
    barrio_id         INTEGER REFERENCES raw.barrios(id),
    raw_data          JSONB,
    fecha_publicacion DATE,
    dias_en_mercado   INTEGER,
    dedup_hash        VARCHAR,
    fotos             TEXT[]
);
ALTER TABLE raw.listings_metrocuadrado ADD COLUMN IF NOT EXISTS fecha_publicacion DATE;
ALTER TABLE raw.listings_metrocuadrado ADD COLUMN IF NOT EXISTS dias_en_mercado   INTEGER;
ALTER TABLE raw.listings_metrocuadrado ADD COLUMN IF NOT EXISTS dedup_hash        VARCHAR;
ALTER TABLE raw.listings_metrocuadrado ADD COLUMN IF NOT EXISTS municipio_raw     TEXT;
ALTER TABLE raw.listings_metrocuadrado ADD COLUMN IF NOT EXISTS fotos             TEXT[];
ALTER TABLE raw.listings_metrocuadrado ADD COLUMN IF NOT EXISTS last_seen_at      TIMESTAMPTZ;
ALTER TABLE raw.listings_metrocuadrado ADD COLUMN IF NOT EXISTS destacado         BOOLEAN;
ALTER TABLE raw.listings_metrocuadrado ADD COLUMN IF NOT EXISTS anunciante_tipo   TEXT;
ALTER TABLE raw.listings_metrocuadrado ADD COLUMN IF NOT EXISTS moneda            TEXT;
ALTER TABLE raw.listings_metrocuadrado ADD COLUMN IF NOT EXISTS precio_incluye_admin BOOLEAN;
ALTER TABLE raw.listings_metrocuadrado ADD COLUMN IF NOT EXISTS area_tipo         TEXT;
ALTER TABLE raw.listings_metrocuadrado ADD COLUMN IF NOT EXISTS contacto_phone    TEXT;
ALTER TABLE raw.listings_metrocuadrado ADD COLUMN IF NOT EXISTS contacto_whatsapp TEXT;
ALTER TABLE raw.listings_metrocuadrado ADD COLUMN IF NOT EXISTS company_id        TEXT;
ALTER TABLE raw.listings_metrocuadrado ADD COLUMN IF NOT EXISTS company_name      TEXT;
ALTER TABLE raw.listings_metrocuadrado ADD COLUMN IF NOT EXISTS oferente_bucket   TEXT;
ALTER TABLE raw.listings_metrocuadrado ADD COLUMN IF NOT EXISTS num_contactos     INTEGER;
ALTER TABLE raw.listings_metrocuadrado ADD COLUMN IF NOT EXISTS realtor_key       TEXT;
CREATE INDEX IF NOT EXISTS idx_mq_company   ON raw.listings_metrocuadrado(company_id);
CREATE INDEX IF NOT EXISTS idx_mq_realtor   ON raw.listings_metrocuadrado(realtor_key);
CREATE INDEX IF NOT EXISTS idx_mq_tipo_op  ON raw.listings_metrocuadrado(tipo_operacion);
CREATE INDEX IF NOT EXISTS idx_mq_tipo_inm ON raw.listings_metrocuadrado(tipo_inmueble);
CREATE INDEX IF NOT EXISTS idx_mq_barrio   ON raw.listings_metrocuadrado(barrio_id);
CREATE INDEX IF NOT EXISTS idx_mq_precio   ON raw.listings_metrocuadrado(precio);
CREATE INDEX IF NOT EXISTS idx_mq_scraping ON raw.listings_metrocuadrado(fecha_scraping);
CREATE INDEX IF NOT EXISTS idx_mq_geo      ON raw.listings_metrocuadrado(lat, lon);
CREATE UNIQUE INDEX IF NOT EXISTS listings_mq_url_op_unique ON raw.listings_metrocuadrado(url, tipo_operacion);
"""

UPSERT_SQL = """
INSERT INTO raw.listings_metrocuadrado
    (fuente, tipo_operacion, tipo_inmueble, precio, area_m2,
     habitaciones, banos, direccion_raw, barrio_raw, municipio_raw, url,
     lat, lon, estrato, parqueaderos, piso, antiguedad, administracion,
     amenidades, fecha_scraping, activo, raw_data,
     fecha_publicacion, dias_en_mercado, dedup_hash, fotos,
     barrio_id, last_seen_at, destacado, anunciante_tipo, moneda,
     precio_incluye_admin, area_tipo,
     contacto_phone, contacto_whatsapp, company_id, company_name,
     oferente_bucket, num_contactos, realtor_key)
VALUES
    (%(fuente)s, %(tipo_operacion)s, %(tipo_inmueble)s, %(precio)s,
     %(area_m2)s, %(habitaciones)s, %(banos)s, %(direccion_raw)s,
     %(barrio_raw)s, %(municipio_raw)s, %(url)s, %(lat)s, %(lon)s, %(estrato)s,
     %(parqueaderos)s, %(piso)s, %(antiguedad)s, %(administracion)s,
     %(amenidades)s, %(fecha_scraping)s, %(activo)s, %(raw_data)s,
     %(fecha_publicacion)s, %(dias_en_mercado)s, %(dedup_hash)s, %(fotos)s,
     %(barrio_id)s, NOW(), %(destacado)s, %(anunciante_tipo)s, %(moneda)s,
     %(precio_incluye_admin)s, %(area_tipo)s,
     %(contacto_phone)s, %(contacto_whatsapp)s, %(company_id)s, %(company_name)s,
     %(oferente_bucket)s, %(num_contactos)s, %(realtor_key)s)
-- Identidad = (url, tipo_operacion), estable y sin precio. Una url de MC
-- (murldetalle keyea por midinmueble) hostea venta Y arriendo del mismo
-- inmueble, así que url sola fusionaría ambas operaciones -> (url,op). dedup_hash
-- incluye precio y queda SOLO para el dedup cross-fuente en serving (cache.py/
-- dbt), NO como clave de upsert: con precio en la clave, un cambio de precio
-- insertaba fila nueva en vez de UPDATE -> el trigger de historial nunca
-- disparaba. Mismo espíritu que fincaraiz/vrbo/renta_media (key por url).
ON CONFLICT (url, tipo_operacion) DO UPDATE SET
    precio            = EXCLUDED.precio,
    area_m2           = EXCLUDED.area_m2,
    habitaciones      = EXCLUDED.habitaciones,
    banos             = EXCLUDED.banos,
    direccion_raw     = EXCLUDED.direccion_raw,
    barrio_raw        = EXCLUDED.barrio_raw,
    municipio_raw     = COALESCE(EXCLUDED.municipio_raw, raw.listings_metrocuadrado.municipio_raw),
    lat               = COALESCE(EXCLUDED.lat, raw.listings_metrocuadrado.lat),
    lon               = COALESCE(EXCLUDED.lon, raw.listings_metrocuadrado.lon),
    estrato           = EXCLUDED.estrato,
    parqueaderos      = COALESCE(EXCLUDED.parqueaderos, raw.listings_metrocuadrado.parqueaderos),
    piso              = COALESCE(EXCLUDED.piso, raw.listings_metrocuadrado.piso),
    antiguedad        = COALESCE(EXCLUDED.antiguedad, raw.listings_metrocuadrado.antiguedad),
    administracion    = COALESCE(EXCLUDED.administracion, raw.listings_metrocuadrado.administracion),
    amenidades        = CASE WHEN array_length(EXCLUDED.amenidades,1) > 0 THEN EXCLUDED.amenidades ELSE raw.listings_metrocuadrado.amenidades END,
    fecha_scraping    = EXCLUDED.fecha_scraping,
    activo            = EXCLUDED.activo,
    raw_data          = EXCLUDED.raw_data,
    fecha_publicacion = EXCLUDED.fecha_publicacion,
    dias_en_mercado   = EXCLUDED.dias_en_mercado,
    fotos             = CASE WHEN array_length(EXCLUDED.fotos,1) > 0 THEN EXCLUDED.fotos ELSE raw.listings_metrocuadrado.fotos END,
    barrio_id         = COALESCE(EXCLUDED.barrio_id, raw.listings_metrocuadrado.barrio_id),
    last_seen_at      = NOW(),
    destacado         = EXCLUDED.destacado,
    anunciante_tipo   = COALESCE(EXCLUDED.anunciante_tipo, raw.listings_metrocuadrado.anunciante_tipo),
    moneda            = EXCLUDED.moneda,
    precio_incluye_admin = EXCLUDED.precio_incluye_admin,
    area_tipo         = EXCLUDED.area_tipo,
    contacto_phone    = COALESCE(EXCLUDED.contacto_phone, raw.listings_metrocuadrado.contacto_phone),
    contacto_whatsapp = COALESCE(EXCLUDED.contacto_whatsapp, raw.listings_metrocuadrado.contacto_whatsapp),
    company_id        = COALESCE(EXCLUDED.company_id, raw.listings_metrocuadrado.company_id),
    company_name      = COALESCE(EXCLUDED.company_name, raw.listings_metrocuadrado.company_name),
    oferente_bucket   = COALESCE(EXCLUDED.oferente_bucket, raw.listings_metrocuadrado.oferente_bucket),
    num_contactos     = COALESCE(EXCLUDED.num_contactos, raw.listings_metrocuadrado.num_contactos),
    realtor_key       = COALESCE(EXCLUDED.realtor_key, raw.listings_metrocuadrado.realtor_key);
"""

MQ_CDN = "https://multimedia.metrocuadrado.com"


def _build_fotos(item: dict) -> list[str]:
    """Build full CDN photo URLs from mgaleriainmueble IDs."""
    import re as _re
    gallery = item.get("mgaleriainmueble") or []
    fotos: list[str] = []
    for gid in gallery[:12]:
        if not isinstance(gid, str):
            continue
        prefix = _re.sub(r"_\d+$", "", gid)
        fotos.append(f"{MQ_CDN}/{prefix}/{gid}_p.jpg")
    # Fallback: imageLink as first photo if no gallery
    if not fotos and item.get("imageLink"):
        fotos.append(item["imageLink"])
    return fotos

# ---------------------------------------------------------------------------
# Parsers
# ---------------------------------------------------------------------------

def _parse_fecha_publicacion(item: dict) -> str | None:
    """Extract publish date from Metrocuadrado API JSON response."""
    for field in ("publishedAt", "createdAt", "updatedAt",
                  "fechaPublicacion", "fecha_publicacion", "mfechapublicacion"):
        val = item.get(field)
        if val:
            try:
                return str(val)[:10]  # YYYY-MM-DD portion of ISO string
            except Exception:
                pass
    return None


def _parse_int(val) -> int | None:
    if val is None:
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        m = re.search(r"(\d+)", str(val))
        return int(m.group(1)) if m else None


def _parse_float(val) -> float | None:
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def normalize_tipo_inmueble(tipo_inmueble: str) -> tuple[str, bool]:
    """apartaestudio is stored as 'apartamento' (a studio is an apartment with 0
    rooms) so filters/labels show a single type. Returns (tipo, was_studio)."""
    if (tipo_inmueble or "").strip().lower() == "apartaestudio":
        return "apartamento", True
    return tipo_inmueble, False


def _parse_listing(item: dict, tipo_inmueble: str, tipo_operacion: str,
                   municipio_raw: str | None = None) -> dict | None:
    """Convert raw API listing to normalized record."""
    tipo_inmueble, es_estudio = normalize_tipo_inmueble(tipo_inmueble)
    link = item.get("link") or item.get("data", {}).get("murldetalle", "")
    if not link:
        return None
    url = API_URL + link if not link.startswith("http") else link

    # Currency: the REST search returns COP; honour an explicit non-COP marker if
    # the portal ever sends one instead of silently treating it as pesos.
    moneda = str(item.get("mmoneda") or item.get("currency") or "COP").upper()
    if moneda in ("$", "PESOS", "COP$"):
        moneda = "COP"

    # Price: use mvalorventa for venta, mvalorarriendo for arriendo
    precio = None
    if tipo_operacion == "venta":
        precio = _parse_float(item.get("mvalorventa"))
    else:
        precio = _parse_float(item.get("mvalorarriendo"))

    # Area: prefer private area, fall back to total — and record which one, since
    # mixing both skews price/m2 (private is typically 10-20 % smaller).
    area_priv = _parse_float(item.get("areaprivada") or item.get("areaPrivada"))
    area = area_priv or _parse_float(item.get("marea"))
    area_tipo = "privada" if area_priv else ("total" if area else None)

    # Rooms/baths
    habitaciones = _parse_int(item.get("mnrocuartos"))
    if es_estudio:
        habitaciones = 0
    banos = _parse_int(item.get("mnrobanos"))

    # Location
    barrio = (item.get("mbarrio") or item.get("mnombrecomunbarrio") or "").strip() or None
    if barrio:
        barrio = barrio.title()

    # Geolocation (direct from API)
    geo = item.get("localizacion") or {}
    lat = _parse_float(geo.get("lat"))
    lon = _parse_float(geo.get("lon"))

    # Estrato
    estrato = _parse_int(item.get("estrato"))

    # Title as direccion proxy (no raw address available)
    title = item.get("title") or ""

    # Parse amenidades from `featured` list: ["conPiscina:S", "nroCuartos:3", ...]
    # Keep only boolean flags (value == "S") and map to human names
    _AMENIDAD_MAP = {
        "conPiscina": "Piscina", "conGimnasio": "Gimnasio", "conSauna": "Sauna",
        "conJacuzzi": "Jacuzzi", "conBBQ": "BBQ", "conAsador": "Asador",
        "conSalonComunal": "Salón Comunal", "conZonaNinos": "Zona Niños",
        "conZonasVerdes": "Zonas Verdes", "conVigilancia": "Vigilancia",
        "enConjuntoCerrado": "Conjunto Cerrado", "conPorteria": "Portería",
        "porteria": "Portería", "conElevador": "Elevador",
        "conParqueaderoVisitantes": "Parqueadero Visitantes",
        "conCanchaFutbol": "Cancha Fútbol", "conCanchaMultiple": "Cancha Múltiple",
        "conVistaPanoramica": "Vista Panorámica", "conZonaLavanderia": "Lavandería",
        "conCocinaIntegral": "Cocina Integral", "sobreViaPrincipal": "Vía Principal",
        "cercaTransportePublico": "Cerca Transporte",
    }
    # Parse featured array: ["key:value", ...] → dict
    featured_kv: dict[str, str] = {}
    amenidades = []
    for feat in (item.get("featured") or []):
        if not isinstance(feat, str):
            continue
        key, _, val = feat.strip().partition(":")
        key = key.strip().lstrip()
        val = val.strip()
        if key:
            featured_kv[key] = val
        # Map boolean flags to human amenity names
        for map_key, label in _AMENIDAD_MAP.items():
            if key.startswith(map_key) and val == "S":
                amenidades.append(label)
                break

    # Extra fields from featured array (not available as direct API fields)
    antiguedad   = featured_kv.get("tiempoConstruido") or None
    parqueaderos = _parse_int(featured_kv.get("nroGarajes"))
    piso         = _parse_int(featured_kv.get("nroPiso"))
    # Administration cost: try API field first, then featured
    admin_raw = item.get("commonExpenses")
    if isinstance(admin_raw, dict):
        admin_val = _parse_float(admin_raw.get("amount"))
    else:
        admin_str = featured_kv.get("valorAdministracion")
        admin_val = _parse_float(admin_str) if admin_str else None
    administracion = admin_val if admin_val and admin_val > 0 else None

    fecha_pub_str = _parse_fecha_publicacion(item)
    fecha_pub = date.fromisoformat(fecha_pub_str) if fecha_pub_str else None
    dias_mercado = (date.today() - fecha_pub).days if fecha_pub else None

    fotos = _build_fotos(item)

    # Paid placement: the search API marks promoted cards with a badge.
    badge = item.get("badge")
    destacado = bool(badge) if badge is not None else None
    # OwnerType ('Inmobiliaria'/'Persona natural') es el tipo real del anunciante;
    # mtipousuario/userType ya no vienen en el payload SPA.
    anunciante_tipo = (item.get("OwnerType") or item.get("mtipousuario")
                       or item.get("userType") or None)

    # --- Atribución del inmueble a su realtor/agencia (del payload de resultados) ---
    contacto_phone    = str(item.get("contactPhone") or "").strip() or None
    contacto_whatsapp = str(item.get("whatsapp") or "").strip() or None
    # midempresa = id estable de la inmobiliaria; vacío cuando es persona natural.
    company_id    = str(item.get("midempresa") or "").strip() or None
    # tipo de oferente (Inmobiliaria/Persona natural) ya va en anunciante_tipo (OwnerType)
    oferente_bucket = str(item.get("moferente") or "").strip() or None  # RealEstate/Seller/Builder
    num_contactos = _parse_int(item.get("mnumero_contactos"))
    # Llave de atribución: company_id si es agencia; si no, teléfono normalizado del
    # particular. Prefijo para no colisionar un id con un número de teléfono.
    _ph = _norm_phone(contacto_phone or contacto_whatsapp)
    realtor_key = f"co:{company_id}" if company_id else (f"ph:{_ph}" if _ph else None)

    raw_data = {
        "midinmueble":      item.get("midinmueble"),
        "title":            title,
        "mtiponegocio":     item.get("mtiponegocio"),
        "mtipoinmueble":    item.get("mtipoinmueble"),
        "mvalorventa":      item.get("mvalorventa"),
        "mvalorarriendo":   item.get("mvalorarriendo"),
        "marea":            item.get("marea"),
        "areaprivada":      item.get("areaprivada") or item.get("areaPrivada"),
        "mnrocuartos":      item.get("mnrocuartos"),
        "mnrobanos":        item.get("mnrobanos"),
        "mnrogarajes":      item.get("mnrogarajes"),
        "mbarrio":          item.get("mbarrio"),
        "mciudad":          item.get("mciudad"),
        "estrato":          item.get("estrato"),
        "mestadoinmueble":  item.get("mestadoinmueble"),
        "mnombreproyecto":  item.get("mnombreproyecto"),
        "localizacion":     geo,
        "featured":         item.get("featured"),
        "badge":            item.get("badge"),
        "publishedAt":      item.get("publishedAt"),
        "createdAt":        item.get("createdAt"),
        "tiempoConstruido": antiguedad,
        "nroGarajes":       parqueaderos,
        "nroPiso":          piso,
        "valorAdministracion": administracion,
    }

    # municipio_raw: prefer explicit arg, fall back to mciudad from API
    mun_raw = municipio_raw or (item.get("mciudad") or "").strip().title() or None

    return {
        "fuente":             "metrocuadrado",
        "tipo_operacion":     tipo_operacion,
        "tipo_inmueble":      tipo_inmueble,
        "precio":             precio,
        "area_m2":            area,
        "habitaciones":       habitaciones,
        "banos":              banos,
        "direccion_raw":      title if title else barrio,
        "barrio_raw":         barrio,
        "municipio_raw":      mun_raw,
        "url":                url,
        "lat":                lat,
        "lon":                lon,
        "estrato":            estrato,
        "parqueaderos":       parqueaderos,
        "piso":               piso,
        "antiguedad":         antiguedad,
        "administracion":     administracion,
        "amenidades":         amenidades if amenidades else None,
        "fecha_scraping":     datetime.now(timezone.utc).isoformat(),
        "activo":             True,
        "raw_data":           json.dumps(raw_data, ensure_ascii=False, default=str),
        "fecha_publicacion":  fecha_pub_str,
        "dias_en_mercado":    dias_mercado,
        "fotos":              fotos if fotos else None,
        "barrio_id":          None,  # resolved against raw.barrios at save time
        "destacado":          destacado,
        "anunciante_tipo":    anunciante_tipo,
        "moneda":             moneda,
        "precio_incluye_admin": None,  # MC lists admin separately (commonExpenses)
        "area_tipo":          area_tipo,
        "contacto_phone":     contacto_phone,
        "contacto_whatsapp":  contacto_whatsapp,
        "company_id":         company_id,
        "company_name":       None,  # resuelto por ficha en _resolve_company_names
        "oferente_bucket":    oferente_bucket,
        "num_contactos":      num_contactos,
        "realtor_key":        realtor_key,
        "dedup_hash":         calcular_dedup_hash(
            barrio_raw=barrio,
            tipo_inmueble=tipo_inmueble,
            tipo_operacion=tipo_operacion,
            habitaciones=habitaciones,
            banos=banos,
            area_m2=area,
            precio=precio,
        ),
    }


# ---------------------------------------------------------------------------
# Scraper
# ---------------------------------------------------------------------------

class MetrocuadradoScraper:
    def __init__(
        self,
        max_pages: int = 10,
        delay_min: float = 2.0,
        delay_max: float = 5.0,
        tipos: list[str] | None = None,
        municipios: list[str] | None = None,
        since_date: date | None = None,
    ):
        self.max_pages = max_pages
        self.delay_min = delay_min
        self.delay_max = delay_max
        self.tipos = tipos
        self.municipios = municipios or ["medellin"]
        self.since_date = since_date
        self.stats = RunStats("metrocuadrado")
        self.coverage: list[tuple[str, int | None, int, int]] = []  # (config_key, total_hits, seen, pages_failed)
        self._company_names: dict[str, str | None] = {}  # company_id -> nombre (cache por run; None = ya intentado sin éxito)
        self._session = requests.Session()
        # SPA Next.js: los listings vienen server-rendered en el HTML (RSC), sin API key.
        self._session.headers.update(_BASE_HEADERS)

    def _get_page(self, tipo_inmueble: str, tipo_operacion: str,
                  from_offset: int, city: str) -> dict | None:
        # SPA Next.js: la paginación es client-side; sólo la página 1 viene
        # server-rendered (ver nota de cabecera). Pedir offset>0 no trae más.
        if from_offset > 0:
            return {"totalHits": 0, "results": []}
        slug = _TIPO_URL_SLUG.get(tipo_inmueble, tipo_inmueble)
        url = f"{API_URL}/{slug}/{tipo_operacion}/{city}/"
        resp = http_get(self._session, url, timeout=30, stats=self.stats)
        if resp is None:
            log.error(f"HTTP error [{city}/{tipo_inmueble}/{tipo_operacion}] (after retries)")
            return None
        data = _extract_initial_results(resp.text)
        if data is None:
            log.error(f"initialResults no encontrado en HTML [{url}]")
            return None
        return data

    def _delay(self) -> None:
        delay = random.uniform(self.delay_min, self.delay_max)
        log.debug(f"Waiting {delay:.1f}s")
        time.sleep(delay)

    def _scrape_config(self, config: dict, city: str, municipio_display: str) -> list[dict]:
        tipo_inmueble  = config["tipo_inmueble"]
        tipo_operacion = config["tipo_operacion"]

        all_results: list[dict] = []
        seen_urls: set[str] = set()
        config_key = f"{city}|{tipo_inmueble}|{tipo_operacion}"
        total_hits: int | None = None
        pages_failed = 0
        consecutive_old_pages = 0

        for page_num in range(self.max_pages):
            from_offset = page_num * PAGE_SIZE
            log.info(
                f"  [{city}/{tipo_inmueble}/{tipo_operacion}] "
                f"Página {page_num + 1}/{self.max_pages} (from={from_offset})"
            )

            data = self._get_page(tipo_inmueble, tipo_operacion, from_offset, city)
            if not data:
                # Truncated pass: recorded (not complete) so the stale rule cannot
                # age out listings this run never reached; counted for the exit code.
                pages_failed += 1
                self.stats.truncated_configs.append(config_key)
                break

            total_hits = data.get("totalHits", 0)
            items = data.get("results", [])

            if page_num == 0:
                log.info(f"    Total disponible en API: {total_hits:,}")
                if total_hits > 10000:
                    log.warning(f"    {config_key}: {total_hits:,} > 10.000 (tope de la API) — cobertura incompleta")

            if not items:
                log.info(f"    Sin resultados en página {page_num + 1}, deteniendo")
                break

            new_items = []
            old_count = 0
            for item in items:
                self.stats.items_seen += 1
                try:
                    parsed = _parse_listing(item, tipo_inmueble, tipo_operacion,
                                            municipio_raw=municipio_display)
                except Exception as e:  # schema drift must be counted, not swallowed
                    log.debug(f"parse error: {e}")
                    parsed = None
                if not parsed:
                    self.stats.parse_failed += 1
                    continue
                if parsed["url"] in seen_urls:
                    continue
                if implausible_reason(parsed["precio"], parsed["area_m2"],
                                      parsed["tipo_inmueble"], tipo_operacion):
                    self.stats.implausible += 1
                # Incremental filter: skip if older than since_date
                if self.since_date and parsed.get("fecha_publicacion"):
                    try:
                        pub = date.fromisoformat(parsed["fecha_publicacion"])
                        if pub < self.since_date:
                            old_count += 1
                            continue
                    except (ValueError, TypeError):
                        pass
                seen_urls.add(parsed["url"])
                new_items.append(parsed)

            if not new_items and not old_count:
                log.info(f"    Sin items nuevos, deteniendo")
                break

            # Stop early only after 3 consecutive all-old pages: the search API's
            # sort order is not guaranteed to be by publish date, so a single old
            # page (e.g. a bumped/featured block) must not end the pass.
            if self.since_date and old_count > 0 and len(new_items) == 0:
                consecutive_old_pages += 1
                if consecutive_old_pages >= 3:
                    log.info(f"    3 páginas seguidas más antiguas que {self.since_date} — deteniendo")
                    break
            else:
                consecutive_old_pages = 0

            all_results.extend(new_items)
            log.info(f"    +{len(new_items)} listings, {old_count} old (total {len(all_results)})")

            # SPA: sólo la página 1 es extraíble (paginación client-side). Cortamos
            # aquí; la cobertura <95% marca la pasada INCOMPLETA y la regla de stale
            # (deactivate_stale_listings) no da de baja lo que no alcanzamos.
            break

        self._resolve_company_names(all_results)
        self.coverage.append((config_key, total_hits, len(seen_urls), pages_failed))
        if total_hits and len(seen_urls) < 0.95 * min(total_hits, 10000) and not self.since_date:
            log.warning(f"    {config_key}: cobertura {len(seen_urls)}/{total_hits} — subir --max-pages")
        return all_results

    def _seed_company_names(self) -> None:
        """Siembra el cache con los company_id→company_name YA en DB (una vez por run).
        Así sólo se pega a la ficha por agencias NUEVAS, no por todas cada noche
        (menos carga y menos huella de scraping). Los nombres de agencia casi no
        cambian; si alguno cambia, se recapta cuando esa agencia salga como nueva."""
        if getattr(self, "_names_seeded", False):
            return
        self._names_seeded = True
        try:
            with get_connection() as conn:
                cur = conn.cursor()
                cur.execute(
                    "SELECT DISTINCT company_id, company_name FROM raw.listings_metrocuadrado "
                    "WHERE company_id IS NOT NULL AND company_name IS NOT NULL"
                )
                for cid, name in cur.fetchall():
                    self._company_names.setdefault(cid, name)
            log.info(f"[metrocuadrado] {len(self._company_names)} agencias sembradas desde DB")
        except Exception as exc:  # DB opcional: si falla, se resuelve todo por ficha
            log.warning(f"[metrocuadrado] no pude sembrar nombres de agencia: {exc}")

    def _resolve_company_names(self, listings: list[dict]) -> None:
        """Rellena company_name por cada listing. El nombre de la agencia sólo vive
        en la ficha del inmueble, no en los resultados → 1 fetch por company_id
        ÚNICO (acotado por nº de agencias, no de listings). Cache por run, sembrado
        desde DB → sólo agencias nuevas pegan a la ficha; se cachea None en fallo
        para no reintentar. Los particulares (sin company_id) no tienen nombre de
        agencia → se saltan. El teléfono/company_id ya quedaron guardados aunque
        este fetch falle."""
        self._seed_company_names()
        for l in listings:
            cid = l.get("company_id")
            if not cid:
                continue
            if cid not in self._company_names:
                name = None
                url = l.get("url")
                if url:
                    resp = http_get(self._session, url, timeout=30, stats=self.stats)
                    if resp is not None:
                        name = _company_name_from_html(resp.text)
                    self._delay()
                self._company_names[cid] = name
                log.info(f"    agencia {cid} → {name!r}")
            l["company_name"] = self._company_names.get(cid)

    def run(self, save_func=None) -> list[dict]:
        base = BASE_CONFIGS
        if self.tipos:
            base = [c for c in BASE_CONFIGS if c["tipo_operacion"] in self.tipos]

        all_results: list[dict] = []
        for mun_slug in self.municipios:
            mun_display = MUNICIPIOS_VALLE.get(mun_slug, mun_slug.title())
            for config in base:
                log.info(
                    f"=== {mun_display.upper()} | "
                    f"{config['tipo_inmueble'].upper()} | {config['tipo_operacion'].upper()} ==="
                )
                results = self._scrape_config(config, city=mun_slug,
                                              municipio_display=mun_display)
                log.info(f"  Subtotal: {len(results)}")
                if save_func and results:
                    saved = save_func(results)
                    log.info(f"  → Guardados {saved} en DB")
                all_results.extend(results)
                time.sleep(random.uniform(3, 7))

        log.info(f"Total extraídos: {len(all_results)}")
        return all_results


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

def ensure_table() -> None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(CREATE_TABLE_SQL)


def save_listings(listings: list[dict]) -> int:
    if not listings:
        return 0
    with get_connection() as conn:
        with conn.cursor() as cur:
            # barrio_id at insert (polygon, else nearest within 300 m) — the MC
            # upsert never set it before, leaving those rows to query-time joins.
            for l in listings:
                try:
                    l["barrio_id"] = resolve_barrio(cur, l.get("lat"), l.get("lon"))
                except Exception:
                    conn.rollback()
                    l["barrio_id"] = None
            psycopg2.extras.execute_batch(cur, UPSERT_SQL, listings, page_size=50)
    return len(listings)


def save_coverage(scraper: "MetrocuadradoScraper") -> None:
    modo = "incremental" if scraper.since_date else "full"
    with get_connection() as conn:
        with conn.cursor() as cur:
            for config_key, total, seen, failed in scraper.coverage:
                record_run(cur, "metrocuadrado", config_key, modo, total, seen, failed)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Scraper Metrocuadrado — Valle de Aburrá")
    parser.add_argument("--dry-run", action="store_true", help="No escribe a DB")
    parser.add_argument("--max-pages", type=int, default=10, help="Máx páginas por tipo (default 10 = 500 listings)")
    parser.add_argument("--since-days", type=int, default=None, help="Incremental: solo listings publicados en los últimos N días")
    parser.add_argument("--full-on-weekday", type=int, default=None,
                        help="Con --since-days: ese día de la semana (0=lun..6=dom) hace pasada completa")
    parser.add_argument(
        "--tipos",
        nargs="+",
        choices=["venta", "arriendo"],
        help="Tipos de operación a scrapear",
    )
    parser.add_argument(
        "--municipios",
        nargs="+",
        metavar="MUNICIPIO",
        help=(
            "Municipios a scrapear. Usar 'all_valle' para los 10 del Valle de Aburrá. "
            f"Opciones: all_valle, {', '.join(MUNICIPIOS_VALLE.keys())}"
        ),
    )
    args = parser.parse_args()

    # Resolve municipios
    municipios: list[str] | None = None
    if args.municipios:
        if "all_valle" in args.municipios:
            municipios = list(MUNICIPIOS_VALLE.keys())
        else:
            unknown = [m for m in args.municipios if m not in MUNICIPIOS_VALLE]
            if unknown:
                parser.error(f"Municipios desconocidos: {unknown}. Opciones: {list(MUNICIPIOS_VALLE.keys())}")
            municipios = args.municipios

    if args.since_days is not None and args.full_on_weekday is not None \
            and date.today().weekday() == args.full_on_weekday:
        log.info("Pasada completa hoy (--full-on-weekday)")
        args.since_days = None

    since_date: date | None = None
    if args.since_days is not None:
        since_date = date.today() - timedelta(days=args.since_days)
        log.info(f"Incremental mode: solo listings desde {since_date}")

    scraper = MetrocuadradoScraper(
        max_pages=args.max_pages,
        tipos=args.tipos,
        municipios=municipios,
        since_date=since_date,
    )

    if args.dry_run:
        listings = scraper.run()
    else:
        ensure_table()
        listings = scraper.run(save_func=save_listings)
        try:
            save_coverage(scraper)
        except Exception:
            log.exception("No se pudo registrar raw.scrape_runs (¿migración 0112 aplicada?)")

    log.info(scraper.stats.summary())
    if not listings:
        log.warning("Sin listings extraídos. Verificar API key o conexión.")
        sys.exit(1)

    if args.dry_run:
        log.info(f"[dry-run] {len(listings)} listings. Ejemplo:")
        example = {k: v for k, v in listings[0].items() if k != "raw_data"}
        log.info(json.dumps(example, ensure_ascii=False, indent=2, default=str))
    else:
        log.info(f"Total guardados en raw.listings_metrocuadrado: {len(listings)}")

    tipos_count  = Counter((l["tipo_inmueble"], l["tipo_operacion"]) for l in listings)
    mun_count    = Counter(l.get("municipio_raw", "?") for l in listings)
    prices_by_type: dict[str, list[float]] = {}
    geo_count = sum(1 for l in listings if l.get("lat") and l.get("lon"))

    for l in listings:
        k = f"{l['tipo_inmueble']}/{l['tipo_operacion']}"
        if l["precio"]:
            prices_by_type.setdefault(k, []).append(float(l["precio"]))

    print("\n=== RESUMEN ===")
    for (inm, op), count in sorted(tipos_count.items()):
        k = f"{inm}/{op}"
        prices = prices_by_type.get(k, [])
        avg = sum(prices) / len(prices) if prices else 0
        avg_str = f"${avg:,.0f} COP" if avg else "N/A"
        print(f"  {inm:12} {op:8} | {count:4} listings | precio promedio: {avg_str}")
    print(f"  Total: {len(listings)}")
    print(f"  Con coordenadas: {geo_count}/{len(listings)} ({geo_count/len(listings)*100:.1f}%)")
    print("\n  Por municipio:")
    for mun, cnt in sorted(mun_count.items(), key=lambda x: -x[1]):
        print(f"    {mun:18} {cnt:5}")

    # Non-zero when the run was silently truncated / the portal schema drifted.
    sys.exit(scraper.stats.exit_code())


if __name__ == "__main__":
    main()
