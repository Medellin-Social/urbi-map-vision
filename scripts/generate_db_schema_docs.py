"""Extract full DB schema (columns + FKs) and emit DBML + Mermaid ER docs.

Regenerates docs/DATABASE_SCHEMA.md and docs/database/schema.dbml from the
live DB (DATABASE_URL) — not from alembic migrations, since this repo has a
known local<->prod schema drift. Run against local; re-check the GROUPS dict
below if new tables were added and don't fall into an existing domain.
"""
import os
import re
import psycopg2

DATABASE_URL = os.environ["DATABASE_URL"]
SCHEMAS = ("public", "raw", "staging", "analytics")

# Airflow-internal tables (metadata that leaked into this DB) + noise to exclude
EXCLUDE_PREFIXES = ("ab_", "dag", "task_", "xcom", "job", "log", "trigger",
                     "connection", "variable", "dataset", "slot_pool", "sla_miss",
                     "serialized_dag", "rendered_task_instance_fields", "import_error",
                     "session", "user_events_2026")
EXCLUDE_EXACT = {"spatial_ref_sys", "urbi_alembic_version", "alembic_version",
                  "geography_columns", "geometry_columns",
                  "raw.barrios_comuna_backup_20260609"}


def excluded(schema, table):
    if f"{schema}.{table}" in EXCLUDE_EXACT or table in EXCLUDE_EXACT:
        return True
    if schema == "public" and table.startswith(EXCLUDE_PREFIXES):
        return True
    return False


conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor()

cur.execute("""
    SELECT table_schema, table_name, column_name, data_type, is_nullable,
           column_default, character_maximum_length, ordinal_position
    FROM information_schema.columns
    WHERE table_schema = ANY(%s)
    ORDER BY table_schema, table_name, ordinal_position
""", (list(SCHEMAS),))
columns = {}
for schema, table, col, dtype, nullable, default, maxlen, pos in cur.fetchall():
    if excluded(schema, table):
        continue
    key = (schema, table)
    columns.setdefault(key, []).append(dict(
        col=col, dtype=dtype, nullable=(nullable == "YES"),
        default=default, maxlen=maxlen,
    ))

cur.execute("""
    SELECT tc.table_schema, tc.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = ANY(%s)
""", (list(SCHEMAS),))
pks = {}
for schema, table, col in cur.fetchall():
    pks.setdefault((schema, table), set()).add(col)

cur.execute("""
    SELECT
        ns.nspname AS schema, cl.relname AS table_name, att.attname AS col,
        fns.nspname AS f_schema, fcl.relname AS f_table, fatt.attname AS f_col
    FROM pg_constraint con
    JOIN pg_class cl ON cl.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = cl.relnamespace
    JOIN pg_class fcl ON fcl.oid = con.confrelid
    JOIN pg_namespace fns ON fns.oid = fcl.relnamespace
    JOIN LATERAL unnest(con.conkey, con.confkey) WITH ORDINALITY AS u(srckey, dstkey, ord)
      ON true
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = u.srckey
    JOIN pg_attribute fatt ON fatt.attrelid = con.confrelid AND fatt.attnum = u.dstkey
    WHERE con.contype = 'f' AND ns.nspname = ANY(%s)
    ORDER BY 1,2,3
""", (list(SCHEMAS),))
fks = []
for schema, table, col, fschema, ftable, fcol in cur.fetchall():
    if excluded(schema, table) or excluded(fschema, ftable):
        continue
    fks.append(dict(schema=schema, table=table, col=col,
                     fschema=fschema, ftable=ftable, fcol=fcol))

cur.execute("""
    SELECT table_schema, table_name, count(*)
    FROM information_schema.tables
    WHERE table_schema = ANY(%s) AND table_type='BASE TABLE'
    GROUP BY 1,2
""", (list(SCHEMAS),))
all_tables = sorted(k for k in columns.keys())

print(f"Tables kept: {len(all_tables)}")
print(f"FKs kept: {len(fks)}")

# ---------- DBML ----------
def dbml_type(dtype, maxlen):
    m = {
        "character varying": f"varchar({maxlen})" if maxlen else "varchar",
        "timestamp with time zone": "timestamptz",
        "timestamp without time zone": "timestamp",
        "double precision": "float8",
        "boolean": "bool",
        "integer": "int",
        "bigint": "bigint",
        "smallint": "smallint",
        "text": "text",
        "jsonb": "jsonb",
        "json": "json",
        "uuid": "uuid",
        "numeric": "numeric",
        "ARRAY": "array",
        "USER-DEFINED": "enum",
    }
    if dtype.startswith("geometry") or dtype == "USER-DEFINED":
        return dtype
    return m.get(dtype, dtype)


