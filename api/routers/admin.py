from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from api.db import get_pool
from api.dependencies import get_current_user

router = APIRouter()

ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "edwardgiraldo101@gmail.com")


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["email"] != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="No autorizado")
    return user


def _hace_cuanto(dt: datetime) -> str:
    now = datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    diff = now - dt
    seconds = int(diff.total_seconds())
    if seconds < 60:
        return "hace un momento"
    if seconds < 3600:
        m = seconds // 60
        return f"hace {m} minuto{'s' if m != 1 else ''}"
    if seconds < 86400:
        h = seconds // 3600
        return f"hace {h} hora{'s' if h != 1 else ''}"
    d = seconds // 86400
    return f"hace {d} día{'s' if d != 1 else ''}"


# ── Endpoint 1: Dashboard ─────────────────────────────────────────────────────

@router.get("/dashboard")
async def dashboard(admin: dict = Depends(require_admin)):
    pool = get_pool()

    # Usuarios totals
    total_usuarios = await pool.fetchval("SELECT COUNT(*) FROM usuarios")
    activos_7 = await pool.fetchval(
        "SELECT COUNT(DISTINCT usuario_id) FROM historial WHERE created_at > NOW() - INTERVAL '7 days'"
    )
    activos_30 = await pool.fetchval(
        "SELECT COUNT(DISTINCT usuario_id) FROM historial WHERE created_at > NOW() - INTERVAL '30 days'"
    )
    nuevos_hoy = await pool.fetchval(
        "SELECT COUNT(*) FROM usuarios WHERE created_at > NOW() - INTERVAL '1 day'"
    )
    nuevos_7 = await pool.fetchval(
        "SELECT COUNT(*) FROM usuarios WHERE created_at > NOW() - INTERVAL '7 days'"
    )
    nuevos_30 = await pool.fetchval(
        "SELECT COUNT(*) FROM usuarios WHERE created_at > NOW() - INTERVAL '30 days'"
    )

    # Perfiles — objetivo
    objetivo_rows = await pool.fetch(
        "SELECT objetivo, COUNT(*) AS n FROM perfil_inversor WHERE objetivo IS NOT NULL GROUP BY objetivo"
    )
    por_objetivo = {"airbnb": 0, "nomadas": 0, "mediano_plazo": 0, "largo_plazo": 0, "mixto": 0}
    for r in objetivo_rows:
        k = r["objetivo"]
        if k in por_objetivo:
            por_objetivo[k] = int(r["n"])

    # Perfiles — riesgo (column may be perfil_riesgo OR riesgo depending on migration)
    try:
        riesgo_rows = await pool.fetch(
            "SELECT perfil_riesgo, COUNT(*) AS n FROM perfil_inversor WHERE perfil_riesgo IS NOT NULL GROUP BY perfil_riesgo"
        )
    except Exception:
        riesgo_rows = await pool.fetch(
            "SELECT riesgo AS perfil_riesgo, COUNT(*) AS n FROM perfil_inversor WHERE riesgo IS NOT NULL GROUP BY riesgo"
        )
    por_riesgo = {"conservador": 0, "moderado": 0, "agresivo": 0}
    for r in riesgo_rows:
        k = r["perfil_riesgo"]
        if k in por_riesgo:
            por_riesgo[k] = int(r["n"])

    # Perfiles — presupuesto
    try:
        pres_rows = await pool.fetch(
            """
            SELECT
                CASE
                    WHEN presupuesto_max_cop < 200000000 THEN 'menos_200M'
                    WHEN presupuesto_max_cop < 500000000 THEN '200M_500M'
                    WHEN presupuesto_max_cop < 1000000000 THEN '500M_1000M'
                    ELSE 'mas_1000M'
                END AS rango,
                COUNT(*) AS n
            FROM perfil_inversor
            WHERE presupuesto_max_cop IS NOT NULL
            GROUP BY rango
            """
        )
    except Exception:
        pres_rows = await pool.fetch(
            """
            SELECT
                CASE
                    WHEN presupuesto_max < 200000000 THEN 'menos_200M'
                    WHEN presupuesto_max < 500000000 THEN '200M_500M'
                    WHEN presupuesto_max < 1000000000 THEN '500M_1000M'
                    ELSE 'mas_1000M'
                END AS rango,
                COUNT(*) AS n
            FROM perfil_inversor
            WHERE presupuesto_max IS NOT NULL
            GROUP BY rango
            """
        )
    por_presupuesto = {"menos_200M": 0, "200M_500M": 0, "500M_1000M": 0, "mas_1000M": 0}
    for r in pres_rows:
        k = r["rango"]
        if k in por_presupuesto:
            por_presupuesto[k] = int(r["n"])

    # Comportamiento
    total_sims = await pool.fetchval("SELECT COUNT(*) FROM historial WHERE tipo = 'simulacion'") or 0
    total_comps = await pool.fetchval("SELECT COUNT(*) FROM historial WHERE tipo = 'comparacion'") or 0
    total_vistas = await pool.fetchval("SELECT COUNT(*) FROM historial WHERE tipo = 'vista_barrio'") or 0
    total_favs = await pool.fetchval("SELECT COUNT(*) FROM favoritos") or 0

    top_barrios_rows = await pool.fetch(
        """
        SELECT b.id AS barrio_id, b.nombre, b.municipio, COUNT(*) AS visitas
        FROM historial h
        JOIN raw.barrios b ON h.barrio_id = b.id
        WHERE h.tipo = 'vista_barrio'
        GROUP BY b.id, b.nombre, b.municipio
        ORDER BY visitas DESC
        LIMIT 10
        """
    )
    barrios_top10 = [
        {"barrio_id": r["barrio_id"], "nombre": r["nombre"],
         "municipio": r["municipio"], "visitas": int(r["visitas"])}
        for r in top_barrios_rows
    ]

    muni_rows = await pool.fetch(
        """
        SELECT b.municipio, COUNT(*) AS visitas
        FROM historial h
        JOIN raw.barrios b ON h.barrio_id = b.id
        WHERE h.tipo = 'vista_barrio'
        GROUP BY b.municipio
        ORDER BY visitas DESC
        LIMIT 5
        """
    )
    municipios_top5 = [{"municipio": r["municipio"], "visitas": int(r["visitas"])} for r in muni_rows]

    obj_top = await pool.fetchrow(
        "SELECT objetivo FROM perfil_inversor WHERE objetivo IS NOT NULL GROUP BY objetivo ORDER BY COUNT(*) DESC LIMIT 1"
    )
    objetivo_mas_comun = obj_top["objetivo"] if obj_top else None

    fav_top = await pool.fetchrow(
        """
        SELECT b.nombre
        FROM favoritos f
        JOIN raw.barrios b ON f.barrio_id = b.id
        GROUP BY b.nombre
        ORDER BY COUNT(*) DESC
        LIMIT 1
        """
    )
    barrio_mas_fav = fav_top["nombre"] if fav_top else None

    reg_rows = await pool.fetch(
        """
        SELECT DATE(created_at) AS fecha, COUNT(*) AS count
        FROM usuarios
        WHERE created_at > NOW() - INTERVAL '30 days'
        GROUP BY fecha
        ORDER BY fecha
        """
    )
    registros_por_dia = [{"fecha": str(r["fecha"]), "count": int(r["count"])} for r in reg_rows]

    act_rows = await pool.fetch(
        """
        SELECT DATE(created_at) AS fecha, COUNT(*) AS acciones
        FROM historial
        WHERE created_at > NOW() - INTERVAL '14 days'
        GROUP BY fecha
        ORDER BY fecha
        """
    )
    actividad_por_dia = [{"fecha": str(r["fecha"]), "acciones": int(r["acciones"])} for r in act_rows]

    return {
        "usuarios": {
            "total": int(total_usuarios),
            "activos_7dias": int(activos_7 or 0),
            "activos_30dias": int(activos_30 or 0),
            "nuevos_hoy": int(nuevos_hoy),
            "nuevos_7dias": int(nuevos_7),
            "nuevos_30dias": int(nuevos_30),
        },
        "perfiles": {
            "por_objetivo": por_objetivo,
            "por_riesgo": por_riesgo,
            "por_presupuesto": por_presupuesto,
            "por_idioma": {"es": 0, "en": 0},
        },
        "comportamiento": {
            "total_simulaciones": int(total_sims),
            "total_comparaciones": int(total_comps),
            "total_vistas_barrio": int(total_vistas),
            "total_favoritos": int(total_favs),
            "barrios_top10": barrios_top10,
            "municipios_top5": municipios_top5,
            "objetivo_mas_comun": objetivo_mas_comun,
            "barrio_mas_favoriteado": barrio_mas_fav,
        },
        "registros_por_dia": registros_por_dia,
        "actividad_por_dia": actividad_por_dia,
    }


