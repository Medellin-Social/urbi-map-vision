"""Listings propios — publicación directa por agentes verificados y propietarios."""
from __future__ import annotations

import json
import os
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile

from api.db import get_pool
from api.dependencies import get_current_user
from api.utils.email import ADMIN_EMAIL, _wrap, send_email
from api.utils.storage import upload_file

router = APIRouter()

_APP_URL = os.getenv("APP_URL", "https://medellin.social")
_COP_TO_USD = 4200.0


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _get_agente_id(pool, user_id: int) -> Optional[int]:
    row = await pool.fetchrow(
        "SELECT id FROM agentes WHERE usuario_id = $1 AND verificado = true AND activo = true",
        user_id,
    )
    return row["id"] if row else None


# ── GET /barrios-form ──────────────────────────────────────────────────────────

@router.get("/barrios-form")
async def barrios_form():
    """Return lightweight barrios list for cascading dropdowns in the publish form."""
    pool = get_pool()
    rows = await pool.fetch(
        """
        SELECT
            id,
            nombre,
            municipio,
            COALESCE(NULLIF(TRIM(comuna), ''), municipio) AS comuna
        FROM raw.barrios
        WHERE nombre IS NOT NULL
          AND municipio IS NOT NULL
          AND excluir_inversion IS NOT TRUE
        ORDER BY municipio, COALESCE(NULLIF(TRIM(comuna), ''), municipio), nombre
        """
    )
    return [dict(r) for r in rows]


# ── GET /me ────────────────────────────────────────────────────────────────────

@router.get("/me")
async def my_tipo(current_user: dict = Depends(get_current_user)):
    """Return whether the current user is a verified agente."""
    pool = get_pool()
    agente_id = await _get_agente_id(pool, current_user["id"])
    return {
        "es_agente": agente_id is not None,
        "agente_id": agente_id,
        "nombre": f"{current_user.get('nombre', '')} {current_user.get('apellido', '')}".strip(),
        "email": current_user.get("email", ""),
    }


# ── POST / ─────────────────────────────────────────────────────────────────────

