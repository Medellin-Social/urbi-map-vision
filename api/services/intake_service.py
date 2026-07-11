"""Domain logic for owner intake (captación de inmuebles).

crear_intake  → valida cuestionario, resuelve zona desde geom, arma intake 'nuevo'.
aceptar_intake → crea listing en 'borrador' con la agency/agent asignados y enlaza.
                 NO publica: eso es decisión del realtor en su dashboard.
"""
from __future__ import annotations

import uuid
from typing import Any, Dict, List

from api.schemas.intake_cuestionario import (
    DECLARACIONES_KEYS, Pregunta, cuestionario_para,
)
from api.services.zona_service import resolver_zona


class IntakeError(ValueError):
    """Validation or domain error in intake flow."""


def _aplica(preg: Pregunta, payload: Dict[str, Any]) -> bool:
    """True si el item aplica dado el payload (evalúa condicional_si)."""
    cond = preg.get("condicional_si")
    if not cond:
        return True
    # Aplica solo si el payload cumple TODAS las igualdades declaradas.
    return all(payload.get(k) == v for k, v in cond.items())


def _validar_payload(payload: Dict[str, Any], cuestionario: List[Pregunta]) -> None:
    """Valida el payload contra el cuestionario.

    Un campo obligatorio debe estar presente (no None). Un campo condicional
    solo se exige cuando su condición se cumple; si no aplica, se omite aunque
    sea obligatorio. Lanza IntakeError en la primera falla.
    """
    for preg in cuestionario:
        if not _aplica(preg, payload):
            continue
        if preg.get("obligatoria") and payload.get(preg["id"]) is None:
            raise IntakeError(f"Campo obligatorio faltante: {preg['id']}")


async def crear_intake(
    owner_id: str,
    geom: str,        # WKT Point, SRID 4326 — p.ej. 'POINT(-75.56 6.24)'
    operacion: str,   # 'venta' | 'arriendo'
    tipo_inmueble: str,
    payload: Dict[str, Any],
    pool: Any,
) -> Dict[str, Any]:
    """Valida, resuelve zona y arma un intake en estado 'nuevo'.

    payload lleva el resto de respuestas del cuestionario (características +
    declaraciones legales). operacion/tipo_inmueble/geom se pasan aparte y se
    inyectan a la validación para satisfacer las obligatorias del cuestionario.
    Devuelve un dict listo para INSERT (el router persiste).
    """
    cuestionario = cuestionario_para(operacion)

    # Inyecta las obligatorias que llegan como args separados.
    validado = {**payload, "operacion": operacion, "tipo_inmueble": tipo_inmueble, "geom": geom}
    _validar_payload(validado, cuestionario)

    # Zona estable desde la geometría (misma lógica que usará el asignador).
    zona = await resolver_zona(geom, pool)
    barrio_id = zona["barrio_id"]

    # Denormaliza nombre de barrio/municipio para display (no autoritativo).
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT nombre, municipio FROM raw.barrios WHERE id = $1::int",
            int(barrio_id),
        )
    barrio_nombre = row["nombre"] if row else None
    municipio_nombre = row["municipio"] if row else None

    declaraciones = {k: payload[k] for k in DECLARACIONES_KEYS if k in payload}

    return {
        "id": str(uuid.uuid4()),
        "owner_id": owner_id,
        "estado": "nuevo",
        "agent_id": None,     # lo llena el asignador (paso 5)
        "listing_id": None,   # se llena al aceptar
        "operacion": operacion,
        "tipo_inmueble": tipo_inmueble,
        "geom": geom,
        "municipio": municipio_nombre,
        "barrio": barrio_nombre,
        "zona_nivel": "barrio",
        "zona_codigo": barrio_id,
        "direccion_aprox": payload.get("direccion_aprox"),
        "precio_esperado": payload.get("precio_esperado"),
        "area_m2": payload.get("area_m2"),
        "habitaciones": payload.get("habitaciones"),
        "banos": payload.get("banos"),
        "declaraciones": declaraciones,
        "notas_owner": payload.get("notas_owner"),
    }


async def aceptar_intake(
    intake_id: str,
    intake: Any,
    agent_id: str,
    agency_id: str,
    pool: Any,
) -> str:
    """Acepta el intake: crea un listing en 'borrador' y lo enlaza.

    Requiere que el intake ya esté 'asignado' (paso 5 puso agent_id/agency).
    El listing nace en 'borrador' — el realtor decide publicar más tarde.
    Devuelve el listing_id creado.
    """
    if str(intake.estado) != "asignado":
        raise IntakeError(
            f"Intake {intake_id} no está listo para aceptar (estado={intake.estado})"
        )

    listing_id = str(uuid.uuid4())
    slug = f"{intake.zona_codigo}-{listing_id[:8]}".lower()

    # ponytail: listing.precio es NOT NULL (0046); en borrador el owner puede no
    # haber dado precio → placeholder 0, el realtor lo corrige antes de publicar.
    precio = intake.precio_esperado if intake.precio_esperado is not None else 0

    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO listing (
                id, slug, agency_id, agent_id, estado, geom, municipio, barrio,
                direccion_aprox, mostrar_exacto, operacion, precio, moneda,
                tipo_inmueble, area_m2, habitaciones, banos, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, 'borrador', ST_GeomFromText($5, 4326), $6, $7, $8,
                FALSE, $9, $10, 'COP', $11, $12, $13, $14, NOW(), NOW()
            )
            """,
            listing_id, slug, agency_id, agent_id, intake.geom,
            intake.municipio, intake.barrio, intake.direccion_aprox,
            intake.operacion, precio, intake.tipo_inmueble,
            intake.area_m2, intake.habitaciones, intake.banos,
        )
        await conn.execute(
            "UPDATE intake SET listing_id = $1, estado = 'aceptado' WHERE id = $2",
            listing_id, intake_id,
        )

    return listing_id
