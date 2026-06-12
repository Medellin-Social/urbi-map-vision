"""Portal de Agentes — registro, revisión y perfiles públicos."""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel

from api.db import get_pool
from api.dependencies import get_current_user, get_optional_user
from api.routers.admin import require_admin
from api.utils.email import (
    notify_admin_new_agente,
    notify_agente_aprobado,
    notify_agente_rechazado,
)
from api.utils.storage import upload_file

router = APIRouter()

_APP_URL = os.getenv("APP_URL", "https://medellin.social")


# ── POST /registro ─────────────────────────────────────────────────────────────

@router.post("/registro", status_code=201)
async def registro_agente(
    # Sección 1
    nombre_completo:      str = Form(...),
    cedula_numero:        str = Form(...),
    fecha_nacimiento:     Optional[str] = Form(None),
    # Sección 2
    inmobiliaria_nombre:  Optional[str] = Form(None),
    inmobiliaria_nit:     Optional[str] = Form(None),
    es_independiente:     bool = Form(True),
    # Sección 3
    anos_experiencia:     Optional[int] = Form(None),
    transacciones_cerradas: Optional[int] = Form(None),
    especialidad:         Optional[str] = Form(None),   # JSON array string
    tipo_inmueble:        Optional[str] = Form(None),   # JSON array string
    precio_rango_min:     Optional[float] = Form(None),
    precio_rango_max:     Optional[float] = Form(None),
    zonas_opera:          Optional[str] = Form(None),   # JSON array string
    # Sección 4
    telefono:             str = Form(...),
    email:                str = Form(...),
    whatsapp:             Optional[str] = Form(None),
    linkedin:             Optional[str] = Form(None),
    instagram:            Optional[str] = Form(None),
    sitio_web:            Optional[str] = Form(None),
    # Sección 5
    referencia_1_nombre:   Optional[str] = Form(None),
    referencia_1_telefono: Optional[str] = Form(None),
    referencia_1_tipo:     Optional[str] = Form(None),
    referencia_2_nombre:   Optional[str] = Form(None),
    referencia_2_telefono: Optional[str] = Form(None),
    referencia_2_tipo:     Optional[str] = Form(None),
    referencia_3_nombre:   Optional[str] = Form(None),
    referencia_3_telefono: Optional[str] = Form(None),
    referencia_3_tipo:     Optional[str] = Form(None),
    # Sección 6
    acepta_terminos:      bool = Form(...),
    acepta_politica:      bool = Form(...),
    acepta_suspension:    bool = Form(...),
    # Files
    cedula_foto_frente:   Optional[UploadFile] = File(None),
    cedula_foto_reverso:  Optional[UploadFile] = File(None),
    foto_perfil:          Optional[UploadFile] = File(None),
    rut_documento:        Optional[UploadFile] = File(None),
    tarjeta_profesional:  Optional[UploadFile] = File(None),
    # Optional auth
    current_user: Optional[dict] = Depends(get_optional_user),
):
    if not acepta_terminos or not acepta_politica or not acepta_suspension:
        raise HTTPException(400, "Debes aceptar todos los términos")

    pool = get_pool()

    # Check duplicate cédula
    exists = await pool.fetchval(
        "SELECT id FROM agentes WHERE cedula_numero = $1", cedula_numero
    )
    if exists:
        raise HTTPException(409, "Ya existe una solicitud con ese número de cédula")

    # Upload files
    async def _maybe_upload(f: Optional[UploadFile]) -> Optional[str]:
        if f is None or not f.filename:
            return None
        data = await f.read()
        return await upload_file(data, f.filename, folder="agentes")

    cedula_frente_url  = await _maybe_upload(cedula_foto_frente)
    cedula_reverso_url = await _maybe_upload(cedula_foto_reverso)
    foto_perfil_url    = await _maybe_upload(foto_perfil)
    rut_url            = await _maybe_upload(rut_documento)
    tarjeta_url        = await _maybe_upload(tarjeta_profesional)

    # Parse JSON arrays
    import json

    def _parse_arr(s: Optional[str]) -> Optional[list]:
        if not s:
            return None
        try:
            return json.loads(s)
        except Exception:
            return [x.strip() for x in s.split(",") if x.strip()]

    especialidad_arr = _parse_arr(especialidad)
    tipo_inmueble_arr = _parse_arr(tipo_inmueble)
    zonas_arr = _parse_arr(zonas_opera)

    fecha_nac = None
    if fecha_nacimiento:
        try:
            from datetime import date
            fecha_nac = date.fromisoformat(fecha_nacimiento)
        except ValueError:
            pass

    usuario_id = current_user["id"] if current_user else None

    row = await pool.fetchrow(
        """
        INSERT INTO agentes (
            usuario_id,
            nombre_completo, cedula_numero, cedula_foto_frente, cedula_foto_reverso,
            foto_perfil, fecha_nacimiento,
            rut_documento, tarjeta_profesional,
            inmobiliaria_nombre, inmobiliaria_nit, es_independiente,
            anos_experiencia, transacciones_cerradas, especialidad,
            tipo_inmueble, precio_rango_min, precio_rango_max, zonas_opera,
            telefono, email, whatsapp, linkedin, instagram, sitio_web,
            referencia_1_nombre, referencia_1_telefono, referencia_1_tipo,
            referencia_2_nombre, referencia_2_telefono, referencia_2_tipo,
            referencia_3_nombre, referencia_3_telefono, referencia_3_tipo,
            acepta_terminos, acepta_politica, acepta_suspension, firma_timestamp,
            estado
        ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
            $20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,
            $37,$38,$39
        )
        RETURNING id
        """,
        usuario_id,
        nombre_completo, cedula_numero, cedula_frente_url, cedula_reverso_url,
        foto_perfil_url, fecha_nac,
        rut_url, tarjeta_url,
        inmobiliaria_nombre, inmobiliaria_nit, es_independiente,
        anos_experiencia, transacciones_cerradas, especialidad_arr,
        tipo_inmueble_arr, precio_rango_min, precio_rango_max, zonas_arr,
        telefono, email, whatsapp, linkedin, instagram, sitio_web,
        referencia_1_nombre, referencia_1_telefono, referencia_1_tipo,
        referencia_2_nombre, referencia_2_telefono, referencia_2_tipo,
        referencia_3_nombre, referencia_3_telefono, referencia_3_tipo,
        acepta_terminos, acepta_politica, acepta_suspension, datetime.now(timezone.utc),
        "pendiente",
    )

    admin_url = f"{_APP_URL}/admin/agentes"
    try:
        await notify_admin_new_agente(nombre_completo, cedula_numero, email, telefono, admin_url)
    except Exception as e:
        # Non-fatal: log but don't fail the request
        print(f"[EMAIL ERROR] notify_admin_new_agente: {e}")

    return {
        "id": row["id"],
        "mensaje": "Solicitud enviada. Revisaremos tu información en las próximas 24-48 horas.",
    }


