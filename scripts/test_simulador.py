"""Test exhaustivo del endpoint /api/v1/calculadora/simular."""
import json
import sys
from collections import Counter

import requests

BASE_URL = "http://localhost:8001"
SIMULAR_URL = f"{BASE_URL}/api/v1/calculadora/simular"

# ── Barrios ───────────────────────────────────────────────────────────────────
print("Obteniendo barrios...", flush=True)
resp = requests.get(f"{BASE_URL}/api/v1/barrios", timeout=30)
resp.raise_for_status()
all_barrios = resp.json()  # lista directa
barrios = [b for b in all_barrios if not b.get("excluir_inversion")]
barrio_ids = [b["barrio_id"] for b in barrios[:20]]
print(f"Barrios disponibles: {len(all_barrios)} | no excluidos: {len(barrios)} | testeando: {len(barrio_ids)}")

# ── Parámetros ────────────────────────────────────────────────────────────────
TIPOS = ["airbnb", "renta_larga", "renta_media"]
PERFILES = ["conservador", "moderado", "agresivo"]
PRESUPUESTOS = [200_000_000, 350_000_000, 500_000_000, 1_000_000_000]

EXTRAS_POR_TIPO = {
    "airbnb": [
        {"n_unidades": nu, "tipo_gestion": tg}
        for nu in ["1", "2-5", "5+"]
        for tg in ["self", "manager"]
    ],
    "renta_media": [
        {"target_inquilino": ti, "amoblado": am}
        for ti in ["nomada", "ejecutivo", "estudiante"]
        for am in ["si", "no", "flexible"]
    ],
    "renta_larga": [
        {"tipo_pago": tp, "horizonte_inversion": hi}
        for tp in ["contado", "credito"]
        for hi in ["5", "10", "20+"]
    ],
}

# ── Resultados ────────────────────────────────────────────────────────────────
resultados: dict = {"ok": [], "error": [], "warning": [], "yields": []}


def test_combinacion(barrio_id, tipo, riesgo, presupuesto, extras):
    payload = {
        "barrio_id": barrio_id,
        "tipo_inversion": tipo,
        "perfil_riesgo": riesgo,
        "presupuesto_cop": presupuesto,
        **extras,
    }
    try:
        r = requests.post(SIMULAR_URL, json=payload, timeout=15)

        if r.status_code == 200:
            data = r.json()
            warnings = []

            # Extraer campos anidados
            ingresos = data.get("ingresos") or {}
            yields = data.get("yields") or {}
            valorizacion = data.get("valorizacion") or {}

            ingreso_mensual = ingresos.get("mensual_cop")
            yield_bruto = yields.get("bruto_pct")
            yield_neto = yields.get("neto_pct")
            retorno_total = valorizacion.get("retorno_total_5anos_cop")

            # Guardar yields para análisis posterior
            resultados["yields"].append({
                "barrio_id": barrio_id,
                "tipo": tipo,
                "riesgo": riesgo,
                "presupuesto": presupuesto,
                "extras": extras,
                "yield_bruto": yield_bruto,
                "yield_neto": yield_neto,
                "yield_airbnb_real": None,  # no en respuesta
                "ingreso_mensual": ingreso_mensual,
                "alertas": data.get("alertas", []),
                "datos_insuficientes": data.get("datos_insuficientes", False),
            })

            # Validaciones
            if data.get("datos_insuficientes"):
                warnings.append("datos_insuficientes=True")

            if ingreso_mensual is None:
                warnings.append("ingresos.mensual_cop NULL")
            elif ingreso_mensual < 0:
                warnings.append(f"ingreso_mensual NEGATIVO: {ingreso_mensual:,.0f}")

            if yield_neto is None:
                warnings.append("yields.neto_pct NULL")
            elif yield_neto < 0:
                warnings.append(f"yield_neto NEGATIVO: {yield_neto:.1f}%")
            elif yield_neto > 50:
                warnings.append(f"yield_neto SOSPECHOSO >50%: {yield_neto:.1f}%")

            if yield_bruto is not None and yield_neto is not None:
                if yield_neto > yield_bruto + 1:
                    warnings.append(
                        f"yield_neto ({yield_neto:.1f}%) > yield_bruto ({yield_bruto:.1f}%) — imposible"
                    )

            if retorno_total is None:
                warnings.append("valorizacion.retorno_total_5anos_cop NULL")
            elif retorno_total < 0:
                warnings.append(f"retorno_total NEGATIVO: {retorno_total:,.0f}")

            if warnings:
                resultados["warning"].append({
                    "payload": payload,
                    "warnings": warnings,
                    "ingreso_mensual": ingreso_mensual,
                    "yield_neto": yield_neto,
                })
            else:
                resultados["ok"].append({
                    "barrio_id": barrio_id,
                    "tipo": tipo,
                    "yield_neto": yield_neto,
                    "ingreso_mensual": ingreso_mensual,
                })

        elif r.status_code == 422:
            # 422 con "insuficientes" es esperado para barrios sin datos
            body = r.text.lower()
            if "insuficiente" in body or "sin datos" in body or "suficiente" in body:
                resultados["ok"].append({
                    "barrio_id": barrio_id,
                    "tipo": tipo,
                    "status": "422 esperado — sin datos",
                })
            else:
                resultados["error"].append({
                    "payload": payload,
                    "status": r.status_code,
                    "error": r.text[:300],
                })

        else:
            resultados["error"].append({
                "payload": payload,
                "status": r.status_code,
                "error": r.text[:300],
            })

    except Exception as exc:
        resultados["error"].append({"payload": payload, "exception": str(exc)})


