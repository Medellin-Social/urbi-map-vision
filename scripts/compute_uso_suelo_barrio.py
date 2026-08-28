"""
Recalcula raw.barrios.uso_suelo_dominante/uso_suelo_score desde raw.pot_usos_medellin.

Reemplaza una carga huérfana de 2026-05-02 (proceso no versionado, nunca
quedó como script) con un UPDATE reproducible: categoría POT dominante por
área intersectada, mismo patrón ST_Intersects que
dbt/models/analytics/score_largo_plazo.sql usa para estrato_manzana.

POT es Medellín-only (pot_usos_medellin, acuerdo48_2014) — barrios de otros
municipios quedan NULL, esperado.

Run:
  python scripts/compute_uso_suelo_barrio.py
"""

import os

import psycopg2

DB_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://social:urbidata007@localhost:5433/social",
)

# Score de potencial de uso/desarrollo — mismo mapeo que ya existía en la
# carga huérfana previa (baja mixtura < dotacional/espacio público < alta mixtura).
SCORE_POR_CATEGORIA = {
    "Áreas de baja mixtura": 50,
    "Espacio Público Existente": 40,
    "Espacio Público Proyectado": 40,
    "Uso Dotacional": 60,
    "Áreas y corredores de media mixtura": 65,
    "Áreas y corredores de alta mixtura": 85,
}

UPDATE_SQL = """
WITH dominante AS (
    SELECT DISTINCT ON (rb.id)
        rb.id AS barrio_id,
        p.areagraluso
    FROM raw.barrios rb
    JOIN raw.pot_usos_medellin p
        ON ST_Intersects(rb.geometry, p.geometry)
    ORDER BY rb.id, ST_Area(ST_Intersection(rb.geometry, p.geometry)) DESC
)
UPDATE raw.barrios b
SET uso_suelo_dominante = d.areagraluso,
    uso_suelo_score = CASE d.areagraluso
        %s
    END
FROM dominante d
WHERE d.barrio_id = b.id
"""

VERIFY_SQL = """
SELECT uso_suelo_dominante, uso_suelo_score, COUNT(*)
FROM raw.barrios
GROUP BY 1, 2
ORDER BY 3 DESC
"""


def main() -> None:
    when_clauses = "\n        ".join(
        f"WHEN '{cat}' THEN {score}" for cat, score in SCORE_POR_CATEGORIA.items()
    )
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    cur.execute(UPDATE_SQL % when_clauses)
    n = cur.rowcount
    conn.commit()
    print(f"Actualizados {n} barrios.")

    cur.execute(VERIFY_SQL)
    for cat, score, count in cur.fetchall():
        print(f"  {cat!r:45} score={score}  n={count}")
    conn.close()


if __name__ == "__main__":
    main()
