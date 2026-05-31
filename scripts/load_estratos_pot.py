"""
Load estratos (manzana level) and POT usos generales into PostgreSQL.
Both files are EPSG:9377 → reprojected to WGS84 (EPSG:4326).
Creates raw.estratos_manzana and raw.pot_usos_medellin WITHOUT touching
existing tables until verification passes.
"""

import os
import time
import geopandas as gpd
from sqlalchemy import create_engine, text

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://urbidata:urbidata007@localhost:5433/urbidata",
)

ESTRATO_PATH = os.path.join(ROOT, "geojson_estrato_socioeconomico_mr",
                             "estrato_socioeconomico_mr.geojson")
POT_PATH = os.path.join(ROOT, "geojson_pot48_2014_usos_generales",
                         "pot48_2014_usos_generales.geojson")


def load_estratos(engine):
    print("── PASO 1: Estratos ──────────────────────────────────────")
    t0 = time.time()

    gdf = gpd.read_file(ESTRATO_PATH)
    print(f"  CRS original : {gdf.crs}")
    print(f"  Registros    : {len(gdf)}")
    print(f"  Columnas     : {gdf.columns.tolist()}")

    gdf = gdf.to_crs(epsg=4326)
    print(f"  CRS reproyectado: {gdf.crs}")

    # Normalize geometry to MultiPolygon
    from shapely.geometry import MultiPolygon, Polygon
    def to_multi(geom):
        if geom is None:
            return None
        if isinstance(geom, Polygon):
            return MultiPolygon([geom])
        return geom
    gdf["geometry"] = gdf["geometry"].apply(to_multi)

    # Select columns
    cols = ["estrato", "comuna", "barrio", "codigo_barrio", "geometry"]
    if "fecha_sincronizacion" in gdf.columns:
        # Convert ms epoch to timestamp
        import pandas as pd
        gdf["fecha_sincronizacion"] = pd.to_datetime(
            gdf["fecha_sincronizacion"], unit="ms", utc=True
        ).dt.tz_localize(None)
        cols.append("fecha_sincronizacion")

    gdf["fuente"] = "mapgis_enero_2026"
    cols.append("fuente")

    gdf[cols].to_postgis(
        "estratos_manzana",
        engine,
        schema="raw",
        if_exists="replace",
        index=False,
    )

    # Indexes
    with engine.begin() as con:
        con.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_estratos_manzana_geom "
            "ON raw.estratos_manzana USING GIST(geometry)"
        ))
        con.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_estratos_manzana_estrato "
            "ON raw.estratos_manzana(estrato)"
        ))
        con.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_estratos_manzana_cod_barrio "
            "ON raw.estratos_manzana(codigo_barrio)"
        ))

    elapsed = time.time() - t0
    print(f"  ✅ Cargados {len(gdf)} registros en {elapsed:.1f}s")
    return len(gdf)


def load_pot(engine):
    print("── PASO 2: POT Usos Generales ────────────────────────────")
    t0 = time.time()

    gdf = gpd.read_file(POT_PATH)
    print(f"  CRS original : {gdf.crs}")
    print(f"  Registros    : {len(gdf)}")
    print(f"  Columnas     : {gdf.columns.tolist()}")
    print(f"  areagraluso  : {gdf['areagraluso'].unique().tolist()}")

    gdf = gdf.to_crs(epsg=4326)
    print(f"  CRS reproyectado: {gdf.crs}")

    from shapely.geometry import MultiPolygon, Polygon
    def to_multi(geom):
        if geom is None:
            return None
        if isinstance(geom, Polygon):
            return MultiPolygon([geom])
        return geom
    gdf["geometry"] = gdf["geometry"].apply(to_multi)

    gdf["fuente"] = "pot_acuerdo48_2014"

    cols = ["areagraluso", "subcategoria", "cod_cat_uso",
            "cod_subcat_uso", "geometry", "fuente"]

    gdf[cols].to_postgis(
        "pot_usos_medellin",
        engine,
        schema="raw",
        if_exists="replace",
        index=False,
    )

    with engine.begin() as con:
        con.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_pot_usos_geom "
            "ON raw.pot_usos_medellin USING GIST(geometry)"
        ))
        con.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_pot_usos_area "
            "ON raw.pot_usos_medellin(areagraluso)"
        ))

    elapsed = time.time() - t0
    print(f"  ✅ Cargados {len(gdf)} registros en {elapsed:.1f}s")
    return len(gdf)


def verify(engine):
    print("── PASO 3: Verificación ──────────────────────────────────")
    with engine.connect() as con:
        rows = con.execute(text("""
            SELECT 'estratos_manzana' as tabla,
                   COUNT(*) as registros,
                   COUNT(DISTINCT estrato) as estratos_distintos,
                   MIN(estrato) as min_estrato,
                   MAX(estrato) as max_estrato
            FROM raw.estratos_manzana
            UNION ALL
            SELECT 'pot_usos_medellin',
                   COUNT(*),
                   COUNT(DISTINCT areagraluso),
                   NULL, NULL
            FROM raw.pot_usos_medellin
        """)).fetchall()
        for r in rows:
            print(f"  {r[0]}: {r[1]} registros, {r[2]} categorías distintas")

        inv_est = con.execute(text(
            "SELECT COUNT(*) FROM raw.estratos_manzana WHERE NOT ST_IsValid(geometry)"
        )).scalar()
        inv_pot = con.execute(text(
            "SELECT COUNT(*) FROM raw.pot_usos_medellin WHERE NOT ST_IsValid(geometry)"
        )).scalar()
        print(f"  Geoms inválidas — estratos: {inv_est} | pot: {inv_pot}")

    if inv_est > 0:
        print("  Corrigiendo geoms inválidas en estratos_manzana...")
        with engine.begin() as con:
            con.execute(text(
                "UPDATE raw.estratos_manzana "
                "SET geometry = ST_Multi(ST_CollectionExtract(ST_MakeValid(geometry), 3)) "
                "WHERE NOT ST_IsValid(geometry)"
            ))

    if inv_pot > 0:
        print("  Corrigiendo geoms inválidas en pot_usos_medellin...")
        with engine.begin() as con:
            con.execute(text(
                "UPDATE raw.pot_usos_medellin "
                "SET geometry = ST_Multi(ST_CollectionExtract(ST_MakeValid(geometry), 3)) "
                "WHERE NOT ST_IsValid(geometry)"
            ))


if __name__ == "__main__":
    engine = create_engine(DATABASE_URL)
    load_estratos(engine)
    print()
    load_pot(engine)
    print()
    verify(engine)
    print("\n✅ Listo. Pasos 4-5 (actualizar raw.barrios) pendiente de aprobación.")
