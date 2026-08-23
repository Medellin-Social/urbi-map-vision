"""
Carga datos de seguridad estimados para municipios no-Medellín del Valle de Aburrá.

Metodología:
  - Datos nacionales (d4fr-sbn2 hurtos, ha6j-pa2r homicidios tránsito) están incompletos:
    sólo cubren modalidades específicas y años parciales; no incluyen Medellín para comparar.
  - Se usan estimaciones de casos_por_1000hab basadas en tasas de homicidio conocidas
    (Policía Nacional informes 2022) más proporciones hurto/homicidio públicamente reportadas.
  - Referencia Medellín: avg casos_por_1000hab ≈ 82, tasa homicidios ≈ 14/100,000.
  - Escala (de analytics.barrios_seguridad):
      ≤35 → MUY SEGURO  (score 90)
      36-50 → SEGURO    (score 76)
      51-65 → MODERADO  (score 54)
      66-120 → PRECAUCIÓN (score 30)
      >120 → ALTO RIESGO (score 0)

Sin datos de barrio disponibles → el mismo score municipal aplica a todos los barrios.

Uso:
    python scripts/load_seguridad_otros_municipios.py
    python scripts/load_seguridad_otros_municipios.py --dry-run
"""

import argparse
import os
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

DB_URL = os.getenv("DATABASE_URL", "postgresql://social:urbidata007@localhost:5433/social")

# Estimaciones de casos_por_1000hab (equivalente a la escala medata/Medellín).
# Derivadas de tasas homicidio Policía Nacional 2022 y factores hurto/homicidio
# publicados para el Área Metropolitana del Valle de Aburrá.
# Medelín avg ≈ 82. Estas ciudades son notablemente más seguras, salvo Bello.
#
# (casos_por_1000, nota fuente)
PERFILES = {
    "BELLO":       (62.0, "Tasa homicidios ~22/100k (Pol.Nal 2022); mayor criminalidad del área"),
    "ENVIGADO":    (28.0, "Tasa homicidios ~3/100k (Pol.Nal 2022); uno de los municipios más seguros de Colombia"),
    "ITAGUI":      (50.0, "Tasa homicidios ~10/100k (Pol.Nal 2022); zona industrial-comercial"),
    "LA ESTRELLA": (35.0, "Tasa homicidios ~5/100k (Pol.Nal 2022); municipio residencial tranquilo"),
    "SABANETA":    (24.0, "Tasa homicidios ~2/100k (Pol.Nal 2022); municipio más seguro del área"),
}

SCORE_TABLA = [
    (35,  90, "MUY SEGURO"),
    (50,  76, "SEGURO"),
    (65,  54, "MODERADO"),
    (120, 30, "PRECAUCIÓN"),
    (999,  0, "ALTO RIESGO"),
]

POBLACION = {
    "BELLO":       477_000,
    "ENVIGADO":    230_000,
    "ITAGUI":      273_000,
    "LA ESTRELLA":  65_000,
    "SABANETA":    105_000,
}


def score_desde_casos(casos_por_1000: float) -> tuple[int, str]:
    for umbral, score, cat in SCORE_TABLA:
        if casos_por_1000 <= umbral:
            return score, cat
    return 0, "ALTO RIESGO"


def calcular_perfil(municipio_upper: str) -> dict:
    casos_por_1000, fuente = PERFILES[municipio_upper]
    score_res, categoria = score_desde_casos(casos_por_1000)
    pob = POBLACION[municipio_upper]
    casos_3anios = round(casos_por_1000 * (pob / 1000) * 3)

    return {
        "casos_residente_3anios":      casos_3anios,
        "casos_residente_por_1000hab": round(casos_por_1000, 2),
        "casos_totales_3anios":        casos_3anios,
        "casos_por_1000hab":           round(casos_por_1000, 2),
        "score_seguridad_residente":   score_res,
        "score_seguridad_transito":    max(0, score_res - 5),
        "tendencia":                   "ESTABLE",
        "categoria_seguridad":         categoria,
        "nota_seguridad":              f"Estimado municipal. {fuente}",
    }


