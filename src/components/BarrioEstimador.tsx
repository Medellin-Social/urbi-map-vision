import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";
import { API_ENDPOINTS } from "@/config/api";
import { formatMoney } from "@/lib/format";
import { useBarriosComunas, useBarriosPorComuna, type ComunaItem, type BarrioComunaItem } from "@/hooks/useBarrios";
import type { ApiBarrio } from "@/lib/adapters";
import { K } from "@/design/tokens";

const selectStyle: React.CSSProperties = {
  padding: "10px 14px", borderRadius: 8, border: `1.5px solid ${K.line}`,
  background: K.paper, color: K.ink, fontSize: 14, fontFamily: "inherit",
};

function fmtM(n: number | null | undefined): string {
  if (!n) return "—";
  return formatMoney(n, "COP", undefined, { suffix: false });
}
function fmtPct(n: number | null | undefined): string {
  if (!n) return "—";
  return `${n.toFixed(1)}%`;
}
// Precio grande en millones: venta entero ($800M), arriendo con decimal ($7.6M).
function aM(n: number, arriendo: boolean): string {
  const v = n / 1_000_000;
  return arriendo ? `$${v.toFixed(1)}M` : `$${Math.round(v)}M`;
}

type EstimOut = { n: number; nivel: "barrio" | "comuna" | null; con_banda: boolean; p25: number | null; p50: number | null; p75: number | null };

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: K.surface, borderRadius: 10, padding: "16px 14px", border: `1px solid ${K.line}` }}>
      <p style={{ fontSize: 10, fontWeight: 800, color: K.muted, letterSpacing: "1.5px", textTransform: "uppercase", margin: "0 0 6px" }}>{label}</p>
      <p style={{ fontFamily: K.serif, fontSize: "1.2rem", fontWeight: 900, color: K.ink, margin: 0 }}>{value}</p>
    </div>
  );
}

/** Estimación por barrio CALIBRADA con comps reales: mediana del precio de avisos de la
 *  zona con esas habitaciones (y, si hay muestra, en una banda ±30% de m²); rango = p25/p75
 *  reales del mercado. Fallback barrio→comuna (endpoint /barrios/{id}/estimador). Muestra
 *  además las métricas del barrio. Autocontenido + colapsable, para montar debajo del form. */