@router.post("/", status_code=201)
async def crear_listing(
    # Paso 1
    tipo_operacion:    str            = Form(...),
    tipo_inmueble:     str            = Form(...),
    precio_cop:        float          = Form(...),
    administracion_cop: Optional[float] = Form(None),
    # Paso 2
    area_m2:           Optional[float] = Form(None),
    area_lote_m2:      Optional[float] = Form(None),
    habitaciones:      Optional[int]   = Form(None),
    banos:             Optional[float] = Form(None),
    parqueaderos:      Optional[int]   = Form(None),
    estrato:           Optional[int]   = Form(None),
    piso:              Optional[int]   = Form(None),
    antiguedad:        Optional[str]   = Form(None),
    amoblado:          Optional[bool]  = Form(None),
    amenidades:        Optional[str]   = Form(None),   # JSON array string
    mascotas:          Optional[str]   = Form("consultar"),
    permite_airbnb:    Optional[str]   = Form("no_se"),
    # Paso 3
    barrio_id:         Optional[int]   = Form(None),
    direccion:         Optional[str]   = Form(None),
    lat:               Optional[float] = Form(None),
    lon:               Optional[float] = Form(None),
    descripcion:       Optional[str]   = Form(None),
    # Paso 4
    nombre_contacto:   Optional[str]   = Form(None),
    telefono:          Optional[str]   = Form(None),
    email_contacto:    Optional[str]   = Form(None),
    horario_contacto:  Optional[str]   = Form(None),
    acepta_terminos:   bool            = Form(...),
    acepta_propietario: bool           = Form(...),
    acepta_comision:   Optional[bool]  = Form(None),
    # Files
    fotos: Optional[List[UploadFile]]  = File(None),
    current_user: dict = Depends(get_current_user),
):
    if not acepta_terminos or not acepta_propietario:
        raise HTTPException(400, "Debes aceptar los términos y confirmar propiedad")

    pool = get_pool()
    user_id = current_user["id"]
    agente_id = await _get_agente_id(pool, user_id)
    es_agente = agente_id is not None
    estado = "activo" if es_agente else "pendiente"
    destacado = es_agente
    precio_usd = int(precio_cop / _COP_TO_USD) if precio_cop else None

    foto_urls: list[str] = []
    if fotos:
        for f in fotos:
            if f.filename and f.size and f.size > 0:
                url = await upload_file(f, folder="listings_propios")
                foto_urls.append(url)

    amenidades_arr = []
    if amenidades:
        try:
            amenidades_arr = json.loads(amenidades)
        except Exception:
            pass

    row = await pool.fetchrow(
        """
        INSERT INTO public.listings_propios (
            user_id, agente_id, ciudad_id, barrio_id,
            tipo_operacion, tipo_inmueble,
            precio_cop, precio_usd, administracion_cop,
            area_m2, area_lote_m2,
            habitaciones, banos, parqueaderos, estrato, piso,
            antiguedad, amoblado, amenidades, fotos, descripcion,
            lat, lon, direccion,
            nombre_contacto, telefono, email_contacto, horario_contacto,
            mascotas, permite_airbnb,
            fuente, estado, destacado, fecha_publicacion
        ) VALUES (
            $1,  $2,  1,   $3,
            $4,  $5,
            $6,  $7,  $8,
            $9,  $10,
            $11, $12, $13, $14, $15,
            $16, $17, $18, $19, $20,
            $21, $22, $23,
            $24, $25, $26, $27,
            $28, $29,
            'propio', $30, $31, NOW()
        )
        RETURNING id, estado
        """,
        user_id, agente_id, barrio_id,
        tipo_operacion, tipo_inmueble,
        precio_cop, precio_usd, administracion_cop,
        area_m2, area_lote_m2,
        habitaciones, banos, parqueaderos, estrato, piso,
        antiguedad, amoblado, amenidades_arr, foto_urls, descripcion,
        lat, lon, direccion,
        nombre_contacto, telefono, email_contacto, horario_contacto,
        mascotas, permite_airbnb,
        estado, destacado,
    )

    listing_id = row["id"]

    if not es_agente:
        await _notify_admin_new_listing(
            listing_id=listing_id,
            tipo_inmueble=tipo_inmueble,
            tipo_operacion=tipo_operacion,
            precio_cop=precio_cop,
            nombre_contacto=nombre_contacto,
            email_contacto=email_contacto,
        )

    return {
        "id": listing_id,
        "estado": row["estado"],
        "es_agente": es_agente,
        "mensaje": (
            "Tu propiedad está activa en el MLS."
            if es_agente
            else "Tu propiedad está en revisión. Te notificaremos en 24h."
        ),
    }


# ── GET /mis-listings ──────────────────────────────────────────────────────────

@router.get("/mis-listings")
async def mis_listings(current_user: dict = Depends(get_current_user)):
    pool = get_pool()
    rows = await pool.fetch(
        """
        SELECT id, tipo_operacion, tipo_inmueble, precio_cop, area_m2,
               habitaciones, estado, destacado, created_at,
               fotos, barrio_id, lat, lon, descripcion, direccion
        FROM public.listings_propios
        WHERE user_id = $1
        ORDER BY created_at DESC
        """,
        current_user["id"],
    )
    return [dict(r) for r in rows]


# ── PATCH /{listing_id} ────────────────────────────────────────────────────────

@router.patch("/{listing_id}")
async def actualizar_listing(
    listing_id: int,
    precio_cop:   Optional[float] = Form(None),
    descripcion:  Optional[str]   = Form(None),
    estado:       Optional[str]   = Form(None),
    current_user: dict = Depends(get_current_user),
):
    pool = get_pool()
    row = await pool.fetchrow(
        "SELECT user_id FROM public.listings_propios WHERE id = $1", listing_id
    )
    if not row:
        raise HTTPException(404, "Listing no encontrado")
    if row["user_id"] != current_user["id"]:
        raise HTTPException(403, "No autorizado")

    updates: list[str] = []
    params: list = []
    idx = 1

    if precio_cop is not None:
        updates.append(f"precio_cop = ${idx}"); params.append(precio_cop); idx += 1
    if descripcion is not None:
        updates.append(f"descripcion = ${idx}"); params.append(descripcion); idx += 1
    if estado is not None and estado in ("activo", "pausado"):
        updates.append(f"estado = ${idx}"); params.append(estado); idx += 1

    if not updates:
        raise HTTPException(400, "Nada que actualizar")

    updates.append("updated_at = NOW()")
    params.append(listing_id)
    await pool.execute(
        f"UPDATE public.listings_propios SET {', '.join(updates)} WHERE id = ${idx}",
        *params,
    )
    return {"ok": True}