# ── GET /admin ─────────────────────────────────────────────────────────────────

@router.get("/admin")
async def listar_agentes(
    estado: Optional[str] = Query(None, description="pendiente|aprobado|rechazado"),
    offset: int = Query(0, ge=0),
    limit:  int = Query(50, ge=1, le=200),
    admin: dict = Depends(require_admin),
):
    pool = get_pool()
    where = "WHERE 1=1"
    args: list = []
    i = 1
    if estado:
        where += f" AND estado = ${i}"
        args.append(estado)
        i += 1
    args += [limit, offset]
    rows = await pool.fetch(
        f"""
        SELECT id, nombre_completo, cedula_numero, email, telefono,
               foto_perfil, estado, motivo_rechazo,
               fecha_registro, fecha_aprobacion, aprobado_por,
               especialidad, anos_experiencia
        FROM agentes
        {where}
        ORDER BY fecha_registro DESC
        LIMIT ${i} OFFSET ${i+1}
        """,
        *args,
    )
    total = await pool.fetchval(
        f"SELECT COUNT(*) FROM agentes {where}", *args[:-2]
    )
    return {
        "total": total,
        "items": [dict(r) for r in rows],
    }


# ── GET /admin/detalle/{id} ────────────────────────────────────────────────────

@router.get("/admin/{agente_id}")
async def detalle_agente(agente_id: int, admin: dict = Depends(require_admin)):
    pool = get_pool()
    row = await pool.fetchrow("SELECT * FROM agentes WHERE id = $1", agente_id)
    if not row:
        raise HTTPException(404, "Agente no encontrado")
    return dict(row)


# ── PATCH /{id}/aprobar ────────────────────────────────────────────────────────

@router.patch("/{agente_id}/aprobar")
async def aprobar_agente(agente_id: int, admin: dict = Depends(require_admin)):
    pool = get_pool()
    row = await pool.fetchrow(
        """
        UPDATE agentes
        SET estado = 'aprobado',
            fecha_aprobacion = NOW(),
            aprobado_por = $2
        WHERE id = $1
        RETURNING id, nombre_completo, email
        """,
        agente_id,
        admin["email"],
    )
    if not row:
        raise HTTPException(404, "Agente no encontrado")

    dashboard_url = f"{_APP_URL}/real-estate"
    try:
        await notify_agente_aprobado(row["email"], row["nombre_completo"], dashboard_url)
    except Exception as e:
        print(f"[EMAIL ERROR] notify_agente_aprobado: {e}")

    return {"ok": True, "mensaje": f"Agente {row['nombre_completo']} aprobado"}


