from __future__ import annotations

import json
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from api.config import USD_TO_COP
from api.db import get_pool
from api.dependencies import get_optional_user

router = APIRouter()

_TCA_USD = USD_TO_COP
_CDT_PCT = 10.5      # % anual CDT Colombia

_SQL = """
    SELECT
        sc.nombre_barrio,
        sc.estado_precio,
        sc.precio_m2_venta_p50,
        sc.arriendo_p50,
        sc.score_corto,
        sc.score_mediano,
        sc.score_largo,
        bm.adr_noche_cop,
        bm.ocupacion_airbnb_pct,
        bm.precio_renta_media_p50,
        bm.n_venta,
        bm.zona_turistica,
        sl.var_anual_5anos_pct
    FROM analytics.barrios_score_consolidado sc
    JOIN  analytics.barrios_mercado    bm ON sc.barrio_id = bm.barrio_id
    LEFT JOIN analytics.score_largo_plazo sl ON sc.barrio_id = sl.barrio_id
    WHERE sc.barrio_id = $1
"""


# ── Modelos ──────────────────────────────────────────────────────────────────

class SimulacionRequest(BaseModel):
    barrio_id: int
    presupuesto_cop: float = Field(gt=0)
    tipo_inversion: Literal["airbnb", "renta_larga", "renta_media"]
    perfil_riesgo: Literal["conservador", "moderado", "agresivo"] = "moderado"


class Ingresos(BaseModel):
    mensual_cop: float
    anual_cop: float
    mensual_usd: float
    anual_usd: float


class Yields(BaseModel):
    bruto_pct: float
    neto_pct: float
    vs_cdt: float
    mensaje_cdt: str


class Recupero(BaseModel):
    bruto_anos: float
    neto_anos: float


class PreciosCorregidos(BaseModel):
    precio_publicado_m2: float
    precio_real_estimado_m2: float
    arriendo_publicado: float
    arriendo_neto_propietario: float


class YieldsCorregidos(BaseModel):
    yield_bruto_publicado: float
    yield_real_estimado: float
    diferencia_pct: float


class Valorizacion(BaseModel):
    tasa_anual_pct: float
    valor_3anos_cop: float
    valor_5anos_cop: float
    ganancia_5anos_cop: float
    retorno_total_5anos_cop: float


class SimulacionResponse(BaseModel):
    barrio: str
    presupuesto_cop: float
    presupuesto_usd: float
    area_comprable_m2: float
    tipo_inversion: str

    ingresos: Ingresos
    yields: Yields
    recupero: Recupero
    valorizacion: Valorizacion

    score_oportunidad: int
    rating_oportunidad: str
    estado_precio: str | None

    precios: PreciosCorregidos
    yields_corregidos: YieldsCorregidos

    resumen: str
    alertas: list[str]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _r2(v: float) -> float:
    return round(v, 2)


def _rating(score: int) -> str:
    if score >= 80:
        return "EXCELENTE"
    if score >= 60:
        return "BUENA OPORTUNIDAD"
    if score >= 40:
        return "MODERADA"
    return "NO RECOMENDADA"


def _cdt_diff(yield_neto: float) -> tuple[float, str]:
    diff = round(yield_neto - _CDT_PCT, 1)
    if diff >= 0:
        msg = f"Tu inversión supera un CDT en {diff}%"
    else:
        msg = f"Un CDT daría {abs(diff)}% más — considera el potencial de valorización"
    return diff, msg


