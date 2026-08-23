"""
Compraventas ORIPS (SNR Valle de Aburrá) — carga raw.compraventas_orips.

raw = fuente de verdad auditable: se cargan TODAS las filas tal cual.
NO se borran ceros, NO se borra el outlier de $732B, NO se deduplica
(no hay matrícula ni nº de escritura → dedup a ciegas borraría ventas reales).
Filas con valor o fecha imparseables se insertan con ese campo en NULL y se
CUENTAN (no hay pérdida muda).

Gotchas del archivo (perfilado confirmado):
  - encoding latin-1, separador ';'
  - header en la FILA 5 → skiprows=5, names propios por posición
  - VALOR: separador de miles europeo, "744.342.000" = 744342000 COP
    (los puntos son MILES, no decimales; pesos enteros sin centavos)
  - FECHA: dd/mm/yyyy
  - AREA m²: ~99.8% vacío → casi siempre NULL

Tras la carga: REFRESH MATERIALIZED VIEW analytics.compraventas_municipio_stats.

Run:
  python scripts/load_compraventas_orips.py
"""

import os
import sys
from pathlib import Path

import pandas as pd
import psycopg2
import psycopg2.extras

DB_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://social:urbidata007@localhost:5433/social",
)

CSV_PATH = Path(__file__).parent.parent / "Compraventas ORIPS Medellín(Exportar ) (1).csv"

# Columnas por posición (header real en fila 5, lo saltamos y nombramos nosotros)
NAMES = [
    "anio", "fecha_registro_raw", "municipio", "tipo_inmueble",
    "area_m2_raw", "valor_raw", "oficina_registro",
]

DB_COLS = [
    "anio", "fecha_registro", "municipio", "tipo_inmueble",
    "area_m2", "valor_cop", "oficina_registro",
]

INSERT_SQL = f"""
    INSERT INTO raw.compraventas_orips ({', '.join(DB_COLS)})
    VALUES %s
"""

REFRESH_SQL = "REFRESH MATERIALIZED VIEW analytics.compraventas_municipio_stats"

VERIFY_SQL = """
SELECT
    municipio,
    anio,
    n_transacciones,
    valor_mediana,
    valor_promedio
FROM analytics.compraventas_municipio_stats
WHERE municipio IN ('MEDELLIN','ENVIGADO','BELLO','CALDAS')
  AND anio IS NULL                    -- rollup todos los años
ORDER BY n_transacciones DESC;
"""

TREND_SQL = """
SELECT anio, valor_mediana
FROM analytics.compraventas_municipio_stats
WHERE municipio = 'MEDELLIN' AND anio IS NOT NULL
ORDER BY anio;
"""


def parse_valor(series: pd.Series) -> pd.Series:
    """Punto = separador de miles. Quita puntos → int. Vacío/no-numérico → NaN."""
    cleaned = series.astype(str).str.strip().str.replace(".", "", regex=False)
    return pd.to_numeric(cleaned, errors="coerce").astype("Int64")


def parse_area(series: pd.Series) -> pd.Series:
    """Área m². Coma decimal europea por si acaso. Vacío → NaN."""
    cleaned = series.astype(str).str.strip().str.replace(",", ".", regex=False)
    return pd.to_numeric(cleaned, errors="coerce")


def parse_fecha(series: pd.Series) -> pd.Series:
    """dd/mm/yyyy → date. Inválida → NaT."""
    return pd.to_datetime(
        series.astype(str).str.strip(), format="%d/%m/%Y", errors="coerce"
    )


def _is_failure(orig: pd.Series, parsed: pd.Series) -> int:
    """Tenía contenido pero no se pudo parsear (vacío → NULL legítimo, no falla)."""
    had_content = orig.notna() & (orig.astype(str).str.strip() != "") & (
        orig.astype(str).str.strip().str.lower() != "nan"
    )
    return int((had_content & parsed.isna()).sum())


def _py(v):
    if v is None:
        return None
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    if hasattr(v, "item"):
        return v.item()
    return v


def main():
    if not CSV_PATH.exists():
        print(f"ERROR: archivo no encontrado → {CSV_PATH}", file=sys.stderr)
        sys.exit(1)

    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor()

    print("── Paso 1: Cargando CSV (raw inmutable) ─────────────────────────")
    total = 0
    valor_null = 0
    fecha_null = 0
    area_null = 0
    valor_fail = 0
    fecha_fail = 0

    try:
        for i, chunk in enumerate(
            pd.read_csv(
                CSV_PATH,
                sep=";",
                encoding="latin-1",
                skiprows=5,            # 4 de preámbulo + 1 de header real
                header=None,
                names=NAMES,
                chunksize=50_000,
                dtype=str,
                low_memory=False,
            )
        ):
            valor = parse_valor(chunk["valor_raw"])
            fecha = parse_fecha(chunk["fecha_registro_raw"])
            area = parse_area(chunk["area_m2_raw"])

            # Conteo de fallas REALES (tenían contenido, no parsearon)
            valor_fail += _is_failure(chunk["valor_raw"], valor)
            fecha_fail += _is_failure(chunk["fecha_registro_raw"], fecha)

            anio = pd.to_numeric(chunk["anio"].str.strip(), errors="coerce").astype("Int64")

            out = pd.DataFrame({
                "anio": anio,
                "fecha_registro": fecha,
                "municipio": chunk["municipio"].str.strip(),
                "tipo_inmueble": chunk["tipo_inmueble"].str.strip(),
                "area_m2": area,
                "valor_cop": valor,
                "oficina_registro": chunk["oficina_registro"].str.strip(),
            })

            valor_null += int(out["valor_cop"].isna().sum())
            fecha_null += int(out["fecha_registro"].isna().sum())
            area_null += int(out["area_m2"].isna().sum())

            rows_iter = [
                tuple(_py(v) for v in row)
                for row in out.itertuples(index=False, name=None)
            ]
            psycopg2.extras.execute_values(cur, INSERT_SQL, rows_iter, page_size=1000)
            conn.commit()

            total += len(out)
            print(f"  Chunk {i + 1:>3}: +{len(out):>6} → Total: {total:>9,}")

    except Exception:
        conn.rollback()
        raise

    print(f"\n✅ Carga completa: {total:,} filas insertadas")
    print(f"   valor_cop NULL : {valor_null:,}  (de los cuales fallas de parseo: {valor_fail:,})")
    print(f"   fecha    NULL : {fecha_null:,}  (de los cuales fallas de parseo: {fecha_fail:,})")
    print(f"   area_m2  NULL : {area_null:,}  (esperado ~99.8% vacío)\n")

    print("── Paso 2: REFRESH matview stats ───────────────────────────────")
    cur.execute(REFRESH_SQL)
    conn.commit()
    cur.close()
    conn.close()
    print("✓ analytics.compraventas_municipio_stats refrescada\n")

    # ── Verificación ─────────────────────────────────────────────────────────
    print("── Verificación: mediana por municipio (todos los años) ─────────")
    v_conn = psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    v_cur = v_conn.cursor()
    v_cur.execute(VERIFY_SQL)
    for r in v_cur.fetchall():
        print(
            f"  {r['municipio']:<12} n={r['n_transacciones']:>8,}  "
            f"mediana=${r['valor_mediana']:>15,}  prom=${r['valor_promedio']:>15,}"
        )
    print("\n── Tendencia mediana MEDELLIN por año ───────────────────────────")
    v_cur.execute(TREND_SQL)
    for r in v_cur.fetchall():
        print(f"  {r['anio']}: ${r['valor_mediana']:>15,}")
    v_cur.close()
    v_conn.close()


if __name__ == "__main__":
    main()