# ── PATCH /{id}/rechazar ───────────────────────────────────────────────────────

class RechazarBody(BaseModel):
    motivo: str


@router.patch("/{agente_id}/rechazar")
async def rechazar_agente(
    agente_id: int,
    body: RechazarBody,
    admin: dict = Depends(require_admin),
):
    pool = get_pool()
    row = await pool.fetchrow(
        """
        UPDATE agentes
        SET estado = 'rechazado',
            motivo_rechazo = $2
        WHERE id = $1
        RETURNING id, nombre_completo, email
        """,
        agente_id,
        body.motivo,
    )
    if not row:
        raise HTTPException(404, "Agente no encontrado")

    formulario_url = f"{_APP_URL}/agentes/registro"
    try:
        await notify_agente_rechazado(
            row["email"], row["nombre_completo"], body.motivo, formulario_url
        )
    except Exception as e:
        print(f"[EMAIL ERROR] notify_agente_rechazado: {e}")

    return {"ok": True, "mensaje": "Solicitud rechazada"}


# ── GET /{id}/perfil (público) ─────────────────────────────────────────────────

@router.get("/{agente_id}/perfil")
async def perfil_agente(agente_id: int):
    pool = get_pool()
    row = await pool.fetchrow(
        """
        SELECT id, nombre_completo, foto_perfil, especialidad, tipo_inmueble,
               anos_experiencia, transacciones_cerradas, zonas_opera,
               telefono, whatsapp, linkedin, instagram, sitio_web,
               inmobiliaria_nombre, es_independiente,
               precio_rango_min, precio_rango_max
        FROM agentes
        WHERE id = $1 AND estado = 'aprobado'
        """,
        agente_id,
    )
    if not row:
        raise HTTPException(404, "Agente no encontrado o pendiente de aprobación")
    return dict(row)


# ── GET /aprobados (listado público) ──────────────────────────────────────────