# ── DELETE /{listing_id} ───────────────────────────────────────────────────────

@router.delete("/{listing_id}", status_code=204)
async def desactivar_listing(
    listing_id: int,
    current_user: dict = Depends(get_current_user),
):
    pool = get_pool()
    row = await pool.fetchrow(
        "SELECT user_id FROM public.listings_propios WHERE id = $1", listing_id
    )
    if not row:
        raise HTTPException(404, "Listing no encontrado")
    if row["user_id"] != current_user["id"]:
        raise HTTPException(403, "No autorizado")

    await pool.execute(
        "UPDATE public.listings_propios SET estado = 'inactivo', updated_at = NOW() WHERE id = $1",
        listing_id,
    )


# ── Email ──────────────────────────────────────────────────────────────────────

async def _notify_admin_new_listing(
    listing_id: int,
    tipo_inmueble: str,
    tipo_operacion: str,
    precio_cop: float,
    nombre_contacto: Optional[str],
    email_contacto: Optional[str],
) -> None:
    precio_fmt = f"${precio_cop:,.0f} COP"
    html = _wrap(f"""
      <h3 style="color:#1D9E75">Nueva propiedad pendiente de revisión</h3>
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:6px;color:#62736d;width:140px">ID</td><td style="padding:6px;font-weight:600">#{listing_id}</td></tr>
        <tr><td style="padding:6px;color:#62736d">Tipo</td><td style="padding:6px">{tipo_inmueble} · {tipo_operacion}</td></tr>
        <tr><td style="padding:6px;color:#62736d">Precio</td><td style="padding:6px">{precio_fmt}</td></tr>
        <tr><td style="padding:6px;color:#62736d">Contacto</td><td style="padding:6px">{nombre_contacto or '—'}</td></tr>
        <tr><td style="padding:6px;color:#62736d">Email</td><td style="padding:6px">{email_contacto or '—'}</td></tr>
      </table>
      <p style="margin-top:16px;font-size:13px;color:#62736d">
        Este listing está en estado <strong>pendiente</strong> hasta que lo apruebes.
      </p>
    """)
    await send_email(
        ADMIN_EMAIL,
        f"Nueva propiedad pendiente de revisión — #{listing_id}",
        html,
    )


# ── GET /agente/{agente_id} (public listings by agent) ────────────────────────

@router.get("/agente/{agente_id}")
async def listings_por_agente(
    agente_id: int,
    limit: int = Query(6, ge=1, le=20),
    offset: int = Query(0, ge=0),
):
    pool = get_pool()
    rows = await pool.fetch(
        """
        SELECT lp.id, lp.tipo_operacion, lp.tipo_inmueble,
               lp.precio_cop, lp.precio_usd,
               lp.area_m2, lp.habitaciones, lp.banos,
               lp.descripcion, lp.fotos, lp.direccion,
               lp.estado, lp.destacado, lp.fecha_publicacion,
               b.nombre AS barrio_nombre, b.municipio
        FROM listings_propios lp
        LEFT JOIN raw.barrios b ON b.id = lp.barrio_id
        WHERE lp.agente_id = $1 AND lp.estado = 'activo'
        ORDER BY lp.destacado DESC, lp.fecha_publicacion DESC
        LIMIT $2 OFFSET $3
        """,
        agente_id, limit, offset,
    )
    total = await pool.fetchval(
        "SELECT COUNT(*) FROM listings_propios WHERE agente_id = $1 AND estado = 'activo'",
        agente_id,
    )
    return {"total": total or 0, "items": [dict(r) for r in rows]}


# ── GET /agentes-para-contactar ────────────────────────────────────────────────

@router.get("/agentes-para-contactar")
async def agentes_para_contactar():
    """Public list of verified active agents."""
    pool = get_pool()
    rows = await pool.fetch(
        """
        SELECT id, nombre, apellido, foto_url, whatsapp, bio,
               barrios_especializados, email, telefono
        FROM public.agentes
        WHERE verificado = true AND activo = true
        ORDER BY nombre, apellido
        """
    )
    return [dict(r) for r in rows]


# ── POST /solicitudes ──────────────────────────────────────────────────────────