# ── Loop ──────────────────────────────────────────────────────────────────────
total = 0
for i, barrio_id in enumerate(barrio_ids):
    print(f"  [{i+1}/{len(barrio_ids)}] barrio_id={barrio_id}", end="  ", flush=True)
    for tipo in TIPOS:
        for riesgo in PERFILES:
            for presupuesto in PRESUPUESTOS:
                for extras in EXTRAS_POR_TIPO[tipo]:
                    test_combinacion(barrio_id, tipo, riesgo, presupuesto, extras)
                    total += 1
    ok = len(resultados["ok"])
    err = len(resultados["error"])
    warn = len(resultados["warning"])
    print(f"OK={ok} WARN={warn} ERR={err}", flush=True)

# ── Reporte ───────────────────────────────────────────────────────────────────
print(f"\n{'='*55}")
print("REPORTE TEST SIMULADOR")
print(f"{'='*55}")
print(f"Total combinaciones testeadas : {total}")
print(f"✅ OK                         : {len(resultados['ok'])}")
print(f"⚠️  Warnings                  : {len(resultados['warning'])}")
print(f"❌ Errores                    : {len(resultados['error'])}")
pct_ok = len(resultados["ok"]) / total * 100 if total else 0
print(f"   Tasa OK                    : {pct_ok:.1f}%")

# Errores
if resultados["error"]:
    print(f"\n❌ PRIMEROS 10 ERRORES:")
    for e in resultados["error"][:10]:
        print(f"  [{e.get('status', 'exc')}] {e.get('error', e.get('exception', ''))[:120]}")
        p = e.get("payload", {})
        print(f"       barrio={p.get('barrio_id')} tipo={p.get('tipo_inversion')} riesgo={p.get('perfil_riesgo')}")

# Warnings agrupados
if resultados["warning"]:
    print(f"\n⚠️  WARNINGS (agrupados por tipo):")
    all_w = []
    for w in resultados["warning"]:
        all_w.extend(w["warnings"])
    for msg, cnt in Counter(all_w).most_common():
        print(f"  {cnt:4d}x  {msg}")

    print(f"\n  Primeros 5 ejemplos:")
    for w in resultados["warning"][:5]:
        p = w["payload"]
        print(f"    barrio={p['barrio_id']} tipo={p['tipo_inversion']} riesgo={p['perfil_riesgo']} "
              f"presupuesto={p['presupuesto_cop']/1e6:.0f}M")
        for msg in w["warnings"]:
            print(f"      → {msg}")

# Análisis de yields
yields_validos = [y for y in resultados["yields"] if y.get("yield_neto") is not None]
if yields_validos:
    vals = [y["yield_neto"] for y in yields_validos]
    print(f"\nYIELD ANÁLISIS (n={len(vals)}):")
    print(f"  Min            : {min(vals):.1f}%")
    print(f"  Max            : {max(vals):.1f}%")
    print(f"  Avg            : {sum(vals)/len(vals):.1f}%")
    print(f"  Negativos      : {len([v for v in vals if v < 0])}")
    print(f"  Sospechosos >20%: {len([v for v in vals if v > 20])}")
    print(f"  datos_insuficientes: {sum(1 for y in resultados['yields'] if y.get('datos_insuficientes'))}")

    print(f"\n  Top 5 yield más alto:")
    for y in sorted(yields_validos, key=lambda x: x["yield_neto"], reverse=True)[:5]:
        print(f"    barrio={y['barrio_id']} | {y['tipo']:12} | "
              f"yield_neto={y['yield_neto']:.1f}% | "
              f"ingreso={y['ingreso_mensual']:,.0f}/mes | riesgo={y['riesgo']}")

    print(f"\n  Inconsistencias yield_neto > yield_bruto+1:")
    inconsistencias = [
        y for y in yields_validos
        if y.get("yield_bruto") is not None and y["yield_neto"] > y["yield_bruto"] + 1
    ]
    if inconsistencias:
        for y in inconsistencias[:10]:
            print(f"    barrio={y['barrio_id']} | neto={y['yield_neto']:.1f}% > bruto={y['yield_bruto']:.1f}%")
    else:
        print("    Ninguna ✅")

# Barrios con más errores/warnings
barrio_problems: Counter = Counter()
for e in resultados["error"]:
    barrio_problems[e.get("payload", {}).get("barrio_id")] += 1
for w in resultados["warning"]:
    barrio_problems[w.get("payload", {}).get("barrio_id")] += 1
if barrio_problems:
    print(f"\n  Barrios con más problemas:")
    for bid, cnt in barrio_problems.most_common(5):
        print(f"    barrio_id={bid}: {cnt} problemas")

# Guardar JSON completo
out_path = "test_simulador_resultado.json"
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(resultados, f, indent=2, ensure_ascii=False, default=str)
print(f"\nReporte completo → {out_path}")
