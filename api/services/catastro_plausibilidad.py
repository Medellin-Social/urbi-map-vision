"""Cross-check de plausibilidad contra catastro (Medellín).

NO es verificación de identidad: raw.catastro_medellin es anonimizado y agregado
por COMUNA (sin CBML por parcela), así que no se puede confirmar un inmueble
puntual. Lo que sí permite: contrastar el ÁREA y el precio/m² declarados contra
la distribución catastral de la comuna + tipo → señal "consistente" / "revisar".

Reusa la misma lógica calibrada de dbt listings_vs_catastro.sql:
  · apto = PH (vl_av_lote=0): avalúo/m² = construcción/m².
  · casa = predio con lote (vl_av_lote>0): construcción/m² + lote (fijo) repartido.
  · bandas precio_m2/avaluo_m2: 5–14x = RANGO_NORMAL (catastro Medellín desactualizado).
Comuna se resuelve por spatial join del geom del listing (robusto, sin match de nombres).
"""
from __future__ import annotations

from typing import Any, Optional

# Guard mínimo de predios del tipo en la comuna para que la mediana sea confiable.
_MIN_PREDIOS = 20
# Bandas del ratio precio_m2 / avaluo_m2 (venta). Mismas que dbt listings_vs_catastro.
_RATIO_MIN, _RATIO_MAX = 5.0, 14.0

_SQL = """
WITH l AS (
    SELECT l.tipo_inmueble::text AS tipo, l.operacion::text AS op,
           l.area_m2::float8 AS area, l.precio::float8 AS precio,
           (SELECT b.comuna FROM raw.barrios b
            WHERE b.geometry IS NOT NULL AND ST_Contains(b.geometry, l.geom) LIMIT 1) AS comuna
    FROM listing l WHERE l.id = $1
),
cat AS (
    SELECT
        count(*) FILTER (WHERE coalesce(c.vl_av_lote,0)=0) AS n_apto,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY c.vl_av_constru/c.nm_ar_constru)
            FILTER (WHERE coalesce(c.vl_av_lote,0)=0) AS avm2_apto,
        count(*) FILTER (WHERE coalesce(c.vl_av_lote,0)>0) AS n_casa,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY c.vl_av_constru/c.nm_ar_constru)
            FILTER (WHERE coalesce(c.vl_av_lote,0)>0) AS avm2_casa_constru,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY c.vl_av_lote)
            FILTER (WHERE coalesce(c.vl_av_lote,0)>0) AS av_lote_casa
    FROM raw.catastro_medellin c, l
    WHERE c.cd_vig_pred = 'S' AND c.cd_ind_ru_ur = 'U' AND c.vl_avaluo_total > 0
      AND c.nm_ar_constru BETWEEN 30 AND 400
      AND c.ds_uso_tipo ILIKE '%residencial%'
      AND c.ds_uso_tipo NOT ILIKE '%parqueadero%'
      AND c.ds_uso_tipo NOT ILIKE '%lote%'
      AND l.comuna IS NOT NULL AND UPPER(c.ds_comuna) = UPPER(l.comuna)
)
SELECT l.tipo, l.op, l.area, l.precio, l.comuna, cat.*
FROM l LEFT JOIN cat ON TRUE
"""


def _verdict(r: Any) -> dict:
    """Señal de plausibilidad = ratio precio/m² vs avalúo catastral de la comuna+tipo.

    Solo venta: el avalúo catastral es de venta, no sirve para contrastar arriendo.
    El área catastral NO se usa — su distribución no refleja los inmuebles reales
    (p05 El Poblado apto = 122 m², tacharía aptos normales de 70-90 m²).
    """
    tipo, comuna, area, precio = r["tipo"], r["comuna"], r["area"], r["precio"]
    if tipo not in ("apartamento", "casa") or not comuna:
        return {"estado": "sin_datos", "motivo": "Sin cobertura catastral (tipo u otra ciudad)"}
    if r["op"] != "venta":
        return {"estado": "sin_datos", "motivo": "El avalúo catastral solo contrasta ventas"}
    es_apto = tipo == "apartamento"
    n = r["n_apto"] if es_apto else r["n_casa"]
    if not n or n < _MIN_PREDIOS:
        return {"estado": "sin_datos", "motivo": f"Pocos predios catastrales en {comuna.title()}"}

    av_m2 = (r["avm2_apto"] if es_apto
             else (r["avm2_casa_constru"] or 0) + (r["av_lote_casa"] or 0) / area if area else None)
    if not area or not precio or not av_m2 or av_m2 <= 0:
        return {"estado": "sin_datos", "motivo": "Faltan área o precio para contrastar"}

    ratio = round((precio / area) / av_m2, 1)
    if ratio > _RATIO_MAX:
        estado, problema = "revisar", f"precio/m² {ratio}× el avalúo catastral (muy por encima del rango de la zona)"
    elif ratio < _RATIO_MIN:
        estado, problema = "revisar", f"precio/m² {ratio}× el avalúo catastral (muy por debajo del rango de la zona)"
    else:
        estado, problema = "consistente", None
    return {
        "estado": estado,
        "comuna": comuna.title(),
        "avaluo_m2_catastro": round(av_m2),
        "ratio_precio_catastro": ratio,
        "problemas": [problema] if problema else [],
    }


async def plausibilidad_catastro(pool: Any, listing_id: str) -> Optional[dict]:
    """Devuelve el veredicto de plausibilidad catastral de un listing, o None si no existe."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(_SQL, listing_id)
    if not row or row["tipo"] is None:
        return None
    return _verdict(row)


def _demo() -> None:
    """Self-check de _verdict (lógica pura, sin DB)."""
    base = dict(tipo="apartamento", op="venta", area=100.0, precio=670_000_000.0,
                comuna="El Poblado", n_apto=500, avm2_apto=895_428.0,
                n_casa=300, avm2_casa_constru=600_000.0, av_lote_casa=50_000_000.0)
    # 670M/100m² = 6.7M/m² ÷ 895k ≈ 7.5× → RANGO_NORMAL
    assert _verdict({**base})["estado"] == "consistente"
    # precio x10 → >14× → revisar
    assert _verdict({**base, "precio": 9_000_000_000.0})["estado"] == "revisar"
    # precio muy bajo → <5× → revisar
    assert _verdict({**base, "precio": 300_000_000.0})["estado"] == "revisar"
    # arriendo → sin_datos (avalúo no contrasta renta)
    assert _verdict({**base, "op": "arriendo"})["estado"] == "sin_datos"
    # otra ciudad (sin comuna) → sin_datos
    assert _verdict({**base, "comuna": None})["estado"] == "sin_datos"
    # pocos predios → sin_datos
    assert _verdict({**base, "n_apto": 5})["estado"] == "sin_datos"
    # casa usa construcción + lote repartido
    assert _verdict({**base, "tipo": "casa", "precio": 1_200_000_000.0})["estado"] in ("consistente", "revisar")
    print("catastro_plausibilidad _demo OK")


if __name__ == "__main__":
    _demo()