@router.post("/solicitudes", status_code=201)
async def crear_solicitud(
    listing_id: int             = Form(...),
    agente_id:  int             = Form(...),
    mensaje:    Optional[str]   = Form(None),
    current_user: dict = Depends(get_current_user),
):
    pool = get_pool()
    listing = await pool.fetchrow(
        """SELECT id, tipo_inmueble, tipo_operacion, precio_cop
           FROM public.listings_propios
           WHERE id = $1 AND user_id = $2""",
        listing_id, current_user["id"],
    )
    if not listing:
        raise HTTPException(404, "Listing no encontrado o no es tuyo")

    agente = await pool.fetchrow(
        """SELECT id, nombre, apellido, email, whatsapp
           FROM public.agentes WHERE id = $1 AND verificado = true AND activo = true""",
        agente_id,
    )
    if not agente:
        raise HTTPException(404, "Agente no encontrado")

    try:
        sol = await pool.fetchrow(
            """INSERT INTO public.agente_solicitudes (listing_id, agente_id, user_id, mensaje)
               VALUES ($1, $2, $3, $4) RETURNING id""",
            listing_id, agente_id, current_user["id"], mensaje,
        )
    except Exception:
        raise HTTPException(409, "Ya enviaste una solicitud a este agente para esta propiedad")

    await _notify_agente_nueva_solicitud(sol["id"], dict(agente), dict(listing), current_user)
    return {"id": sol["id"], "ok": True}


# ── GET /solicitudes/pendientes ────────────────────────────────────────────────

@router.get("/solicitudes/pendientes")
async def solicitudes_pendientes(current_user: dict = Depends(get_current_user)):
    """Verified agent sees their pending solicitudes."""
    pool = get_pool()
    agente_id = await _get_agente_id(pool, current_user["id"])
    if not agente_id:
        raise HTTPException(403, "Solo agentes verificados pueden ver solicitudes")

    rows = await pool.fetch(
        """
        SELECT
            s.id, s.estado, s.mensaje, s.created_at,
            l.id AS listing_id, l.tipo_operacion, l.tipo_inmueble,
            l.precio_cop, l.area_m2, l.habitaciones, l.barrio_id, l.direccion, l.fotos,
            u.nombre AS propietario_nombre, u.apellido AS propietario_apellido,
            u.email AS propietario_email
        FROM public.agente_solicitudes s
        JOIN public.listings_propios l ON l.id = s.listing_id
        JOIN public.usuarios u ON u.id = s.user_id
        WHERE s.agente_id = $1
        ORDER BY s.created_at DESC
        """,
        agente_id,
    )
    return [dict(r) for r in rows]


# ── PATCH /solicitudes/{sol_id} ────────────────────────────────────────────────

@router.patch("/solicitudes/{sol_id}")
async def actualizar_solicitud(
    sol_id: int,
    accion: str = Form(...),   # 'aceptar' | 'rechazar'
    current_user: dict = Depends(get_current_user),
):
    pool = get_pool()
    agente_id = await _get_agente_id(pool, current_user["id"])
    if not agente_id:
        raise HTTPException(403, "Solo agentes verificados")

    sol = await pool.fetchrow(
        """
        SELECT s.id, s.listing_id, s.user_id, s.estado,
               u.email AS propietario_email, u.nombre AS propietario_nombre
        FROM public.agente_solicitudes s
        JOIN public.usuarios u ON u.id = s.user_id
        WHERE s.id = $1 AND s.agente_id = $2
        """,
        sol_id, agente_id,
    )
    if not sol:
        raise HTTPException(404, "Solicitud no encontrada")
    if sol["estado"] != "pendiente":
        raise HTTPException(400, "Solicitud ya procesada")

    if accion == "aceptar":
        nuevo_estado = "aceptada"
        await pool.execute(
            """UPDATE public.listings_propios
               SET agente_id = $1, estado = 'activo', destacado = true, updated_at = NOW()
               WHERE id = $2""",
            agente_id, sol["listing_id"],
        )
        await pool.execute(
            """UPDATE public.agente_solicitudes
               SET estado = 'rechazada', updated_at = NOW()
               WHERE listing_id = $1 AND id != $2 AND estado = 'pendiente'""",
            sol["listing_id"], sol_id,
        )
    elif accion == "rechazar":
        nuevo_estado = "rechazada"
    else:
        raise HTTPException(400, "Accion debe ser 'aceptar' o 'rechazar'")

    await pool.execute(
        "UPDATE public.agente_solicitudes SET estado = $1, updated_at = NOW() WHERE id = $2",
        nuevo_estado, sol_id,
    )

    agente_info = await pool.fetchrow(
        "SELECT nombre, apellido FROM public.agentes WHERE id = $1", agente_id
    )
    await _notify_propietario_respuesta(
        accion=accion,
        propietario_email=sol["propietario_email"],
        propietario_nombre=sol["propietario_nombre"],
        agente_nombre=f"{agente_info['nombre']} {agente_info['apellido']}",
        listing_id=sol["listing_id"],
    )
    return {"ok": True, "estado": nuevo_estado}