# ── Endpoint 2: Lista usuarios ────────────────────────────────────────────────

@router.get("/usuarios")
async def list_usuarios(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    objetivo: Optional[str] = Query(None),
    perfil_riesgo: Optional[str] = Query(None),
    order_by: str = Query("created_at"),
    admin: dict = Depends(require_admin),
):
    pool = get_pool()
    offset = (page - 1) * limit

    where_parts = ["1=1"]
    params: list = []

    if search:
        params.append(f"%{search}%")
        where_parts.append(f"(u.nombre ILIKE ${len(params)} OR u.email ILIKE ${len(params)})")

    if objetivo:
        params.append(objetivo)
        where_parts.append(f"p.objetivo = ${len(params)}")

    if perfil_riesgo:
        params.append(perfil_riesgo)
        try:
            where_parts.append(f"p.perfil_riesgo = ${len(params)}")
        except Exception:
            where_parts.append(f"p.riesgo = ${len(params)}")

    order_map = {
        "created_at": "u.created_at",
        "last_login": "u.last_login",
        "actividad": "ultima_actividad",
    }
    order_col = order_map.get(order_by, "u.created_at")

    where_clause = " AND ".join(where_parts)

    total_query = f"""
        SELECT COUNT(DISTINCT u.id)
        FROM usuarios u
        LEFT JOIN perfil_inversor p ON p.usuario_id = u.id
        WHERE {where_clause}
    """
    total = await pool.fetchval(total_query, *params) or 0

    params_paged = params + [limit, offset]
    rows = await pool.fetch(
        f"""
        SELECT
            u.id,
            u.nombre,
            u.email,
            u.created_at,
            u.last_login,
            EXTRACT(DAY FROM NOW() - u.created_at)::int AS dias_desde_registro,
            p.presupuesto,
            p.objetivo,
            COALESCE(p.perfil_riesgo, p.riesgo) AS perfil_riesgo,
            COUNT(DISTINCT h.id) AS total_acciones,
            COUNT(DISTINCT CASE WHEN h.tipo = 'vista_barrio' THEN h.id END) AS barrios_visitados,
            COUNT(DISTINCT CASE WHEN h.tipo = 'simulacion' THEN h.id END) AS simulaciones,
            COUNT(DISTINCT CASE WHEN h.tipo = 'comparacion' THEN h.id END) AS comparaciones,
            COUNT(DISTINCT f.id) AS favoritos,
            MAX(h.created_at) AS ultima_actividad
        FROM usuarios u
        LEFT JOIN perfil_inversor p ON p.usuario_id = u.id
        LEFT JOIN historial h ON h.usuario_id = u.id
        LEFT JOIN favoritos f ON f.usuario_id = u.id
        WHERE {where_clause}
        GROUP BY u.id, u.nombre, u.email, u.created_at, u.last_login,
                 p.presupuesto, p.objetivo, p.perfil_riesgo, p.riesgo
        ORDER BY {order_col} DESC NULLS LAST
        LIMIT ${len(params_paged) - 1} OFFSET ${len(params_paged)}
        """,
        *params_paged,
    )

    import math
    usuarios = []
    for r in rows:
        usuarios.append({
            "id": r["id"],
            "nombre": r["nombre"],
            "email": r["email"],
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            "last_login": r["last_login"].isoformat() if r["last_login"] else None,
            "dias_desde_registro": r["dias_desde_registro"],
            "perfil": {
                "presupuesto": r["presupuesto"],
                "objetivo": r["objetivo"],
                "perfil_riesgo": r["perfil_riesgo"],
            },
            "stats": {
                "barrios_visitados": int(r["barrios_visitados"] or 0),
                "simulaciones": int(r["simulaciones"] or 0),
                "comparaciones": int(r["comparaciones"] or 0),
                "favoritos": int(r["favoritos"] or 0),
                "ultima_actividad": r["ultima_actividad"].isoformat() if r["ultima_actividad"] else None,
            },
        })

    return {
        "total": int(total),
        "page": page,
        "pages": math.ceil(int(total) / limit) if total else 1,
        "usuarios": usuarios,
    }