UPSERT_SQL = """
INSERT INTO analytics.barrios_seguridad
    (barrio_id, nombre_barrio, comuna, codigo_comuna, zona_turistica,
     casos_residente_3anios, casos_residente_por_1000hab,
     casos_totales_3anios, casos_por_1000hab,
     score_seguridad_residente, ranking_seguridad,
     score_seguridad_transito, tendencia, categoria_seguridad, nota_seguridad)
VALUES
    (%(barrio_id)s, %(nombre_barrio)s, %(municipio)s, %(municipio)s, FALSE,
     %(casos_residente_3anios)s, %(casos_residente_por_1000hab)s,
     %(casos_totales_3anios)s, %(casos_por_1000hab)s,
     %(score_seguridad_residente)s, 0,
     %(score_seguridad_transito)s, %(tendencia)s,
     %(categoria_seguridad)s, %(nota_seguridad)s)
ON CONFLICT (barrio_id) DO UPDATE SET
    casos_residente_3anios      = EXCLUDED.casos_residente_3anios,
    casos_residente_por_1000hab = EXCLUDED.casos_residente_por_1000hab,
    casos_totales_3anios        = EXCLUDED.casos_totales_3anios,
    casos_por_1000hab           = EXCLUDED.casos_por_1000hab,
    score_seguridad_residente   = EXCLUDED.score_seguridad_residente,
    score_seguridad_transito    = EXCLUDED.score_seguridad_transito,
    tendencia                   = EXCLUDED.tendencia,
    categoria_seguridad         = EXCLUDED.categoria_seguridad,
    nota_seguridad              = EXCLUDED.nota_seguridad;
"""


def add_unique_constraint(cur):
    """Add unique constraint on barrio_id if not exists."""
    cur.execute("""
        SELECT COUNT(*) AS n FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu USING (constraint_name)
        WHERE tc.table_schema='analytics' AND tc.table_name='barrios_seguridad'
          AND tc.constraint_type='UNIQUE' AND ccu.column_name='barrio_id'
    """)
    if cur.fetchone()["n"] == 0:
        cur.execute(
            "ALTER TABLE analytics.barrios_seguridad ADD CONSTRAINT uq_barrios_seguridad_barrio_id UNIQUE (barrio_id)"
        )
        print("  Añadida UNIQUE constraint en barrio_id")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    conn = psycopg2.connect(DB_URL)
    cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    if not args.dry_run:
        add_unique_constraint(cur)
        conn.commit()

    total_upserted = 0

    for municipio_upper in sorted(POBLACION.keys()):
        perfil = calcular_perfil(municipio_upper)
        print(f"\n── {municipio_upper} ──────────────────────────────────")
        print(f"  casos/1000hab: {perfil['casos_por_1000hab']}")
        print(f"  score:         {perfil['score_seguridad_residente']}  ({perfil['categoria_seguridad']})")

        cur.execute(
            "SELECT id, nombre FROM raw.barrios WHERE upper(municipio)=upper(%s)",
            (municipio_upper,)
        )
        barrios = [dict(r) for r in cur.fetchall()]
        print(f"  Barrios: {len(barrios)}")

        if args.dry_run:
            continue

        records = [
            {
                "barrio_id":    b["id"],
                "nombre_barrio": b["nombre"],
                "municipio":    municipio_upper,
                **perfil,
            }
            for b in barrios
        ]
        psycopg2.extras.execute_batch(cur, UPSERT_SQL, records, page_size=100)
        total_upserted += len(records)
        print(f"  Upserted: {len(records)} barrios")

    if not args.dry_run:
        conn.commit()
        print(f"\n✓ Total upserted: {total_upserted} barrios")
        print("  Ahora corre: python scripts/enrich_barrios_stats.py")
    else:
        print("\n[dry-run] Sin escritura a DB")

    conn.close()


if __name__ == "__main__":
    main()
