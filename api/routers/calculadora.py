from __future__ import annotations

import json
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from api import parametros
from api.db import get_pool
from api.dependencies import get_optional_user

router = APIRouter()

_NOTA_HIPOTECA = (
    "Tasa referencial 14% EA. "
    "Consulta con tu banco — puede variar según perfil crediticio y entidad."
)

# Loan-to-value estándar Colombia (Ley 546 / reglamentación Superfinanciera).
# Bancos financian hasta 70% para vivienda NO VIS; comprador aporta mínimo 30%.
_LTV = 0.70

# Opex como % del ingreso bruto anual (no del valor del inmueble — evita absurdos de escala).
# Incluye todo: predial proporcional, admin edificio, seguros, mantenimiento, vacancia.
_OPEX: dict[str, float] = {
    "airbnb":      0.38,  # comisión plataforma 3% + limpieza 5% + vacancia estacional 20% + suministros 10%
    "renta_media": 0.22,  # vacancia baja + admin parcial + predial + seguros + mant. variable
    "renta_larga": 0.28,  # admin edificio ~12% + predial ~5% + seguros ~2% + mant. ~4% + vacancia ~5%
}

# Etiqueta legible por tipo para mostrar en alertas/resumen
_OPEX_LABEL: dict[str, str] = {
    "airbnb":      "38% (plataforma + limpieza + vacancia + suministros)",
    "renta_media": "22% (admin + predial + seguros + mant. + vacancia)",
    "renta_larga": "28% (admin edificio + predial + seguros + mant. + vacancia)",
}

# LEFT JOIN barrios_airbnb_real to prefer real observed income over projected ADR×ocupacion.
# NULL fallback for ipvn_variacion_anual — raw.ipvn_dane not yet migrated to prod;
# _resolve_var_anual_dane() cascades to parametros/hardcoded default when NULL.
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
        sl.var_anual_5anos_pct,
        bar.ingresos_anuales_p50_cop   AS ingreso_anual_airbnb_real_cop,
        NULL::float                    AS ipvn_variacion_anual
    FROM analytics.barrios_score_consolidado sc
    JOIN  analytics.barrios_mercado          bm   ON sc.barrio_id = bm.barrio_id
    LEFT JOIN analytics.score_largo_plazo    sl   ON sc.barrio_id = sl.barrio_id
    LEFT JOIN analytics.barrios_airbnb_real  bar  ON sc.barrio_id = bar.barrio_id
    WHERE sc.barrio_id = $1