# ── Endpoint 3: Detalle usuario ───────────────────────────────────────────────

@router.get("/usuarios/{usuario_id}")
async def detalle_usuario(usuario_id: int, admin: dict = Depends(require_admin)):
    pool = get_pool()

    user_row = await pool.fetchrow(
        "SELECT id, nombre, apellido, email, created_at, last_login, activo FROM usuarios WHERE id = $1",
        usuario_id,
    )
    if user_row is None:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    perfil_row = await pool.fetchrow(
        "SELECT * FROM perfil_inversor WHERE usuario_id = $1 ORDER BY id DESC LIMIT 1",
        usuario_id,
    )

    # Stats agregados
    stats_row = await pool.fetchrow(
        """
        SELECT
            COUNT(*) AS total_acciones,
            COUNT(DISTINCT barrio_id) FILTER (WHERE barrio_id IS NOT NULL) AS barrios_unicos,
            COUNT(DISTINCT DATE(created_at)) AS dias_activo
        FROM historial
        WHERE usuario_id = $1
        """,
        usuario_id,
    )

    muni_rows = await pool.fetch(
        """
        SELECT DISTINCT b.municipio
        FROM historial h
        JOIN raw.barrios b ON h.barrio_id = b.id
        WHERE h.usuario_id = $1
        """,
        usuario_id,
    )
    municipios = [r["municipio"] for r in muni_rows]

    # Favoritos
    fav_rows = await pool.fetch(
        """
        SELECT b.nombre AS barrio, b.municipio, f.nota, f.created_at
        FROM favoritos f
        JOIN raw.barrios b ON f.barrio_id = b.id
        WHERE f.usuario_id = $1
        ORDER BY f.created_at DESC
        """,
        usuario_id,
    )
    favoritos = [
        {
            "barrio": r["barrio"],
            "municipio": r["municipio"],
            "nota": r["nota"],
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
        }
        for r in fav_rows
    ]

    # Historial reciente
    hist_rows = await pool.fetch(
        """
        SELECT h.tipo, h.metadata, h.created_at,
               b.nombre AS barrio_nombre, b.municipio
        FROM historial h
        LEFT JOIN raw.barrios b ON h.barrio_id = b.id
        WHERE h.usuario_id = $1
        ORDER BY h.created_at DESC
        LIMIT 50
        """,
        usuario_id,
    )
    historial = [
        {
            "tipo": r["tipo"],
            "barrio": r["barrio_nombre"],
            "municipio": r["municipio"],
            "metadata": dict(r["metadata"]) if r["metadata"] else {},
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
        }
        for r in hist_rows
    ]

    # Simulaciones
    sim_rows = await pool.fetch(
        """
        SELECT b.nombre AS barrio,
               (h.metadata->>'presupuesto_cop')::bigint AS presupuesto_cop,
               h.metadata->>'tipo_inversion' AS tipo_inversion,
               h.created_at
        FROM historial h
        LEFT JOIN raw.barrios b ON h.barrio_id = b.id
        WHERE h.usuario_id = $1 AND h.tipo = 'simulacion'
        ORDER BY h.created_at DESC
        LIMIT 20
        """,
        usuario_id,
    )
    simulaciones = [
        {
            "barrio": r["barrio"],
            "presupuesto_cop": r["presupuesto_cop"],
            "tipo_inversion": r["tipo_inversion"],
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
        }
        for r in sim_rows
    ]

    # Top 5 barrios por visitas
    top5_rows = await pool.fetch(
        """
        SELECT b.nombre, b.municipio, COUNT(*) AS visitas
        FROM historial h
        JOIN raw.barrios b ON h.barrio_id = b.id
        WHERE h.usuario_id = $1 AND h.tipo = 'vista_barrio'
        GROUP BY b.nombre, b.municipio
        ORDER BY visitas DESC
        LIMIT 5
        """,
        usuario_id,
    )
    barrios_top5 = [
        {"nombre": r["nombre"], "municipio": r["municipio"], "visitas": int(r["visitas"])}
        for r in top5_rows
    ]

    # Actividad por día (4 semanas)
    act_rows = await pool.fetch(
        """
        SELECT DATE(created_at) AS fecha, COUNT(*) AS acciones
        FROM historial
        WHERE usuario_id = $1 AND created_at > NOW() - INTERVAL '28 days'
        GROUP BY fecha
        ORDER BY fecha
        """,
        usuario_id,
    )
    actividad_por_dia = [
        {"fecha": str(r["fecha"]), "acciones": int(r["acciones"])}
        for r in act_rows
    ]

    dias = int(stats_row["dias_activo"] or 0)
    total_acc = int(stats_row["total_acciones"] or 0)
    total_sesiones = max(1, dias) if dias else 0

    return {
        "usuario": {
            "id": user_row["id"],
            "nombre": user_row["nombre"],
            "apellido": user_row["apellido"],
            "email": user_row["email"],
            "created_at": user_row["created_at"].isoformat() if user_row["created_at"] else None,
            "last_login": user_row["last_login"].isoformat() if user_row["last_login"] else None,
            "activo": user_row["activo"],
        },
        "perfil": dict(perfil_row) if perfil_row else {},
        "stats": {
            "total_sesiones": total_sesiones,
            "total_acciones": total_acc,
            "barrios_unicos_visitados": int(stats_row["barrios_unicos"] or 0),
            "municipios_explorados": municipios,
            "dias_activo": dias,
        },
        "favoritos": favoritos,
        "historial_reciente": historial,
        "simulaciones": simulaciones,
        "barrios_top5": barrios_top5,
        "actividad_por_dia": actividad_por_dia,
    }