dbml_lines = []
dbml_lines.append("// Medellín Social — schema DB generado 2026-08-17 desde information_schema (local)")
dbml_lines.append("// Pega este archivo completo en drawsql.app (Import > DBML) o dbdiagram.io")
dbml_lines.append("")

for schema, table in all_tables:
    tname = f'"{schema}.{table}"' if schema != "public" else table
    dbml_lines.append(f"Table {tname} {{")
    key = (schema, table)
    table_pks = pks.get(key, set())
    for c in columns[key]:
        flags = []
        if c["col"] in table_pks:
            flags.append("pk")
        if not c["nullable"]:
            flags.append("not null")
        flag_str = f" [{', '.join(flags)}]" if flags else ""
        dtype = dbml_type(c["dtype"], c["maxlen"])
        dbml_lines.append(f'  "{c["col"]}" {dtype}{flag_str}')
    dbml_lines.append("}")
    dbml_lines.append("")

for fk in fks:
    src = f'"{fk["schema"]}.{fk["table"]}"' if fk["schema"] != "public" else fk["table"]
    dst = f'"{fk["fschema"]}.{fk["ftable"]}"' if fk["fschema"] != "public" else fk["ftable"]
    dbml_lines.append(f'Ref: {src}."{fk["col"]}" > {dst}."{fk["fcol"]}"')

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

with open(os.path.join(REPO_ROOT, "docs/database/schema.dbml"), "w") as f:
    f.write("\n".join(dbml_lines) + "\n")

print("DBML written")

# ---------- Mermaid domain groups ----------
GROUPS = {
    "auth_usuarios": {
        "title": "Auth & Usuarios",
        "tables": [("public", t) for t in [
            "usuarios", "perfil_inversor", "token_blacklist", "password_reset_tokens",
            "email_verification_tokens", "favoritos", "historial", "user_sessions",
            "user_interests", "user_events",
        ]],
    },
    "agentes_agencias": {
        "title": "Agentes, Agencias y Realtor",
        "tables": [("public", t) for t in [
            "owner", "agent", "agency", "agency_member", "agency_invite",
            "sponsorship", "agent_disponibilidad", "agentes", "agente_reviews",
            "agente_solicitudes",
        ]],
    },
    "listings_core": {
        "title": "Listings (modelo unificado) y moderación",
        "tables": [("public", t) for t in [
            "listing", "listing_media", "listing_moderacion", "due_diligence_item",
            "intake", "visita_solicitud", "listings_propios",
        ]],
    },
    "negocio_monetizacion": {
        "title": "Suscripciones, afiliados y negocio",
        "tables": [("public", t) for t in [
            "suscripciones_usuario", "suscripciones_negocio", "planes_negocio",
            "deals", "leads", "leads_negocio", "afiliados", "aplicaciones_afiliado",
            "embajadores", "aplicaciones_embajador", "referidos", "callback_request",
        ]],
    },
    "comunidad": {
        "title": "Comunidad (eventos, negocios locales, noticias)",
        "tables": [("public", t) for t in [
            "eventos", "tiendas", "noticias", "posts_barrio", "ciudades", "trm",
            "configuracion_mapa", "comparaciones_historial", "simulaciones_historial",
        ]],
    },
    "raw_listings": {
        "title": "Raw — listings scrapeados (fuentes externas)",
        "tables": [("raw", t) for t in [
            "listings_fincaraiz", "listings_metrocuadrado", "listings_premium",
            "listings_renta_media", "listings_casadolcecasa", "listings_precio_historial",
            "listing_media_mirror", "listing_vistas", "favoritos_listings",
            "airbnb_listings_portal", "airbnb_calendar_portal", "airbnb_barrios",
            "airbnb_mercado_valle",
        ]],
    },
    "raw_geo_referencia": {
        "title": "Raw — geografía y datos de referencia",
        "tables": [("raw", t) for t in [
            "barrios", "comunas", "estratos", "estratos_manzana", "catastro_medellin",
            "catastro_medellin_vigente", "compraventas_orips", "criminalidad_comunas",
            "criminalidad_comunas_mes", "criminalidad_municipios", "ipvn_dane",
            "ipvu_banrep", "pois", "pot_usos_medellin", "trafico_muestras",
            "parametros_sistema",
        ]],
    },
    "staging": {
        "title": "Staging (ETL intermedio)",
        "tables": [("staging", t) for t in [
            "stg_listings", "stg_listings_unificado", "stg_listings_v1_deprecated",
            "stg_airbnb_segmentado", "stg_seguridad", "stg_valorizacion",
            "barrios_enriquecidos", "stg_airbnb_amenities",
        ]],
    },
    "analytics": {
        "title": "Analytics (derivadas / scoring)",
        "tables": [("analytics", t) for t in [
            "barrios_cd", "barrios_score", "barrios_score_consolidado", "barrios_liquidez",
            "barrios_mercado", "barrios_medianas", "barrios_contexto", "barrios_amenities",
            "barrios_pois_distancia", "barrios_trafico_perfil", "barrios_seguridad",
            "barrios_verde", "barrios_airbnb_real", "barrios_renta_media",
            "barrios_renta_segmentada", "barrios_oportunidades", "barrios_top10_yield",
            "listings_georef", "listings_vs_catastro", "catastro_comunas_stats",
            "proyecciones_valorizacion", "score_corto_plazo", "score_mediano_plazo",
            "score_largo_plazo", "comparador_renta", "resumen_barrios",
        ]],
    },
}


