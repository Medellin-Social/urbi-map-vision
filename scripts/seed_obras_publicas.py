"""
Seed MANUAL de obras públicas de movilidad planificadas/en construcción en el
Valle de Aburrá — carga raw.obras_publicas_planeadas.

No existe un dataset abierto y estructurado para esto (verificado 2026-08:
sin API en metromedellin.gov.co ni datos.gov.co). Esta lista se curó a mano
desde fuentes de prensa (El Colombiano, Infobae, El Tiempo) y el sitio del
Metro de Medellín, agosto 2026. Coordenadas aproximadas (centroide de la
estación/corredor conocido, no trazado exacto). Actualizar a mano cuando
haya noticias nuevas — NO es un scraper.

Uso:
  python scripts/seed_obras_publicas.py
  python scripts/seed_obras_publicas.py --dry-run
"""

import argparse
import os
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://social:urbidata007@localhost:5433/social",
)

# (nombre, tipo, descripcion, municipio, fecha_estimada, fuente, lat, lon)
OBRAS = [
    (
        "Metrocable San Antonio de Prado – La Estrella/Itagüí (Línea 7)",
        "metrocable",
        "Séptima línea de metrocable, en fase de factibilidad 2026; contratación estimada Q3 2027.",
        "MEDELLIN", "2027-2029",
        "https://www.eltiempo.com/amp/colombia/medellin/el-2026-sera-un-ano-importante-para-avanzar-en-el-septimo-metrocable-de-medellin-estara-en-el-sur-y-se-complementara-con-una-linea-de-buses-metroplus-3515982",
        6.1520, -75.6250,
    ),
    (
        "Modernización flota Metro (13 trenes nuevos)",
        "metro",
        "13 trenes nuevos de México + 39 vagones modernizados, mayor frecuencia en hora pico.",
        "MEDELLIN", "2027",
        "https://www.cronista.com/colombia/actualidad-co/ya-es-oficial-el-metro-de-medellin-recibira-13-nuevos-trenes-de-mexico-y-habra-mas-frecuencias-en-horas-pico-a-partir-del-proximo-ano-suman-39-vagones-modernizados/",
        6.2442, -75.5812,
    ),
    (
        "Metro Línea 2 (extensión)",
        "metro",
        "Una de las seis grandes obras priorizadas para ampliar el metro en los próximos 30 años.",
        "MEDELLIN", "sin fecha confirmada",
        "https://www.elcolombiano.com/medellin/obras-para-el-futuro-del-metro-de-medellin-antioquia-30-anos-ED26617030",
        6.2518, -75.5636,
    ),
    (
        "Extensión Tranvía de Ayacucho",
        "tranvia",
        "Extensión priorizada dentro de los planes a 30 años del Metro de Medellín.",
        "MEDELLIN", "sin fecha confirmada",
        "https://www.elcolombiano.com/medellin/obras-para-el-futuro-del-metro-de-medellin-antioquia-30-anos-ED26617030",
        6.2489, -75.5580,
    ),
]

DDL = """
CREATE TABLE IF NOT EXISTS raw.obras_publicas_planeadas (
    id              serial PRIMARY KEY,
    nombre          text NOT NULL,
    tipo            text NOT NULL,
    descripcion     text,
    municipio       text,
    fecha_estimada  text,
    fuente          text,
    geometry        geometry(Point, 4326),
    cargado_en      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (nombre)
);
CREATE INDEX IF NOT EXISTS idx_obras_publicas_geom
    ON raw.obras_publicas_planeadas USING GIST(geometry);
"""

UPSERT_SQL = """
INSERT INTO raw.obras_publicas_planeadas
    (nombre, tipo, descripcion, municipio, fecha_estimada, fuente, geometry)
VALUES (
    %(nombre)s, %(tipo)s, %(descripcion)s, %(municipio)s, %(fecha_estimada)s, %(fuente)s,
    ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326)
)
ON CONFLICT (nombre) DO UPDATE SET
    tipo           = EXCLUDED.tipo,
    descripcion    = EXCLUDED.descripcion,
    municipio      = EXCLUDED.municipio,
    fecha_estimada = EXCLUDED.fecha_estimada,
    fuente         = EXCLUDED.fuente,
    geometry       = EXCLUDED.geometry
"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    rows = [
        {
            "nombre": nombre, "tipo": tipo, "descripcion": desc,
            "municipio": mun, "fecha_estimada": fecha, "fuente": fuente,
            "lat": lat, "lon": lon,
        }
        for nombre, tipo, desc, mun, fecha, fuente, lat, lon in OBRAS
    ]

    print(f"{len(rows)} obras públicas curadas manualmente:")
    for r in rows:
        print(f"  [{r['tipo']}] {r['nombre']} ({r['fecha_estimada']})")

    if args.dry_run:
        print("[dry-run] Sin escritura a DB.")
        return

    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    cur.execute(DDL)
    conn.commit()
    psycopg2.extras.execute_batch(cur, UPSERT_SQL, rows)
    conn.commit()
    print(f"Upsert completado: {len(rows)} obras.")
    conn.close()


if __name__ == "__main__":
    main()
