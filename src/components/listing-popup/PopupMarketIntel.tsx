import { useQuery } from "@tanstack/react-query";
import { Lock, TrendingDown } from "lucide-react";
import { apiFetch } from "@/lib/apiClient";
import { API_ENDPOINTS } from "@/config/api";
import { formatCOP, formatPct } from "@/lib/format";
import type { ApiListingDetail } from "@/lib/adapters";

const copShort = (n: number) => formatCOP(Math.round(n)).replace(" COP", "");

// Cap de cordura: yield_estimado sale de medianas cruzadas y a veces da >30% — no mostrarlo.
const YIELD_CAP = 25;

// Same shape/queryKey as ListingDrawer's BarrioReport → shared cache.
type BarrioFetch = {
  conectividad?: { dist_metro_km?: number | null; indice_nomada?: number | null } | null;
};

type Row = { label: string; value: string };

/** "Inteligencia de mercado" — realtor-only block. Renders nothing when no metric
 *  has a value. Visually set apart (teal border + "Solo realtor" badge). */
export function PopupMarketIntel({ detail }: { detail: ApiListingDetail }) {
  const barrioId = detail.barrio_id;
  const { data: barrio } = useQuery<BarrioFetch>({
    queryKey: ["barrio-full", barrioId ?? 0],
    queryFn: () => apiFetch<BarrioFetch>(API_ENDPOINTS.barrio(barrioId!)),
    enabled: barrioId != null,
    staleTime: 300_000,
  });

  const rows: Row[] = [];
  const score = (label: string, v?: number | null) => {
    if (v != null) rows.push({ label, value: `${Math.round(v)}/100` });
  };

  // Oportunidad (server-gated: solo llega si el backend te consideró agente)
  if (detail.pct_bajo_mediana != null && detail.pct_bajo_mediana > 0) {
    rows.push({ label: "Bajo la mediana del barrio", value: formatPct(detail.pct_bajo_mediana) });
  }
  if (detail.yield_estimado != null && detail.yield_estimado > 0 && detail.yield_estimado <= YIELD_CAP) {
    rows.push({ label: "Yield estimado", value: formatPct(detail.yield_estimado) });
  }
  if (detail.yield_bruto_pct != null) {
    rows.push({ label: "Yield del barrio", value: formatPct(detail.yield_bruto_pct) });
  }

  // Scores de barrio
  score("Liquidez", detail.liquidez_score);
  score("Seguridad", detail.seguridad_score);
  score("Score corto plazo", detail.score_corto);
  score("Score mediano plazo", detail.score_mediano);
  score("Score largo plazo", detail.score_largo);
  if (detail.var_anual_pct != null) {
    rows.push({ label: "Valorización anual", value: formatPct(detail.var_anual_pct) });
  }
  if (detail.indice_nomada != null) {
    rows.push({ label: "Índice nómada", value: `${Math.round(detail.indice_nomada)}/100` });
  }

  // Mercado del barrio
  if (detail.precio_m2_mediana_barrio != null) {
    rows.push({ label: "Precio m² mediano", value: `${copShort(detail.precio_m2_mediana_barrio)}/m²` });
  }
  if (detail.tipo_operacion === "venta" && detail.precio_m2_p25 != null && detail.precio_m2_p75 != null) {
    rows.push({ label: "Rango m² barrio", value: `${copShort(detail.precio_m2_p25)} – ${copShort(detail.precio_m2_p75)}` });
  }
  if (detail.tipo_operacion === "arriendo" && detail.arr_p25 != null && detail.arr_p75 != null) {
    rows.push({ label: "Rango arriendo barrio", value: `${copShort(detail.arr_p25)} – ${copShort(detail.arr_p75)}` });
  }
  if (detail.arriendo_p50_barrio != null) {
    rows.push({ label: "Canon típico del barrio", value: copShort(detail.arriendo_p50_barrio) });
  }

  // POIs — hoy solo dist. al metro (viene de /barrios/{id}).
  // TODO(POIs): parque/mall/universidades cuando el API exponga barrios_pois_distancia completo.
  const distMetro = barrio?.conectividad?.dist_metro_km;
  if (distMetro != null) {
    rows.push({ label: "Distancia al metro", value: `${distMetro.toFixed(1)} km` });
  }

  const buenaOferta = detail.buena_oferta === true;
  const matchLabel = detail.match_label;

  if (rows.length === 0 && !buenaOferta && !matchLabel) return null;

  return (
    <section className="space-y-1.5" aria-label="Inteligencia de mercado">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold" style={{ color: "#1A1208" }}>Inteligencia de mercado</h3>
        <span
          className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold text-white"
          style={{ background: "#085041" }}
        >
          <Lock className="h-2.5 w-2.5" /> Solo realtor
        </span>
      </div>

      <div className="overflow-hidden rounded-lg" style={{ border: "1px solid #1D9E75", background: "#FFFFFF" }}>
        {buenaOferta && (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold"
            style={{ background: "#E1F5EE", color: "#085041" }}
          >
            <TrendingDown className="h-3.5 w-3.5 shrink-0" /> Buena oferta — bajo la mediana del barrio
          </div>
        )}
        {matchLabel && (
          <div className="px-2.5 pt-1.5 text-[11px] font-semibold" style={{ color: "#085041" }}>
            {matchLabel}
            {detail.match_razones && detail.match_razones.length > 0 && (
              <span className="block font-normal" style={{ color: "#6B5B45" }}>
                {detail.match_razones.join(" · ")}
              </span>
            )}
          </div>
        )}
        <div className="px-2.5 py-1">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-2 py-1 text-[11px]">
              <span style={{ color: "#6B5B45" }}>{r.label}</span>
              <span className="font-semibold tabular-nums" style={{ color: "#1A1208" }}>{r.value}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