"""


# ── Modelos ──────────────────────────────────────────────────────────────────

class SimulacionRequest(BaseModel):
    barrio_id: int
    presupuesto_cop: float = Field(gt=0)
    tipo_inversion: Literal["airbnb", "renta_larga", "renta_media"]
    perfil_riesgo: Literal["conservador", "moderado", "agresivo"] = "moderado"
    # Extended profile fields (all optional)
    n_unidades: Optional[str] = None
    tipo_gestion: Optional[str] = None
    target_inquilino: Optional[str] = None
    amoblado: Optional[str] = None
    tipo_pago: Optional[str] = None
    horizonte_inversion: Optional[str] = None


class Ingresos(BaseModel):
    mensual_cop: float
    anual_cop: float
    mensual_usd: float
    anual_usd: float


class Yields(BaseModel):
    bruto_pct: float
    neto_pct: float


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
    fuente_tasa: str
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
    datos_insuficientes: bool = False

    # Profile desglose (optional — only present when profile fields sent)
    ingreso_bruto_mensual: Optional[float] = None
    costo_gestion_mensual: Optional[float] = None
    ingreso_neto_gestion_mensual: Optional[float] = None
    n_unidades_efectivo: Optional[int] = None
    # Crédito hipotecario
    down_payment_cop: Optional[float] = None
    monto_credito_cop: Optional[float] = None
    cuota_mensual: Optional[float] = None
    flujo_neto_mensual: Optional[float] = None
    yield_coc_pct: Optional[float] = None       # cash-on-cash sobre capital propio
    recupero_credito_anos: Optional[float] = None  # recupero sobre capital propio
    nota_hipoteca: Optional[str] = None
    costo_amoblado: Optional[float] = None
    presupuesto_efectivo: Optional[float] = None
    valor_20anos_cop: Optional[float] = None


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


def _resolve_var_anual(data: dict, alertas: list[str]) -> tuple[float, str]:
    """
    Cascade: score_largo_plazo → raw.ipvn_dane → raw.parametros_sistema → 10.1
    Returns (var_anual, fuente_label).
    """
    # 1) Barrio-specific 5-year IPVN estimate (from score_largo_plazo)
    v = data.get("var_anual_5anos_pct")
    if v is not None:
        return float(v), "IPVN estrato"

    # 2) Latest DANE national figure (joined from raw.ipvn_dane)
    ipvn = data.get("ipvn_variacion_anual")
    if ipvn is not None:
        return float(ipvn), "IPVN DANE (nacional)"

    # 3) Stored parameter (daily-updated from raw.ipvn_dane via DAG)
    stored = parametros.get("VAR_ANUAL_DANE")
    if stored != 10.1:
        alertas.append(
            "Valorización basada en dato DANE almacenado — sin IPVN específico para este barrio"
        )
        return stored, "DANE almacenado"

    # 4) Hardcoded fallback
    alertas.append(
        "Tasa de valorización estimada (10.1%) — sin datos IPVN para este barrio"
    )
    return 10.1, "estimado"


def calcular(
    presupuesto: float,
    tipo: str,
    data: dict,
    alertas: list[str],
) -> tuple[float, float]:
    """
    Devuelve (ingreso_mensual, score_val).
    Raises ValueError si faltan datos críticos.
    Appends data-quality alertas in place.
    """
    if tipo == "airbnb":
        ingreso_anual_real = data.get("ingreso_anual_airbnb_real_cop")
        adr = float(data.get("adr_noche_cop") or 0)
        ocupacion = float(data.get("ocupacion_airbnb_pct") or 0)

        if ingreso_anual_real:
            # Prefer real scraped Airbnb income over ADR×ocupacion projection
            ingreso_mensual = float(ingreso_anual_real) / 12
            alertas.append("Ingreso Airbnb basado en datos reales del barrio (mediana P50)")
        elif adr and ocupacion:
            ingreso_mensual = adr * (ocupacion / 100.0) * 30
        else:
            raise ValueError(
                "Este barrio no tiene datos Airbnb suficientes (sin ADR ni ingresos reales). "
                "Prueba con renta_larga o elige un barrio con actividad turística "
                "(Poblado, Laureles, Envigado)."
            )

        if data.get("zona_turistica") is False:
            alertas.append(
                "Barrio no clasificado como zona turística — demanda Airbnb puede ser menor"
            )
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
            alertas.append(
                "Precio renta media estimado — sin datos directos, se usó arriendo × 1.4"
            )
        else:
            raise ValueError("Sin datos de renta para este barrio")
        score_val = float(data.get("score_mediano") or 0)

    return ingreso_mensual, score_val


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

    # Fix #4: flag before simulation, not after
    datos_insuficientes = (data.get("n_venta") or 0) < 5
    if datos_insuficientes:
        alertas.insert(0, (
            "⚠️ DATOS INSUFICIENTES — menos de 5 transacciones de venta registradas en este barrio. "
            "Los precios son poco representativos; usa los resultados como referencia aproximada."
        ))

    try:
        ingreso_mensual, score_val = calcular(
            req.presupuesto_cop, req.tipo_inversion, data, alertas
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    var_anual, fuente_tasa = _resolve_var_anual(data, alertas)

    presupuesto = req.presupuesto_cop
    area_m2 = round(presupuesto / precio_m2, 1)
    ingreso_mensual = round(ingreso_mensual)

    # Financial params from DB (not hardcoded)
    tca = parametros.get("USD_TO_COP")

    # ── Profile-specific adjustments ─────────────────────────────────────────
    ingreso_bruto_mensual: Optional[float] = None
    costo_gestion_mensual: Optional[float] = None
    ingreso_neto_gestion_mensual: Optional[float] = None
    n_unidades_efectivo: Optional[int] = None
    down_payment_val: Optional[float] = None
    monto_credito_val: Optional[float] = None
    cuota_mensual_val: Optional[float] = None
    flujo_neto_mensual_val: Optional[float] = None
    yield_coc_val: Optional[float] = None
    recupero_credito_val: Optional[float] = None
    nota_hipoteca_val: Optional[str] = None
    costo_amoblado_val: Optional[float] = None
    presupuesto_efectivo_val: Optional[float] = None

    if req.tipo_inversion == "airbnb":
        n_raw = (req.n_unidades or "").lower()
        mult = 3 if "2-5" in n_raw else (6 if "5+" in n_raw else 1)
        if mult > 1:
            n_unidades_efectivo = mult
            ingreso_mensual = round(ingreso_mensual * mult)
            alertas.append(f"Simulación para {mult} unidades")
        gestion_raw = (req.tipo_gestion or "").lower()
        if "manager" in gestion_raw:
            ingreso_bruto_mensual = float(ingreso_mensual)
            costo_gestion_mensual = round(ingreso_mensual * 0.25)
            ingreso_neto_gestion_mensual = round(ingreso_mensual * 0.75)
            ingreso_mensual = ingreso_neto_gestion_mensual

    elif req.tipo_inversion == "renta_media":
        amoblado_raw = (req.amoblado or "").lower()
        if "furnished" in amoblado_raw or "fully" in amoblado_raw:
            costo_amoblado_val = round(area_m2 * 200_000)
            presupuesto_efectivo_val = round(presupuesto - costo_amoblado_val)
            alertas.append(
                f"Presupuesto para amoblar: ${costo_amoblado_val / 1_000_000:.1f}M COP (~$200k/m²)"
            )

    elif req.tipo_inversion == "renta_larga":
        pago_raw = (req.tipo_pago or "").lower()
        if "mortgage" in pago_raw or "financing" in pago_raw:
            horizonte_raw = (req.horizonte_inversion or "").lower()
            plazo_meses = (
                240 if "20" in horizonte_raw
                else (60 if ("5" in horizonte_raw and "10" not in horizonte_raw) else 120)
            )
            # Colombia estándar: banco financia _LTV (70%), comprador aporta (1-_LTV) (30%)
            down_payment_val = round(presupuesto * (1 - _LTV))
            monto_credito_val = round(presupuesto * _LTV)
            tasa_mensual = 0.012  # 1.2%/mes ≈ 14.4% EA referencial
            cuota = monto_credito_val * tasa_mensual / (1 - (1 + tasa_mensual) ** -plazo_meses)
            cuota_mensual_val = round(cuota)
            # Flujo usa arriendo neto (−10% vacancia/admin) para ser conservador
            arriendo_neto_mensual = round(ingreso_mensual * 0.90)
            flujo_neto_mensual_val = arriendo_neto_mensual - cuota_mensual_val
            # Cash-on-cash: retorno anual sobre el capital propio aportado
            if flujo_neto_mensual_val > 0 and down_payment_val > 0:
                yield_coc_val = _r2((flujo_neto_mensual_val * 12) / down_payment_val * 100)
                recupero_credito_val = _r2(down_payment_val / (flujo_neto_mensual_val * 12))
            else:
                yield_coc_val = _r2(0.0)
                recupero_credito_val = 999.0
            nota_hipoteca_val = _NOTA_HIPOTECA
            alertas.append(
                f"Estructura: 30% entrada ({down_payment_val / 1_000_000:.0f}M COP) "
                f"+ 70% crédito hipotecario ({monto_credito_val / 1_000_000:.0f}M COP)"
            )
            msg = (
                f"Flujo neto con crédito: +${flujo_neto_mensual_val / 1_000_000:.2f}M/mes"
                if flujo_neto_mensual_val >= 0
                else f"Flujo negativo con crédito: necesitas aportar ${abs(flujo_neto_mensual_val) / 1_000_000:.2f}M/mes"
            )
            alertas.append(msg)
    # ─────────────────────────────────────────────────────────────────────────

    ingreso_anual = ingreso_mensual * 12

    yield_bruto = _r2(ingreso_anual / presupuesto * 100)
    opex_rate = _OPEX[req.tipo_inversion]
    ingreso_neto_anual = ingreso_anual * (1 - opex_rate)
    yield_neto = _r2(ingreso_neto_anual / presupuesto * 100)

    # Corrección inmobiliaria: -3% precio venta, -10% arriendo
    precio_real_m2 = round(precio_m2 * 0.97)
    arriendo_neto = (
        round(ingreso_mensual * 0.90)
        if req.tipo_inversion in ("renta_larga", "renta_media")
        else ingreso_mensual
    )
    yield_real = _r2(arriendo_neto * 12 / presupuesto * 100)

    recupero_bruto = _r2(presupuesto / ingreso_anual)
    recupero_neto = _r2(presupuesto / ingreso_neto_anual) if ingreso_neto_anual > 0 else 999.0

    valor_3 = round(presupuesto * (1 + var_anual / 100) ** 3)
    valor_5 = round(presupuesto * (1 + var_anual / 100) ** 5)
    valor_20 = round(presupuesto * (1 + var_anual / 100) ** 20)
    ganancia_5 = valor_5 - presupuesto
    retorno_total_5 = ganancia_5 + round(ingreso_neto_anual * 5)

    score_op = int(score_val)
    rating = _rating(score_op)

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
            meta = json.dumps({"tipo_inversion": req.tipo_inversion, "presupuesto_cop": req.presupuesto_cop})
            await pool.execute(
                "INSERT INTO historial (usuario_id, tipo, barrio_id, metadata) VALUES ($1, $2, $3, $4::jsonb)",
                current_user["id"], "simulacion", req.barrio_id, meta,
            )
        except Exception:
            pass  # historial failure must not break simulacion

    return SimulacionResponse(
        barrio=barrio_nombre,
        presupuesto_cop=presupuesto,
        presupuesto_usd=round(presupuesto / tca),
        area_comprable_m2=area_m2,
        tipo_inversion=req.tipo_inversion,
        ingresos=Ingresos(
            mensual_cop=float(ingreso_mensual),
            anual_cop=float(ingreso_anual),
            mensual_usd=round(ingreso_mensual / tca),
            anual_usd=round(ingreso_anual / tca),
        ),
        yields=Yields(
            bruto_pct=yield_bruto,
            neto_pct=yield_neto,
        ),
        recupero=Recupero(
            bruto_anos=recupero_bruto,
            neto_anos=recupero_neto,
        ),
        valorizacion=Valorizacion(
            tasa_anual_pct=var_anual,
            fuente_tasa=fuente_tasa,
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
        datos_insuficientes=datos_insuficientes,
        ingreso_bruto_mensual=ingreso_bruto_mensual,
        costo_gestion_mensual=float(costo_gestion_mensual) if costo_gestion_mensual is not None else None,
        ingreso_neto_gestion_mensual=float(ingreso_neto_gestion_mensual) if ingreso_neto_gestion_mensual is not None else None,
        n_unidades_efectivo=n_unidades_efectivo,
        down_payment_cop=float(down_payment_val) if down_payment_val is not None else None,
        monto_credito_cop=float(monto_credito_val) if monto_credito_val is not None else None,
        cuota_mensual=float(cuota_mensual_val) if cuota_mensual_val is not None else None,
        flujo_neto_mensual=float(flujo_neto_mensual_val) if flujo_neto_mensual_val is not None else None,
        yield_coc_pct=float(yield_coc_val) if yield_coc_val is not None else None,
        recupero_credito_anos=float(recupero_credito_val) if recupero_credito_val is not None else None,
        nota_hipoteca=nota_hipoteca_val,
        costo_amoblado=float(costo_amoblado_val) if costo_amoblado_val is not None else None,
        presupuesto_efectivo=float(presupuesto_efectivo_val) if presupuesto_efectivo_val is not None else None,
        valor_20anos_cop=float(valor_20),
    )
