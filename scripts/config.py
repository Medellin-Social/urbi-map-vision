"""
Valle de Aburrá — municipalities config for scraping.

Each entry:
  slug       : URL slug used by fincaraiz.com.co
  nombre     : display name
  dane_code  : DANE municipal code (for reference)
  barrios    : known barrios with approximate centroid (lat, lng)
               Used as fallback when scraper finds no coords.
"""

MUNICIPIOS = [
    {
        "slug": "medellin",
        "nombre": "Medellín",
        "dane_code": "05001",
        "barrios": [
            {"nombre": "EL POBLADO",        "lat": 6.2087,  "lng": -75.5659},
            {"nombre": "LAURELES",           "lat": 6.2442,  "lng": -75.5974},
            {"nombre": "BELÉN",              "lat": 6.2271,  "lng": -75.6189},
            {"nombre": "ROBLEDO",            "lat": 6.2731,  "lng": -75.6089},
            {"nombre": "ARANJUEZ",           "lat": 6.2891,  "lng": -75.5612},
            {"nombre": "ESTADIO",            "lat": 6.2567,  "lng": -75.5891},
            {"nombre": "EL RODEO",           "lat": 6.2812,  "lng": -75.6201},
            {"nombre": "LA AMERICA",         "lat": 6.2489,  "lng": -75.5863},
            {"nombre": "CASTILLA",           "lat": 6.2985,  "lng": -75.5789},
            {"nombre": "MANRIQUE",           "lat": 6.2734,  "lng": -75.5412},
            {"nombre": "SAN JAVIER",         "lat": 6.2634,  "lng": -75.6089},
            {"nombre": "BUENOS AIRES",       "lat": 6.2334,  "lng": -75.5489},
            {"nombre": "EL CENTRO",          "lat": 6.2442,  "lng": -75.5812},
            {"nombre": "GUAYABAL",           "lat": 6.2134,  "lng": -75.5989},
            {"nombre": "VILLA HERMOSA",      "lat": 6.2534,  "lng": -75.5389},
            {"nombre": "DOCE DE OCTUBRE",    "lat": 6.3012,  "lng": -75.5789},
            {"nombre": "SANTA CRUZ",         "lat": 6.2823,  "lng": -75.5412},
            {"nombre": "POPULAR",            "lat": 6.2923,  "lng": -75.5312},
            {"nombre": "SAN ANTONIO DE PRADO","lat": 6.1889, "lng": -75.6389},
            {"nombre": "EL VOLADOR",         "lat": 6.2789,  "lng": -75.6012},
            {"nombre": "BELLO HORIZONTE",    "lat": 6.2923,  "lng": -75.5589},
            {"nombre": "PRADO",              "lat": 6.2612,  "lng": -75.5712},
            {"nombre": "EL CHAGUALO",        "lat": 6.2512,  "lng": -75.5789},
            {"nombre": "BOSTON",             "lat": 6.2389,  "lng": -75.5589},
            {"nombre": "LAS AMERICAS",       "lat": 6.2523,  "lng": -75.5912},
        ],
    },
    {
        "slug": "bello",
        "nombre": "Bello",
        "dane_code": "05088",
        "barrios": [
            {"nombre": "CENTRO DE BELLO",   "lat": 6.3389,  "lng": -75.5534},
            {"nombre": "NIQUÍA",            "lat": 6.3489,  "lng": -75.5489},
            {"nombre": "LA MADERA",         "lat": 6.3289,  "lng": -75.5489},
            {"nombre": "ACEVEDO",           "lat": 6.3223,  "lng": -75.5512},
            {"nombre": "FONTIDUEÑO",        "lat": 6.3312,  "lng": -75.5612},
            {"nombre": "LAS PLAYAS",        "lat": 6.3189,  "lng": -75.5434},
            {"nombre": "ZAMORA",            "lat": 6.3589,  "lng": -75.5389},
            {"nombre": "ANDALUCÍA",         "lat": 6.3423,  "lng": -75.5412},
            {"nombre": "SUÁREZ",            "lat": 6.3512,  "lng": -75.5489},
            {"nombre": "COLINAS",           "lat": 6.3423,  "lng": -75.5589},
            {"nombre": "SANTA ANA",         "lat": 6.3289,  "lng": -75.5589},
            {"nombre": "MIRADOR DEL NORTE", "lat": 6.3623,  "lng": -75.5312},
        ],
    },
    {
        "slug": "itagui",
        "nombre": "Itagüí",
        "dane_code": "05360",
        "barrios": [
            {"nombre": "CENTRO DE ITAGÜÍ",  "lat": 6.1840,  "lng": -75.5989},
            {"nombre": "LOS NARANJOS",      "lat": 6.1889,  "lng": -75.6089},
            {"nombre": "DITAIRES",          "lat": 6.1789,  "lng": -75.6089},
            {"nombre": "SIMÓN BOLÍVAR",     "lat": 6.1912,  "lng": -75.5912},
            {"nombre": "LA CRUZ",           "lat": 6.1812,  "lng": -75.5989},
            {"nombre": "SAN GABRIEL",       "lat": 6.1934,  "lng": -75.6012},
            {"nombre": "EL PROGRESO",       "lat": 6.1789,  "lng": -75.5912},
            {"nombre": "VILLA NUEVA",       "lat": 6.1934,  "lng": -75.5889},
            {"nombre": "CALATRAVA",         "lat": 6.1812,  "lng": -75.6189},
            {"nombre": "SAN FERNANDO",      "lat": 6.1712,  "lng": -75.5989},
            {"nombre": "HELIODORO OCHOA",   "lat": 6.1689,  "lng": -75.5912},
            {"nombre": "LA MANGA",          "lat": 6.1934,  "lng": -75.6089},
        ],
    },
    {
        "slug": "envigado",
        "nombre": "Envigado",
        "dane_code": "05266",
        "barrios": [
            {"nombre": "CENTRO DE ENVIGADO","lat": 6.1734,  "lng": -75.5889},
            {"nombre": "LAS VEGAS",         "lat": 6.1812,  "lng": -75.5789},
            {"nombre": "EL CHINGUÍ",        "lat": 6.1934,  "lng": -75.5689},
            {"nombre": "ALCALÁ",            "lat": 6.1634,  "lng": -75.5789},
            {"nombre": "LA SEBASTIANA",     "lat": 6.1534,  "lng": -75.5889},
            {"nombre": "LOS NARANJOS",      "lat": 6.1889,  "lng": -75.5689},
            {"nombre": "URIBE ÁNGEL",       "lat": 6.1712,  "lng": -75.5689},
            {"nombre": "LA PAZ",            "lat": 6.1812,  "lng": -75.5912},
            {"nombre": "LOMA DEL ESCOBERO", "lat": 6.1589,  "lng": -75.5712},
            {"nombre": "ZÚÑIGA",            "lat": 6.1689,  "lng": -75.5912},
            {"nombre": "EL SALADO",         "lat": 6.1512,  "lng": -75.5812},
            {"nombre": "EL TRIANON",        "lat": 6.1912,  "lng": -75.5789},
        ],
    },
    {
        "slug": "sabaneta",
        "nombre": "Sabaneta",
        "dane_code": "05675",
        "barrios": [
            {"nombre": "CENTRO DE SABANETA","lat": 6.1489,  "lng": -75.6089},
            {"nombre": "SAN JOSÉ",          "lat": 6.1412,  "lng": -75.6012},
            {"nombre": "LAS LOMITAS",       "lat": 6.1534,  "lng": -75.6012},
            {"nombre": "AVES MARÍA",        "lat": 6.1389,  "lng": -75.6089},
            {"nombre": "PAN DE AZÚCAR",     "lat": 6.1612,  "lng": -75.6112},
            {"nombre": "MARIA AUXILIADORA", "lat": 6.1489,  "lng": -75.6189},
            {"nombre": "EL CARMELO",        "lat": 6.1412,  "lng": -75.6189},
            {"nombre": "ANCÓN SUR",         "lat": 6.1534,  "lng": -75.6212},
        ],
    },
    {
        "slug": "la-estrella",
        "nombre": "La Estrella",
        "dane_code": "05400",
        "barrios": [
            {"nombre": "CENTRO DE LA ESTRELLA","lat": 6.1589, "lng": -75.6489},
            {"nombre": "LA TABLAZA",        "lat": 6.1489,  "lng": -75.6489},
            {"nombre": "SAN ISIDRO",        "lat": 6.1689,  "lng": -75.6389},
            {"nombre": "PUEBLO VIEJO",      "lat": 6.1512,  "lng": -75.6312},
            {"nombre": "ANCÓN",             "lat": 6.1634,  "lng": -75.6489},
        ],
    },
]

# Quick lookup: slug → municipio config
MUNICIPIOS_BY_SLUG = {m["slug"]: m for m in MUNICIPIOS}

# Quick lookup: nombre barrio (upper) → (lat, lng) across all municipios
BARRIO_COORDS: dict[str, tuple[float, float]] = {}
for _mun in MUNICIPIOS:
    for _b in _mun["barrios"]:
        BARRIO_COORDS[_b["nombre"].upper()] = (_b["lat"], _b["lng"])

TIPOSNEGOCIOS = ["venta", "arriendo"]

# Fincaraiz URL template
FINCARAIZ_URL = "https://www.fincaraiz.com.co/apartamentos-en-{tipo}/{slug}/"

# Metrocuadrado URL template
METROCUADRADO_URL = "https://www.metrocuadrado.com/apartamentos/{tipo}/?ciudad={nombre_lower}&page={page}"