def mermaid_type(dtype):
    dtype = dtype.replace(" ", "_")
    return dtype


def sanitize(name):
    return name


def gen_mermaid(group_tables):
    lines = ["```mermaid", "erDiagram"]
    present = [(s, t) for s, t in group_tables if (s, t) in columns]
    for schema, table in present:
        ename = table.upper() if schema == "public" else f"{schema}_{table}".upper()
        lines.append(f"    {ename} {{")
        table_pks = pks.get((schema, table), set())
        for c in columns[(schema, table)]:
            dtype = mermaid_type(c["dtype"])
            tag = "PK" if c["col"] in table_pks else ""
            lines.append(f'        {dtype} {c["col"]} {tag}'.rstrip())
        lines.append("    }")
    present_set = set(present)
    seen_edges = set()
    for fk in fks:
        s, t = fk["schema"], fk["table"]
        fs, ft = fk["fschema"], fk["ftable"]
        if (s, t) in present_set and (fs, ft) in present_set:
            sname = t.upper() if s == "public" else f"{s}_{t}".upper()
            fname = ft.upper() if fs == "public" else f"{fs}_{ft}".upper()
            edge = (sname, fname, fk["col"])
            if edge in seen_edges:
                continue
            seen_edges.add(edge)
            lines.append(f'    {fname} ||--o{{ {sname} : "{fk["col"]}"')
    lines.append("```")
    return "\n".join(lines)


doc = []
doc.append("# Base de datos — Medellín Social\n")
doc.append(
    "*Generado 2026-08-17 directamente desde `information_schema` de la DB local "
    "(refleja el schema real, no solo lo que dicen las migraciones — ver "
    "`project_data_gap_prod` en memoria sobre drift local↔prod). "
    "Se excluyeron las tablas internas de Airflow que quedaron en este mismo Postgres "
    "(`ab_*`, `dag*`, `task_*`, `xcom`, etc. — ver `project_airflow_stack`).*\n"
)
doc.append(
    "**Para editar visualmente:** pega [`docs/database/schema.dbml`](./database/schema.dbml) "
    "completo en [drawsql.app](https://drawsql.app) (botón Import) o en "
    "[dbdiagram.io](https://dbdiagram.io) — ambos leen formato DBML.\n"
)
doc.append("**Para ver aquí mismo:** los diagramas de abajo son Mermaid — GitHub los renderiza nativo en el `.md`, sin plugins.\n")
doc.append("## Índice\n")
for key, g in GROUPS.items():
    doc.append(f"- [{g['title']}](#{key.replace('_','-')})")
doc.append("")

for key, g in GROUPS.items():
    doc.append(f"## {g['title']}\n")
    doc.append(gen_mermaid(g["tables"]))
    doc.append("")

# tablas no agrupadas (por si algo quedó fuera)
grouped = set()
for g in GROUPS.values():
    grouped.update(g["tables"])
leftover = [k for k in all_tables if k not in grouped]
if leftover:
    doc.append("## Otras tablas (sin agrupar)\n")
    doc.append(", ".join(f"`{s}.{t}`" for s, t in leftover))
    doc.append("")

with open(os.path.join(REPO_ROOT, "docs/DATABASE_SCHEMA.md"), "w") as f:
    f.write("\n".join(doc) + "\n")

print("Mermaid doc written")
print("Leftover tables:", leftover)