def calcular(
    presupuesto: float,
    tipo: str,
    data: dict,
) -> tuple[float, float, float, list[str]]:
    """
    Devuelve (ingreso_mensual, score_val, var_anual, alertas).
    Raises ValueError si faltan datos críticos.
    """
    alertas: list[str] = []

    if tipo == "airbnb":
        adr = float(data.get("adr_noche_cop") or 0)
        ocupacion = float(data.get("ocupacion_airbnb_pct") or 0)
        if not adr or not ocupacion:
            raise ValueError("Sin datos Airbnb para este barrio")
        ingreso_mensual = adr * (ocupacion / 100.0) * 30
        if data.get("zona_turistica") is False:
            alertas.append("Barrio no clasificado como zona turística — demanda Airbnb puede ser menor")
        alertas.append("Considera gestión profesional para Airbnb")
        score_val = float(data.get("score_corto") or 0)

    elif tipo == "renta_larga":
        arriendo = data.get("arriendo_p50")
        if not arriendo:
            raise ValueError("Sin datos de arriendo para este barrio")
        ingreso_mensual = float(arriendo)
        score_val = float(data.get("score_largo") or 0)

    else:  # renta_media
        renta_media = data.get("precio_renta_media_p50")
        arriendo = data.get("arriendo_p50")
        if renta_media:
            ingreso_mensual = float(renta_media)
        elif arriendo:
            ingreso_mensual = float(arriendo) * 1.4
            alertas.append("Precio renta media estimado — sin datos directos, se usó arriendo × 1.4")
        else:
            raise ValueError("Sin datos de renta para este barrio")
        score_val = float(data.get("score_mediano") or 0)

    var_anual = float(data.get("var_anual_5anos_pct") or 10.1)
    if data.get("var_anual_5anos_pct") is None:
        alertas.append("Tasa de valorización estimada — sin datos IPVN para este estrato")

    return ingreso_mensual, score_val, var_anual, alertas


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.post("/simular", response_model=SimulacionResponse)
async def simular(req: SimulacionRequest, current_user: Optional[dict] = Depends(get_optional_user)):
    pool = get_pool()
    row = await pool.fetchrow(_SQL, req.barrio_id)
    if row is None:
        raise HTTPException(status_code=404, detail=f"Barrio {req.barrio_id} no encontrado")

    data = dict(row)
    alertas: list[str] = []

    precio_m2 = float(data.get("precio_m2_venta_p50") or 0)
    if not precio_m2:
        raise HTTPException(
            status_code=400,
            detail="Este barrio no tiene suficientes datos de precio para simular. Prueba con El Poblado, Laureles o Estadio.",
        )

    try:
        ingreso_mensual, score_val, var_anual, extra_alertas = calcular(
            req.presupuesto_cop, req.tipo_inversion, data
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    alertas.extend(extra_alertas)

    presupuesto = req.presupuesto_cop
    area_m2 = round(presupuesto / precio_m2, 1)
    ingreso_mensual = round(ingreso_mensual)
    ingreso_anual = ingreso_mensual * 12

    yield_bruto = _r2(ingreso_anual / presupuesto * 100)
    ingreso_neto_anual = ingreso_anual * 0.92 - presupuesto * 0.027
    yield_neto = _r2(ingreso_neto_anual / presupuesto * 100)
    diff_cdt, msg_cdt = _cdt_diff(yield_neto)

    # Corrección inmobiliaria: -3% precio venta, -10% arriendo
    precio_real_m2 = round(precio_m2 * 0.97)
    arriendo_neto = round(ingreso_mensual * 0.90) if req.tipo_inversion in ("renta_larga", "renta_media") else ingreso_mensual
    yield_real = _r2(arriendo_neto * 12 / presupuesto * 100)

    recupero_bruto = _r2(presupuesto / ingreso_anual)
    recupero_neto = _r2(presupuesto / ingreso_neto_anual) if ingreso_neto_anual > 0 else 999.0

    valor_3 = round(presupuesto * (1 + var_anual / 100) ** 3)
    valor_5 = round(presupuesto * (1 + var_anual / 100) ** 5)
    ganancia_5 = valor_5 - presupuesto
    retorno_total_5 = ganancia_5 + round(ingreso_neto_anual * 5)

    score_op = int(score_val)
    rating = _rating(score_op)

    if (data.get("n_venta") or 0) < 5:
        alertas.insert(0, "Muestra de datos limitada en este barrio")

    barrio_nombre = data.get("nombre_barrio") or f"Barrio {req.barrio_id}"
    tipo_label = {
        "airbnb": "Airbnb",
        "renta_larga": "arriendo largo",
        "renta_media": "renta media",
    }[req.tipo_inversion]
    resumen = (
        f"Con ${presupuesto/1_000_000:.0f}M en {barrio_nombre.title()} para {tipo_label}, "
        f"puedes comprar ~{area_m2}m² con ingreso estimado de "
        f"${ingreso_mensual/1_000_000:.1f}M/mes. "
        f"Yield neto {yield_neto}%. "
        f"En 5 años tu propiedad valdría ~${valor_5/1_000_000:.0f}M "
        f"más ${round(ingreso_neto_anual * 5 / 1_000_000, 0):.0f}M en ingresos netos "
        f"= retorno total de ${retorno_total_5/1_000_000:.0f}M."
    )

    if current_user:
        try:
            _pool = get_pool()
            meta = json.dumps({"tipo_inversion": req.tipo_inversion, "presupuesto_cop": req.presupuesto_cop})
            await _pool.execute(
                "INSERT INTO historial (usuario_id, tipo, barrio_id, metadata) VALUES ($1, $2, $3, $4::jsonb)",
                current_user["id"], "simulacion", req.barrio_id, meta,
            )
        except Exception:
            pass  # historial failure must not break simulacion

    return SimulacionResponse(
        barrio=barrio_nombre,
        presupuesto_cop=presupuesto,
        presupuesto_usd=round(presupuesto / _TCA_USD),
        area_comprable_m2=area_m2,
        tipo_inversion=req.tipo_inversion,
        ingresos=Ingresos(
            mensual_cop=float(ingreso_mensual),
            anual_cop=float(ingreso_anual),
            mensual_usd=round(ingreso_mensual / _TCA_USD),
            anual_usd=round(ingreso_anual / _TCA_USD),
        ),
        yields=Yields(
            bruto_pct=yield_bruto,
            neto_pct=yield_neto,
            vs_cdt=diff_cdt,
            mensaje_cdt=msg_cdt,
        ),
        recupero=Recupero(
            bruto_anos=recupero_bruto,
            neto_anos=recupero_neto,
        ),
        valorizacion=Valorizacion(
            tasa_anual_pct=var_anual,
            valor_3anos_cop=float(valor_3),
            valor_5anos_cop=float(valor_5),
            ganancia_5anos_cop=float(ganancia_5),
            retorno_total_5anos_cop=float(retorno_total_5),
        ),
        score_oportunidad=score_op,
        rating_oportunidad=rating,
        estado_precio=data.get("estado_precio"),
        precios=PreciosCorregidos(
            precio_publicado_m2=float(precio_m2),
            precio_real_estimado_m2=float(precio_real_m2),
            arriendo_publicado=float(ingreso_mensual),
            arriendo_neto_propietario=float(arriendo_neto),
        ),
        yields_corregidos=YieldsCorregidos(
            yield_bruto_publicado=yield_bruto,
            yield_real_estimado=yield_real,
            diferencia_pct=_r2(yield_bruto - yield_real),
        ),
        resumen=resumen,
        alertas=alertas,
    )