# ── Endpoint 4: Feed actividad ────────────────────────────────────────────────

@router.get("/actividad")
async def actividad_feed(
    limit: int = Query(50, ge=1, le=200),
    tipo: Optional[str] = Query(None),
    usuario_id: Optional[int] = Query(None),
    admin: dict = Depends(require_admin),
):
    pool = get_pool()

    where_parts = ["1=1"]
    params: list = []

    if tipo:
        params.append(tipo)
        where_parts.append(f"h.tipo = ${len(params)}")
    if usuario_id:
        params.append(usuario_id)
        where_parts.append(f"h.usuario_id = ${len(params)}")

    where_clause = " AND ".join(where_parts)
    params.append(limit)

    rows = await pool.fetch(
        f"""
        SELECT
            h.id,
            h.tipo,
            h.metadata,
            h.created_at,
            u.nombre AS usuario_nombre,
            u.email AS usuario_email,
            b.nombre AS barrio_nombre,
            b.municipio
        FROM historial h
        JOIN usuarios u ON h.usuario_id = u.id
        LEFT JOIN raw.barrios b ON h.barrio_id = b.id
        WHERE {where_clause}
        ORDER BY h.created_at DESC
        LIMIT ${len(params)}
        """,
        *params,
    )

    actividad = []
    for r in rows:
        actividad.append({
            "id": r["id"],
            "usuario_nombre": r["usuario_nombre"],
            "usuario_email": r["usuario_email"],
            "tipo": r["tipo"],
            "barrio": r["barrio_nombre"],
            "municipio": r["municipio"],
            "metadata": dict(r["metadata"]) if r["metadata"] else {},
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            "hace_cuanto": _hace_cuanto(r["created_at"]) if r["created_at"] else "",
        })

    return {"actividad": actividad}