@router.get("/aprobados/lista")
async def agentes_aprobados(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    pool = get_pool()
    rows = await pool.fetch(
        """
        SELECT id, nombre_completo, foto_perfil, especialidad,
               tipo_inmueble, zonas_opera, sitio_web,
               anos_experiencia, transacciones_cerradas,
               inmobiliaria_nombre, es_independiente,
               linkedin, instagram, whatsapp
        FROM agentes
        WHERE estado = 'aprobado'
        ORDER BY fecha_aprobacion DESC
        LIMIT $1 OFFSET $2
        """,
        limit, offset,
    )
    return [dict(r) for r in rows]


# ── GET /aprobados (con filtros + zonas nombres) ───────────────────────────────

def _to_slug(name: str) -> str:
    import re, unicodedata
    nfkd = unicodedata.normalize("NFKD", name)
    ascii_str = nfkd.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", ascii_str.lower()).strip("-")


@router.get("/aprobados")
async def agentes_aprobados_filtrado(
    especialidad: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    pool = get_pool()
    where_clauses = ["a.estado = 'aprobado'"]
    args: list = []
    i = 1

    if especialidad and especialidad.lower() not in ("todos", "all"):
        where_clauses.append(f"${i} = ANY(a.especialidad)")
        args.append(especialidad.capitalize())
        i += 1

    args += [limit, offset]
    where_sql = " AND ".join(where_clauses)

    rows = await pool.fetch(
        f"""
        SELECT
            a.id, a.nombre_completo, a.foto_perfil, a.especialidad,
            a.tipo_inmueble, a.zonas_opera,
            a.anos_experiencia, a.transacciones_cerradas,
            a.inmobiliaria_nombre, a.es_independiente,
            a.linkedin, a.instagram, a.whatsapp, a.sitio_web,
            a.precio_rango_min, a.precio_rango_max,
            COALESCE(
                ARRAY_AGG(DISTINCT b.nombre) FILTER (WHERE b.nombre IS NOT NULL),
                ARRAY[]::text[]
            ) AS zonas_nombres
        FROM agentes a
        LEFT JOIN raw.barrios b ON b.id = ANY(a.zonas_opera)
        WHERE {where_sql}
        GROUP BY a.id
        ORDER BY a.fecha_aprobacion DESC
        LIMIT ${i} OFFSET ${i + 1}
        """,
        *args,
    )

    result = []
    for r in rows:
        d = dict(r)
        d["slug"] = _to_slug(d.get("nombre_completo") or "")
        result.append(d)
    return result


# ── GET /por-slug/{slug} ───────────────────────────────────────────────────────

@router.get("/por-slug/{slug}")
async def agente_por_slug(slug: str):
    pool = get_pool()
    rows = await pool.fetch(
        """
        SELECT
            a.id, a.nombre_completo, a.foto_perfil, a.especialidad,
            a.tipo_inmueble, a.zonas_opera,
            a.anos_experiencia, a.transacciones_cerradas,
            a.inmobiliaria_nombre, a.es_independiente,
            a.precio_rango_min, a.precio_rango_max,
            a.telefono, a.whatsapp, a.linkedin, a.instagram, a.sitio_web, a.email,
            COALESCE(
                ARRAY_AGG(DISTINCT b.nombre) FILTER (WHERE b.nombre IS NOT NULL),
                ARRAY[]::text[]
            ) AS zonas_nombres
        FROM agentes a
        LEFT JOIN raw.barrios b ON b.id = ANY(a.zonas_opera)
        WHERE a.estado = 'aprobado'
        GROUP BY a.id
        """
    )

    for row in rows:
        if _to_slug(row["nombre_completo"]) == slug:
            d = dict(row)
            d["slug"] = slug
            count = await pool.fetchval(
                "SELECT COUNT(*) FROM listings_propios WHERE agente_id = $1 AND estado = 'activo'",
                d["id"],
            )
            d["listings_count"] = count or 0
            return d

    raise HTTPException(404, "Agente no encontrado")


# ── GET /{id}/perfil-publico ───────────────────────────────────────────────────

@router.get("/{agente_id}/perfil-publico")
async def perfil_publico_agente(agente_id: int):
    pool = get_pool()
    row = await pool.fetchrow(
        """
        SELECT
            a.id, a.nombre_completo, a.foto_perfil, a.especialidad,
            a.tipo_inmueble, a.zonas_opera,
            a.anos_experiencia, a.transacciones_cerradas,
            a.inmobiliaria_nombre, a.es_independiente,
            a.precio_rango_min, a.precio_rango_max,
            a.telefono, a.whatsapp, a.linkedin, a.instagram, a.sitio_web, a.email,
            COALESCE(
                ARRAY_AGG(DISTINCT b.nombre) FILTER (WHERE b.nombre IS NOT NULL),
                ARRAY[]::text[]
            ) AS zonas_nombres
        FROM agentes a
        LEFT JOIN raw.barrios b ON b.id = ANY(a.zonas_opera)
        WHERE a.id = $1 AND a.estado = 'aprobado'
        GROUP BY a.id
        """,
        agente_id,
    )
    if not row:
        raise HTTPException(404, "Agente no encontrado")

    d = dict(row)
    d["slug"] = _to_slug(d.get("nombre_completo") or "")
    count = await pool.fetchval(
        "SELECT COUNT(*) FROM listings_propios WHERE agente_id = $1 AND estado = 'activo'",
        agente_id,
    )
    d["listings_count"] = count or 0
    return d


# ── POST /{id}/contacto ────────────────────────────────────────────────────────

class ContactoBody(BaseModel):
    nombre: str
    email: str
    mensaje: str


@router.post("/{agente_id}/contacto", status_code=201)
async def contactar_agente(agente_id: int, body: ContactoBody):
    pool = get_pool()

    agente = await pool.fetchrow(
        "SELECT id, nombre_completo, email FROM agentes WHERE id = $1 AND estado = 'aprobado'",
        agente_id,
    )
    if not agente:
        raise HTTPException(404, "Agente no encontrado")

    await pool.execute(
        """
        INSERT INTO contactos_agente (agente_id, nombre, email, mensaje)
        VALUES ($1, $2, $3, $4)
        """,
        agente_id, body.nombre, body.email, body.mensaje,
    )

    try:
        from api.utils.email import _wrap, send_email
        html = _wrap(f"""
        <h2 style="color:#1A1208">Nuevo mensaje a través de Medellín Social</h2>
        <p><strong>De:</strong> {body.nombre} ({body.email})</p>
        <p><strong>Mensaje:</strong></p>
        <p style="background:#F5F0E8;padding:16px;border-radius:8px">{body.mensaje}</p>
        """)
        await send_email(
            agente["email"],
            f"Nuevo mensaje de {body.nombre} — Medellín Social",
            html,
        )
    except Exception as e:
        print(f"[EMAIL ERROR] contactar_agente: {e}")

    return {"ok": True, "mensaje": "Mensaje enviado correctamente"}