export function BarrioEstimador({ defaultM2 = "" }: { defaultM2?: string }) {
  const [open, setOpen] = useState(false);
  const [intencion, setIntencion] = useState<"venta" | "arriendo">("venta");
  const [comunaKey, setComunaKey] = useState<string | null>(null);
  const [barrioId, setBarrioId] = useState<number | null>(null);
  const [m2, setM2] = useState<string>(defaultM2);
  const [habs, setHabs] = useState<number | null>(null);

  // Debounce del m² (input de texto) → no una request por tecla.
  const [m2Deb, setM2Deb] = useState<string>(defaultM2);
  useEffect(() => { const t = setTimeout(() => setM2Deb(m2), 400); return () => clearTimeout(t); }, [m2]);

  const { data: comunas = [] } = useBarriosComunas();
  const { data: barrios = [] } = useBarriosPorComuna(comunaKey);
  const { data: barrioData, isFetching } = useQuery<ApiBarrio>({
    queryKey: ["barrio-estimador-metrics", barrioId],
    queryFn: () => apiFetch<ApiBarrio>(API_ENDPOINTS.barrio(barrioId!)),
    enabled: barrioId !== null,
    staleTime: 5 * 60_000,
  });

  const mercado = barrioData?.mercado;
  const liquidez = barrioData?.liquidez;
  const airbnb = barrioData?.airbnb;

  // Estimador calibrado (comps reales) — depende de barrio + operación + m²(debounced) + habs.
  const m2Num = parseInt(m2Deb, 10) || 0;
  const qs = `tipo_operacion=${intencion}` + (habs ? `&habitaciones=${habs}` : "") + (m2Num >= 10 ? `&m2=${m2Num}` : "");
  const { data: estim, isFetching: estimLoading } = useQuery<EstimOut>({
    queryKey: ["barrio-estimador-comps", barrioId, intencion, habs, m2Num],
    queryFn: () => apiFetch<EstimOut>(API_ENDPOINTS.barrioEstimador(barrioId!, qs)),
    enabled: barrioId !== null && (m2Num >= 10 || habs !== null),
    staleTime: 5 * 60_000,
  });
  const esArr = intencion === "arriendo";
  const hayEstim = !!(estim && estim.p50);

  const toggleBtn = (val: "venta" | "arriendo", label: string) => (
    <button
      type="button"
      onClick={() => setIntencion(val)}
      style={{
        flex: 1, padding: "9px 12px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
        fontSize: 13, fontWeight: 800,
        background: intencion === val ? K.teal : "#fff",
        color: intencion === val ? "#fff" : K.ink,
        border: `1.5px solid ${intencion === val ? K.teal : K.line}`,
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ background: "#fff", border: `1px solid ${K.line}`, borderRadius: 14, overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
          background: open ? K.tealLight : "#fff", border: "none", cursor: "pointer", fontFamily: "inherit",
          padding: "16px 18px", textAlign: "left",
        }}
      >
        <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontFamily: K.serif, fontWeight: 900, fontSize: "1.05rem", color: K.ink }}>
            📊 Revisá en cuánto está por tu barrio
          </span>
          <span style={{ fontSize: 12.5, color: K.muted }}>
            Precio real de la zona según habitaciones y tamaño — con avisos del mercado.
          </span>
        </span>
        <span aria-hidden style={{ color: K.tealDeep, fontWeight: 800, flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{ padding: "4px 18px 20px", borderTop: `1px solid ${K.line}` }}>
          <div style={{ display: "flex", gap: 8, margin: "16px 0 14px" }}>
            {toggleBtn("venta", "Vender")}
            {toggleBtn("arriendo", "Arrendar")}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
            <select
              value={comunaKey ?? ""}
              onChange={(e) => { setComunaKey(e.target.value || null); setBarrioId(null); }}
              style={selectStyle}
            >
              <option value="">Comuna / Municipio ▾</option>
              {comunas.map((c: ComunaItem) => (
                <option key={c.key} value={c.key}>{c.label} — {c.municipio}</option>
              ))}
            </select>
            <select
              value={barrioId ?? ""}
              onChange={(e) => setBarrioId(e.target.value ? Number(e.target.value) : null)}
              disabled={!comunaKey || barrios.length === 0}
              style={{ ...selectStyle, opacity: !comunaKey ? 0.5 : 1 }}
            >
              <option value="">Barrio ▾</option>
              {barrios.map((b: BarrioComunaItem) => (
                <option key={b.id} value={b.id}>{b.nombre}</option>
              ))}
            </select>
          </div>

          {!barrioId ? (
            <p style={{ color: K.muted, fontSize: 13, margin: 0 }}>Elegí comuna y barrio para ver los datos de la zona.</p>
          ) : isFetching ? (
            <p style={{ color: K.muted, fontSize: 13, margin: 0 }}>Cargando datos del barrio…</p>
          ) : (
            <>
              {/* Métricas del barrio */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {!esArr ? (
                  <>
                    <MetricCard label="Precio/m²" value={fmtM(mercado?.precio_m2_cop)} />
                    <MetricCard label="Precio prom. venta" value={fmtM(mercado?.precio_venta_promedio)} />
                    <MetricCard label="Tiempo estimado venta" value={liquidez?.tiempo_estimado_venta ?? "—"} />
                    <MetricCard label="Yield bruto" value={fmtPct(mercado?.yield_bruto_pct)} />
                  </>
                ) : (
                  <>
                    <MetricCard label="Canon promedio (p50)" value={fmtM(mercado?.arriendo_p50_cop)} />
                    <MetricCard label="Yield bruto estimado" value={fmtPct(mercado?.yield_bruto_pct)} />
                    <MetricCard label="Yield Airbnb" value={fmtPct(airbnb?.yield_airbnb_pct)} />
                    <MetricCard label="Ocupación Airbnb" value={airbnb?.ocupacion_pct ? `${Math.round(airbnb.ocupacion_pct)}%` : "—"} />
                  </>
                )}
              </div>

              {/* Estimación calibrada con comps reales */}
              <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${K.line}` }}>
                <p style={{ fontSize: 12, fontWeight: 800, color: K.muted, letterSpacing: "1.5px", textTransform: "uppercase", margin: "0 0 14px" }}>
                  Estimá tu inmueble
                </p>
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 12, color: K.muted, fontWeight: 600 }}>Metros cuadrados</span>
                    <input type="number" inputMode="numeric" placeholder="Ej. 75" value={m2} onChange={(e) => setM2(e.target.value)} style={{ ...selectStyle, width: 120 }} />
                  </label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 12, color: K.muted, fontWeight: 600 }}>Habitaciones</span>
                    <div style={{ display: "flex", gap: 4 }}>
                      {[1, 2, 3, 4].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setHabs(habs === n ? null : n)}
                          style={{
                            width: 36, height: 36, borderRadius: 6, cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: "inherit",
                            border: `1.5px solid ${habs === n ? K.teal : K.line}`,
                            background: habs === n ? K.teal : "#fff",
                            color: habs === n ? "#fff" : K.ink,
                          }}
                        >
                          {n === 4 ? "4+" : n}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {hayEstim ? (
                  <div style={{ marginTop: 18, padding: "16px 20px", background: K.tealLight, borderRadius: 10, border: `1px solid rgba(29,158,117,0.2)` }}>
                    <p style={{ color: K.muted, fontSize: 13, margin: "0 0 4px" }}>
                      {esArr ? "Canon de mercado (mediana)" : "Precio de mercado (mediana)"}
                    </p>
                    <p style={{ fontFamily: K.serif, fontSize: "1.6rem", fontWeight: 900, color: K.tealDeep, margin: 0 }}>
                      {aM(estim!.p50!, esArr)}{esArr ? " /mes" : ""}
                    </p>
                    <p style={{ fontSize: 12.5, color: K.ink, margin: "6px 0 0" }}>
                      Rango de mercado: <strong>{aM(estim!.p25!, esArr)} – {aM(estim!.p75!, esArr)}</strong>
                    </p>
                    <p style={{ fontSize: 11, color: K.muted, marginTop: 6 }}>
                      Basado en {estim!.n} avisos reales {estim!.nivel === "comuna" ? "de la comuna" : "del barrio"}
                      {estim!.con_banda ? " con tamaño similar" : ""}. No es tasación oficial.
                    </p>
                  </div>
                ) : estimLoading && (m2Num >= 10 || habs !== null) ? (
                  <p style={{ color: K.muted, fontSize: 13, margin: "14px 0 0" }}>Calculando con avisos del mercado…</p>
                ) : m2Num >= 10 || habs !== null ? (
                  <p style={{ color: K.muted, fontSize: 13, margin: "14px 0 0" }}>Pocos avisos para esta combinación — probá otro nº de habitaciones o quitá los m².</p>
                ) : (
                  <p style={{ color: K.muted, fontSize: 13, margin: "14px 0 0" }}>Ingresá los m² y/o las habitaciones para el estimado.</p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
