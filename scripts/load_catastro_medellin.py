"""
Catastro Medellín — carga raw.catastro_medellin desde CSV.

Pasos:
  1. Crear tabla e índices en raw.catastro_medellin
  2. Cargar CSV en chunks de 50 000 filas
  3. Verificar: resumen por comuna (urbano, con construcción)

Run:
  python scripts/load_catastro_medellin.py
"""

import os
import sys
from pathlib import Path

import pandas as pd
import psycopg2
import psycopg2.extras

DB_URL = os.environ["DATABASE_URL"]

CSV_PATH = Path(__file__).parent.parent / "PQR_Predios anonimizado(Hoja1).csv"

DDL = """
CREATE TABLE IF NOT EXISTS raw.catastro_medellin (
    id                    SERIAL PRIMARY KEY,
    matricula_anonimizada VARCHAR,
    cd_comuna             INTEGER,
    ds_comuna             VARCHAR,
    nm_ar_lote            DECIMAL,
    nm_ar_constru         DECIMAL,
    area_desenglobe       DECIMAL,
    cd_uso                INTEGER,
    cd_tipo               INTEGER,
    cd_uso_lote           INTEGER,
    cd_tipo_lote          INTEGER,
    ds_uso_tipo           VARCHAR,
    vl_av_lote            BIGINT,
    vl_av_constru         BIGINT,
    vl_avaluo_total       BIGINT,
    cd_ind_ru_ur          VARCHAR,
    fecha_carga           TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_catastro_comuna
    ON raw.catastro_medellin(cd_comuna);
CREATE INDEX IF NOT EXISTS idx_catastro_uso
    ON raw.catastro_medellin(ds_uso_tipo);
CREATE INDEX IF NOT EXISTS idx_catastro_avaluo
    ON raw.catastro_medellin(vl_avaluo_total);
"""

VERIFY_SQL = """
SELECT
    ds_comuna,
    COUNT(*)                                          AS predios,
    ROUND(AVG(vl_avaluo_total) / 1000000.0, 1)        AS avaluo_prom_M_COP,
    ROUND(AVG(nm_ar_constru), 0)                      AS area_prom_m2
FROM raw.catastro_medellin
WHERE cd_ind_ru_ur = 'U'
  AND nm_ar_constru > 0
GROUP BY ds_comuna
ORDER BY predios DESC;
"""

DTYPE = {
    "matricula_anonimizada": str,
    "cd_comuna":             "Int64",
    "cd_uso":                "Int64",
    "cd_tipo":               "Int64",
    "cd_uso_lote":           "Int64",
    "cd_tipo_lote":          "Int64",
    # Leídas como str: el CSV usa coma decimal (p.ej. "36,7" o "5,32513E+11")
    "nm_ar_lote":            str,
    "nm_ar_constru":         str,
    "area_desenglobe":       str,
    "vl_av_lote":            str,
    "vl_av_constru":         str,
    "vl_avaluo_total":       str,
    "cd_ind_ru_ur":          str,
}

# Columnas con coma decimal → float (DECIMAL en BD)
DECIMAL_COLS = ["nm_ar_lote", "nm_ar_constru", "area_desenglobe"]
# Columnas monetarias con coma decimal → entero (BIGINT en BD)
MONEY_COLS = ["vl_av_lote", "vl_av_constru", "vl_avaluo_total"]


def _clean_num(series: "pd.Series") -> "pd.Series":
    return (
        series.str.strip().str.replace(",", ".", regex=False)
        if series.dtype == object else series
    )


def parse_decimal(series: "pd.Series") -> "pd.Series":
    return pd.to_numeric(_clean_num(series), errors="coerce")


def parse_money(series: "pd.Series") -> "pd.Series":
    return pd.to_numeric(_clean_num(series), errors="coerce").round(0).astype("Int64")


def main():
    if not CSV_PATH.exists():
        print(f"ERROR: archivo no encontrado → {CSV_PATH}", file=sys.stderr)
        sys.exit(1)

    # Columnas en el mismo orden que la tabla (excluyendo id y fecha_carga)
    DB_COLS = [
        "matricula_anonimizada", "cd_comuna", "ds_comuna",
        "nm_ar_lote", "nm_ar_constru", "area_desenglobe",
        "cd_uso", "cd_tipo", "cd_uso_lote", "cd_tipo_lote",
        "ds_uso_tipo", "vl_av_lote", "vl_av_constru",
        "vl_avaluo_total", "cd_ind_ru_ur",
    ]

    INSERT_SQL = f"""
        INSERT INTO raw.catastro_medellin
            ({', '.join(DB_COLS)})
        VALUES %s
    """

    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor()

    # ── Paso 1: DDL ───────────────────────────────────────────────────────────
    print("── Paso 1: Creando tabla e índices ──────────────────────────────")
    cur.execute(DDL)
    conn.commit()
    print("✓ raw.catastro_medellin lista\n")

    # ── Paso 2: Carga en chunks ───────────────────────────────────────────────
    print("── Paso 2: Cargando CSV ─────────────────────────────────────────")
    total = 0
    try:
        for i, chunk in enumerate(
            pd.read_csv(
                CSV_PATH,
                sep=";",
                encoding="latin-1",
                chunksize=50_000,
                dtype=DTYPE,
                low_memory=False,
            )
        ):
            chunk.columns = chunk.columns.str.lower().str.strip()
            chunk = chunk.drop(columns=["id"], errors="ignore")

            for col in DECIMAL_COLS:
                if col in chunk.columns:
                    chunk[col] = parse_decimal(chunk[col])
            for col in MONEY_COLS:
                if col in chunk.columns:
                    chunk[col] = parse_money(chunk[col])

            # Reordenar y seleccionar sólo las columnas de la tabla
            chunk = chunk.reindex(columns=DB_COLS)

            # Convertir tipos numpy → Python nativos para psycopg2
            def _py(v):
                if v is None:
                    return None
                try:
                    if pd.isna(v):
                        return None
                except (TypeError, ValueError):
                    pass
                if hasattr(v, "item"):   # numpy scalar → Python
                    return v.item()
                return v

            rows_iter = [
                tuple(_py(v) for v in row)
                for row in chunk.itertuples(index=False, name=None)
            ]

            psycopg2.extras.execute_values(cur, INSERT_SQL, rows_iter, page_size=1000)
            conn.commit()

            total += len(chunk)
            print(f"  Chunk {i + 1:>3}: +{len(chunk):>6} filas → Total: {total:>9,}")

    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()

    print(f"\n✅ Carga completa: {total:,} registros\n")

    # ── Paso 3: Verificación ──────────────────────────────────────────────────
    print("── Paso 3: Verificación por comuna (urbano, con construcción) ───")
    verify_conn = psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    verify_cur = verify_conn.cursor()
    verify_cur.execute(VERIFY_SQL)
    rows = verify_cur.fetchall()
    verify_cur.close()
    verify_conn.close()

    header = f"{'COMUNA':<30} {'PREDIOS':>10} {'AVALÚO PROM (M COP)':>22} {'ÁREA PROM m²':>14}"
    sep = "-" * len(header)
    print(header)
    print(sep)
    for r in rows:
        print(
            f"{(r['ds_comuna'] or 'N/A'):<30} "
            f"{r['predios']:>10,} "
            f"{float(r['avaluo_prom_m_cop'] or 0):>22.1f} "
            f"{float(r['area_prom_m2'] or 0):>14.0f}"
        )
    print(sep)
    print(f"{'TOTAL COMUNAS':>30}: {len(rows)}")


if __name__ == "__main__":
    main()
