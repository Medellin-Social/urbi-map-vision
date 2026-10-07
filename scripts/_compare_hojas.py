import os
import psycopg2
import psycopg2.extras

DB_URL = os.environ["DATABASE_URL"]
conn = psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
cur = conn.cursor()

print("=" * 60)
print("COMPARACIÓN HOJA1 vs HOJA2")
print("=" * 60)

# 1. Totales básicos
cur.execute("""
SELECT
  (SELECT COUNT(*) FROM raw.catastro_medellin)         AS h1_total,
  (SELECT COUNT(DISTINCT matricula_anonimizada) FROM raw.catastro_medellin) AS h1_mat_unicas,
  (SELECT COUNT(*) FROM raw.catastro_medellin_vigente) AS h2_total,
  (SELECT COUNT(DISTINCT matricula_anonimizada) FROM raw.catastro_medellin_vigente) AS h2_mat_unicas
""")
r = cur.fetchone()
print(f"\nHoja1 — total filas       : {r['h1_total']:>9,}")
print(f"Hoja1 — matrículas únicas : {r['h1_mat_unicas']:>9,}")
print(f"Hoja2 — total filas       : {r['h2_total']:>9,}")
print(f"Hoja2 — matrículas únicas : {r['h2_mat_unicas']:>9,}")

# 2. Solapamiento de matrículas
cur.execute("""
SELECT
  COUNT(*) FILTER (WHERE h1.matricula_anonimizada IS NOT NULL) AS en_ambas,
  COUNT(*) FILTER (WHERE h1.matricula_anonimizada IS NULL)     AS solo_hoja2
FROM raw.catastro_medellin_vigente h2
LEFT JOIN (SELECT DISTINCT matricula_anonimizada FROM raw.catastro_medellin) h1
  ON h2.matricula_anonimizada = h1.matricula_anonimizada
""")
r = cur.fetchone()
print(f"\nMATRÍCULAS")
print(f"  En ambas hojas : {r['en_ambas']:>9,}")
print(f"  Solo en Hoja2  : {r['solo_hoja2']:>9,}")

cur.execute("""
SELECT COUNT(DISTINCT matricula_anonimizada) AS solo_h1
FROM raw.catastro_medellin h1
WHERE NOT EXISTS (
  SELECT 1 FROM raw.catastro_medellin_vigente h2
  WHERE h2.matricula_anonimizada = h1.matricula_anonimizada
)
""")
r = cur.fetchone()
print(f"  Solo en Hoja1  : {r['solo_h1']:>9,}")

# 3. cd_ind_ru_ur (urbano/rural)
print(f"\ncd_ind_ru_ur (Hoja1):")
cur.execute("""
SELECT cd_ind_ru_ur, COUNT(*) AS n
FROM raw.catastro_medellin
GROUP BY cd_ind_ru_ur ORDER BY n DESC
""")
for row in cur.fetchall():
    print(f"  '{row['cd_ind_ru_ur']}' → {row['n']:>9,}")

print(f"\ncd_ind_ru_ur (Hoja2):")
cur.execute("""
SELECT cd_ind_ru_ur, COUNT(*) AS n
FROM raw.catastro_medellin_vigente
GROUP BY cd_ind_ru_ur ORDER BY n DESC
""")
for row in cur.fetchall():
    print(f"  '{row['cd_ind_ru_ur']}' → {row['n']:>9,}")

# 4. Avalúos promedio por tabla
cur.execute("""
SELECT
  ROUND(AVG(vl_avaluo_total)/1e6, 1) AS avg_h1,
  MIN(vl_avaluo_total) AS min_h1,
  MAX(vl_avaluo_total) AS max_h1
FROM raw.catastro_medellin WHERE vl_avaluo_total > 0
""")
r = cur.fetchone()
print(f"\nAVALÚOS (Hoja1, excl. ceros):")
print(f"  Promedio : {r['avg_h1']} M COP")
print(f"  Mín      : {r['min_h1']:>15,} COP")
print(f"  Máx      : {r['max_h1']:>15,} COP")

cur.execute("""
SELECT
  ROUND(AVG(vl_avaluo_total)/1e6, 1) AS avg_h2,
  MIN(vl_avaluo_total) AS min_h2,
  MAX(vl_avaluo_total) AS max_h2
FROM raw.catastro_medellin_vigente WHERE vl_avaluo_total > 0
""")
r = cur.fetchone()
print(f"\nAVALÚOS (Hoja2, excl. ceros):")
print(f"  Promedio : {r['avg_h2']} M COP")
print(f"  Mín      : {r['min_h2']:>15,} COP")
print(f"  Máx      : {r['max_h2']:>15,} COP")

# 5. Diferencia de registros con avalúo 0
cur.execute("""
SELECT
  (SELECT COUNT(*) FROM raw.catastro_medellin WHERE vl_avaluo_total = 0)         AS h1_ceros,
  (SELECT COUNT(*) FROM raw.catastro_medellin_vigente WHERE vl_avaluo_total = 0)  AS h2_ceros
""")
r = cur.fetchone()
print(f"\nPredios con avalúo = 0:")
print(f"  Hoja1 : {r['h1_ceros']:>9,}")
print(f"  Hoja2 : {r['h2_ceros']:>9,}")

# 6. Comunas en Hoja1 que NO están en Hoja2
cur.execute("""
SELECT DISTINCT ds_comuna FROM raw.catastro_medellin
WHERE ds_comuna NOT IN (SELECT DISTINCT ds_comuna FROM raw.catastro_medellin_vigente)
ORDER BY ds_comuna
""")
rows = cur.fetchall()
print(f"\nComunas en Hoja1 que NO están en Hoja2: {len(rows)}")
for row in rows:
    print(f"  {row['ds_comuna']}")

# 7. Diferencia de filas por comuna
print(f"\nDIFERENCIA DE PREDIOS POR COMUNA (Hoja1 - Hoja2):")
cur.execute("""
SELECT
  COALESCE(h1.ds_comuna, h2.ds_comuna) AS comuna,
  COALESCE(h1.n, 0) AS hoja1,
  COALESCE(h2.n, 0) AS hoja2,
  COALESCE(h1.n, 0) - COALESCE(h2.n, 0) AS diferencia
FROM
  (SELECT ds_comuna, COUNT(*) AS n FROM raw.catastro_medellin GROUP BY ds_comuna) h1
FULL OUTER JOIN
  (SELECT ds_comuna, COUNT(*) AS n FROM raw.catastro_medellin_vigente GROUP BY ds_comuna) h2
  ON h1.ds_comuna = h2.ds_comuna
ORDER BY diferencia DESC
""")
print(f"  {'COMUNA':<30} {'HOJA1':>9} {'HOJA2':>9} {'DIFF':>9}")
print(f"  {'-'*57}")
for row in cur.fetchall():
    print(f"  {(row['comuna'] or 'N/A'):<30} {row['hoja1']:>9,} {row['hoja2']:>9,} {row['diferencia']:>+9,}")

cur.close()
conn.close()