# ── Endpoint 5: Métricas barrios ──────────────────────────────────────────────

@router.get("/barrios/stats")
async def barrios_stats(admin: dict = Depends(require_admin)):
    pool = get_pool()

    rows = await pool.fetch(
        """
        SELECT
            b.nombre,
            b.municipio,
            COUNT(DISTINCT h.id) FILTER (WHERE h.tipo = 'vista_barrio') AS visitas,
            COUNT(DISTINCT f.id) AS favoritos,
            COUNT(DISTINCT h.id) FILTER (WHERE h.tipo = 'simulacion') AS simulaciones
        FROM raw.barrios b
        LEFT JOIN historial h ON h.barrio_id = b.id
        LEFT JOIN favoritos f ON f.barrio_id = b.id
        GROUP BY b.id, b.nombre, b.municipio
        HAVING COUNT(DISTINCT h.id) > 0 OR COUNT(DISTINCT f.id) > 0
        ORDER BY (COUNT(DISTINCT h.id) + COUNT(DISTINCT f.id) * 3) DESC
        LIMIT 50
        """
    )

    barrios = []
    for r in rows:
        visitas = int(r["visitas"] or 0)
        favs = int(r["favoritos"] or 0)
        sims = int(r["simulaciones"] or 0)
        barrios.append({
            "nombre": r["nombre"],
            "municipio": r["municipio"],
            "visitas": visitas,
            "favoritos": favs,
            "simulaciones": sims,
            "score_engagement": visitas + favs * 3 + sims * 2,
        })

    return {"barrios": barrios}