# ── Solicitud email helpers ─────────────────────────────────────────────────────

async def _notify_agente_nueva_solicitud(
    sol_id: int,
    agente: dict,
    listing: dict,
    propietario: dict,
) -> None:
    agente_email = agente.get("email") or ""
    if not agente_email:
        return
    precio_fmt = f"${listing['precio_cop']:,.0f} COP"
    html = _wrap(f"""
      <h3 style="color:#1D9E75">Nueva solicitud de gestión — #{sol_id}</h3>
      <p style="font-size:14px;color:#1A1208">
        Hola <strong>{agente.get('nombre','')}</strong>, un propietario quiere que gestiones su propiedad.
      </p>
      <table style="width:100%;border-collapse:collapse;margin:12px 0">
        <tr><td style="padding:6px;color:#62736d;width:150px">Tipo</td><td style="padding:6px">{listing['tipo_inmueble']} · {listing['tipo_operacion']}</td></tr>
        <tr><td style="padding:6px;color:#62736d">Precio</td><td style="padding:6px">{precio_fmt}</td></tr>
        <tr><td style="padding:6px;color:#62736d">Propietario</td><td style="padding:6px">{propietario.get('nombre','')} {propietario.get('apellido','')}</td></tr>
        <tr><td style="padding:6px;color:#62736d">Email contacto</td><td style="padding:6px">{propietario.get('email','—')}</td></tr>
      </table>
      <a href="{_APP_URL}/solicitudes"
         style="display:inline-block;background:#1D9E75;color:#fff;padding:10px 20px;border-radius:6px;font-weight:700;text-decoration:none;font-size:13px">
        Ver solicitudes →
      </a>
    """)
    await send_email(agente_email, f"Nueva solicitud de gestión — #{sol_id}", html)


async def _notify_propietario_respuesta(
    accion: str,
    propietario_email: str,
    propietario_nombre: str,
    agente_nombre: str,
    listing_id: int,
) -> None:
    if not propietario_email:
        return
    if accion == "aceptar":
        titulo = "¡Tu propiedad ya está activa!"
        detalle = f"""
          <p style="font-size:14px;color:#1A1208;margin-bottom:12px">
            El agente <strong>{agente_nombre}</strong> aceptó gestionar tu propiedad.
            Tu listing está ahora <strong>activo</strong> en el MLS de Medellín Social.
          </p>
          <a href="{_APP_URL}/mis-listings"
             style="display:inline-block;background:#1D9E75;color:#fff;padding:10px 20px;border-radius:6px;font-weight:700;text-decoration:none;font-size:13px">
            Ver mi propiedad →
          </a>
        """
    else:
        titulo = "Actualización sobre tu solicitud"
        detalle = f"""
          <p style="font-size:14px;color:#1A1208">
            El agente <strong>{agente_nombre}</strong> no pudo aceptar tu solicitud en este momento.
            Puedes conectar con otro agente desde tu panel.
          </p>
          <a href="{_APP_URL}/conectar-agente?listing_id={listing_id}"
             style="display:inline-block;background:#1D9E75;color:#fff;padding:10px 20px;border-radius:6px;font-weight:700;text-decoration:none;font-size:13px">
            Ver otros agentes →
          </a>
        """
    html = _wrap(f"""
      <h3 style="color:#1D9E75">{titulo}</h3>
      <p style="font-size:14px;color:#1A1208;margin-bottom:8px">Hola <strong>{propietario_nombre}</strong>,</p>
      {detalle}
    """)
    await send_email(propietario_email, titulo, html)
