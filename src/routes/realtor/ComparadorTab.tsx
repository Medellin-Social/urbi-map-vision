import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBarriosComunas, useBarriosPorComuna, useComparar } from "@/hooks/useBarrios";
import { useMisListings } from "@/hooks/useRealtorDashboard";
import { useComparadorStore } from "@/hooks/useComparadorStore";
import { apiFetch } from "@/lib/apiClient";
import { API_ENDPOINTS } from "@/config/api";
import { TabInmuebles, ComparisonTable, type ComparadorListing } from "@/routes/comparador";
import type { Neighborhood } from "@/lib/adapters";
import { C, fmtCOP, fmtCOPd, Card } from "./_kit";

type Metric = {
  key: string; label: string; grupo: "negocio" | "zona"; get: (n: Neighborhood) => number | null;
  fmtVal: (v: number) => string; higherBetter: boolean;
};
const km = (v: number) => (v < 1 ? `${Math.round(v * 1000)} m` : `${v.toFixed(1)} km`);
const METRICS: Metric[] = [
  // 💰 Negocio (lo que el realtor vende al inversionista)
  { key: "yield", label: "Yield bruto", grupo: "negocio", get: (n) => n.yield ?? null, fmtVal: (v) => `${v.toFixed(1)}%`, higherBetter: true },
  { key: "yieldrm", label: "Yield renta media", grupo: "negocio", get: (n) => n.yield_renta_media_pct ?? null, fmtVal: (v) => `${v.toFixed(1)}%`, higherBetter: true },
  { key: "recupero", label: "Años de recupero", grupo: "negocio", get: (n) => n.anos_recupero ?? null, fmtVal: (v) => `${v.toFixed(0)} años`, higherBetter: false },
  { key: "valanual", label: "Valorización anual", grupo: "negocio", get: (n) => n.valorizacion_api?.var_anual_pct ?? null, fmtVal: (v) => `+${v.toFixed(1)}%`, higherBetter: true },
  { key: "val5", label: "Proyección 5 años", grupo: "negocio", get: (n) => n.valorizacion_api?.proyeccion_5anos_pct ?? null, fmtVal: (v) => `+${v.toFixed(0)}%`, higherBetter: true },
  { key: "liq", label: "Liquidez", grupo: "negocio", get: (n) => n.liquidez_api?.score ?? null, fmtVal: (v) => `${Math.round(v)}/100`, higherBetter: true },
  // 📍 Precio & zona (público — lo que ya ven todos)
  { key: "precio", label: "Precio / m²", grupo: "zona", get: (n) => n.precio_m2 ?? null, fmtVal: (v) => fmtCOPd(v), higherBetter: false },
  { key: "arr", label: "Arriendo típico", grupo: "zona", get: (n) => n.arriendo ?? null, fmtVal: (v) => fmtCOPd(v), higherBetter: false },
  { key: "seg", label: "Seguridad", grupo: "zona", get: (n) => n.seguridad_score ?? null, fmtVal: (v) => `${Math.round(v)}/100`, higherBetter: true },
  { key: "verde", label: "Zonas verdes", grupo: "zona", get: (n) => n.verde_pct ?? null, fmtVal: (v) => `${v.toFixed(1)}%`, higherBetter: true },
  { key: "metro", label: "Dist. al metro", grupo: "zona", get: (n) => n.dist_metro ?? null, fmtVal: km, higherBetter: false },
  { key: "estrato", label: "Estrato", grupo: "zona", get: (n) => n.estrato ?? null, fmtVal: (v) => `${v}`, higherBetter: true },
];
const GRUPOS: { id: "negocio" | "zona"; label: string }[] = [
  { id: "negocio", label: "💰 Rentabilidad & negocio" },
  { id: "zona", label: "📍 Precio & zona" },
];

// Una métrica con barras por ítem; reusada en barrio y mis-listings.
// compact = caja más chica (menos padding, barras finas) para mis-listings.
function MetricCard({ label, vals, fmtVal, higherBetter, compact }: {
  label: string; vals: { nombre: string; v: number | null }[]; fmtVal: (v: number) => string; higherBetter: boolean; compact?: boolean;
}) {
  const nums = vals.map((x) => x.v).filter((x): x is number => x != null);
  const max = Math.max(...nums, 1);
  const best = nums.length ? (higherBetter ? Math.max(...nums) : Math.min(...nums)) : null;
  const rows = (
    <div className="flex flex-col gap-1.5">
      {vals.map((x, i) => {
        const w = x.v == null ? 0 : Math.max(5, (x.v / max) * 100);
        const isBest = x.v != null && x.v === best;
        return (
          <div key={i} className="flex items-center gap-2">
            <div className={`${compact ? "w-16 text-[10.5px]" : "w-24 text-[11.5px]"} shrink-0 truncate`} style={{ color: C.sub }} title={x.nombre}>{x.nombre}</div>
            <div className={`${compact ? "h-4" : "h-6"} flex-1 overflow-hidden rounded`} style={{ background: C.soft }}>
              <div className="h-full rounded" style={{ width: `${w}%`, background: C.cat[i % C.cat.length], opacity: isBest ? 1 : 0.55 }} />
            </div>
            <div className={`${compact ? "w-16 text-[11px]" : "w-24 text-[12px]"} shrink-0 text-right font-semibold tabular-nums`} style={{ color: isBest ? C.brand : C.ink }}>
              {x.v == null ? "—" : fmtVal(x.v)}{isBest && " ★"}
            </div>
          </div>
        );
      })}
    </div>
  );
  if (compact) {
    return (
      <div className="rounded-xl p-3.5" style={{ background: C.card, border: `1px solid ${C.line}`, boxShadow: "0 6px 16px -10px rgba(17,20,24,.25), 0 1px 2px rgba(17,20,24,.04)" }}>
        <div className="mb-2.5 text-[11px] font-semibold tracking-tight" style={{ color: C.ink }}>{label}</div>
        {rows}
      </div>
    );
  }
  return <Card title={label}>{rows}</Card>;
}

function Pills<T extends string>({ value, onChange, items }: {
  value: T; onChange: (v: T) => void; items: readonly (readonly [T, string])[];
}) {
  return (
    <div className="inline-flex gap-1 rounded-xl p-1 self-start" style={{ background: C.soft, border: `1px solid ${C.line}` }}>
      {items.map(([id, label]) => (
        <button key={id} onClick={() => onChange(id)}
          className="rounded-lg px-6 py-2 text-[13px] font-semibold transition"
          style={value === id ? { background: C.brand, color: "#fff", boxShadow: "0 3px 10px -2px rgba(15,138,79,.35)" } : { color: C.sub }}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function ComparadorTab() {
  // Si vienen listings seleccionados del mapa (store), abrir directo en Por listing.
  const fromMap = useComparadorStore().listings.length > 0;
  const [modo, setModo] = useState<"barrio" | "listing">(fromMap ? "listing" : "barrio");
  return (
    <div className="flex flex-col gap-5">
      <Pills value={modo} onChange={setModo} items={[["barrio", "Por barrio"], ["listing", "Por listing"]] as const} />
      {modo === "barrio" ? <BarrioCompare /> : <ListingCompare />}
    </div>
  );
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

function BarrioCompare() {
  const [comuna, setComuna] = useState<string | null>(null);
  const [sel, setSel] = useState<{ id: number; nombre: string }[]>([]);
  const [q, setQ] = useState("");
  const { data: comunas } = useBarriosComunas();
  const { data: barrios } = useBarriosPorComuna(comuna);
  const { data: comp } = useComparar(sel.map((s) => s.id));

  const add = (id: number, nombre: string) => {
    if (sel.length >= 4 || sel.some((s) => s.id === id)) return;
    setSel([...sel, { id, nombre }]);
  };
  const remove = (id: number) => setSel(sel.filter((s) => s.id !== id));

  // Fuera polígonos-placeholder que no son barrios reales ("AREA EN DESARROLLO",
  // "AREAS SIN DESARROLLAR", "SIN NOMBRE") — ruido para el realtor.
  const all = (barrios ?? []).filter((b) => !/desarroll|sin nombre/i.test(b.nombre));
  const shown = q.trim() ? all.filter((b) => norm(b.nombre).includes(norm(q))) : all;

  return (
    <div className="flex flex-col gap-5">
      <Card title="Compara barrios (hasta 4)">
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: C.muted }}>Comuna</span>
            <select className="w-full rounded-xl border bg-white px-3 py-2.5 text-[13px] sm:w-80" style={{ borderColor: C.line, color: C.ink }}
              value={comuna ?? ""} onChange={(e) => { setComuna(e.target.value || null); setQ(""); }}>
              <option value="">Elige comuna…</option>
              {(comunas ?? []).map((c) => <option key={c.key} value={c.key}>{c.label} · {c.municipio}</option>)}
            </select>
          </label>

          {comuna && (
            <div className="flex flex-col gap-2">
              <span data-i18n-skip className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: C.muted }}>
                Toca los barrios a comparar {sel.length > 0 && `· ${sel.length}/4`}
              </span>
              {all.length > 12 && (
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar barrio…"
                  className="w-full rounded-lg border bg-white px-3 py-2 text-[13px] sm:w-72"
                  style={{ borderColor: C.line, color: C.ink }} />
              )}
              <div className="flex max-h-56 flex-wrap gap-2 overflow-y-auto">
                {shown.map((b) => {
                  const i = sel.findIndex((s) => s.id === b.id);
                  const on = i >= 0;
                  const dis = !on && sel.length >= 4;
                  const col = on ? C.cat[i % C.cat.length] : null;
                  return (
                    <button key={b.id} type="button" disabled={dis}
                      onClick={() => (on ? remove(b.id) : add(b.id, b.nombre))}
                      className="inline-flex h-fit items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition disabled:cursor-not-allowed"
                      style={on
                        ? { background: col!, color: "#fff", boxShadow: `0 3px 10px -3px ${col}66` }
                        : { background: C.soft, color: C.sub, border: `1px solid ${C.line}`, opacity: dis ? 0.4 : 1 }}>
                      {on && <span className="grid h-4 w-4 place-items-center rounded-full text-[10px] font-bold" style={{ background: "rgba(255,255,255,.3)" }}>{i + 1}</span>}
                      {b.nombre}
                    </button>
                  );
                })}
                {all.length === 0 && (
                  <span className="text-[12px]" style={{ color: C.muted }}>Cargando barrios…</span>
                )}
                {all.length > 0 && shown.length === 0 && (
                  <span className="text-[12px]" style={{ color: C.muted }}>Sin resultados para “{q}”.</span>
                )}
              </div>
            </div>
          )}

          {sel.length > 0 && (
            <div className="flex flex-col gap-1.5 border-t pt-3" style={{ borderColor: C.line }}>
              <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: C.muted }}>Comparando</span>
              <div className="flex flex-wrap gap-2">
                {sel.map((s, i) => (
                  <span key={s.id} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-semibold text-white"
                    style={{ background: C.cat[i % C.cat.length] }}>
                    {s.nombre}
                    <button type="button" onClick={() => remove(s.id)} className="opacity-80 transition hover:opacity-100" aria-label={`Quitar ${s.nombre}`}>✕</button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      {sel.length < 2 ? (
        <div className="rounded-2xl px-5 py-10 text-center text-[13px]" style={{ background: C.card, border: `1px solid ${C.line}`, color: C.muted }}>
          Agrega al menos 2 barrios para comparar.
        </div>
      ) : comp && comp.length > 0 ? (
        <div className="flex flex-col gap-6">
          <RentaCortaPotCard sel={sel} comp={comp} />
          {GRUPOS.map((g) => (
            <div key={g.id}>
              <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide" style={{ color: C.muted }}>{g.label}</div>
              <div className="grid gap-4 sm:grid-cols-2">
                {METRICS.filter((m) => m.grupo === g.id).map((m) => (
                  <MetricCard key={m.key} label={m.label} higherBetter={m.higherBetter} fmtVal={m.fmtVal}
                    vals={sel.map((s) => { const n = comp.find((x) => x.id === s.id); return { nombre: s.nombre, v: n ? m.get(n) : null }; })} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-10 text-center text-[13px]" style={{ color: C.muted }}>Cargando comparación…</div>
      )}
    </div>
  );
}

// Renta corta (Airbnb) según nuevo POT: permitido solo en barrios con suelo de
// alta/media mixtura (Medellín). Grano legal real es por predio — de ahí el caveat.
function RentaCortaPotCard({ sel, comp }: {
  sel: { id: number; nombre: string }[];
  comp: Neighborhood[];
}) {
  const verdict = (apto?: boolean | null) =>
    apto === true ? { txt: "✓ Permitido", col: C.brand }
    : apto === false ? { txt: "✗ No permitido", col: C.bad }
    : { txt: "— Sin dato POT", col: C.muted };
  return (
    <Card title="⚖️ Renta corta / Airbnb — nuevo POT">
      <div className="flex flex-col gap-1.5">
        {sel.map((s, i) => {
          const n = comp.find((x) => x.id === s.id);
          const v = verdict(n?.apto_renta_corta);
          return (
            <div key={s.id} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: C.cat[i % C.cat.length] }} />
              <span className="flex-1 truncate text-[12.5px]" style={{ color: C.sub }}>{s.nombre}</span>
              <span className="shrink-0 text-[12px] font-semibold tabular-nums" style={{ color: v.col }}>{v.txt}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed" style={{ color: C.muted }}>
        El POT solo permite renta corta en predios de alta/media mixtura, no en todo el barrio.
        "Permitido" = el barrio tiene zonas aptas; confirma la dirección exacta + RNT + autorización
        de la copropiedad (PH).
      </p>
    </Card>
  );
}

function ListingCompare() {
  // "se pregunta": mis listings vs cualquier listing (este último vía mapa → store).
  const fromMap = useComparadorStore().listings.length > 0;
  const [fuente, setFuente] = useState<"mios" | "cualquiera">(fromMap ? "cualquiera" : "mios");
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="mb-2 text-[13px]" style={{ color: C.sub }}>¿Qué listings quieres comparar?</p>
        <Pills value={fuente} onChange={setFuente}
          items={[["mios", "Mis listings"], ["cualquiera", "Cualquier listing"]] as const} />
      </div>
      {fuente === "mios" ? <MisListingsCompare /> : <TabInmuebles />}
    </div>
  );
}

function MisListingsCompare() {
  const { data: all = [], isLoading } = useMisListings();
  // Solo publicados: son los que viven en staging y por tanto tienen las métricas
  // enriquecidas (yield/seguridad/%mediana). Un borrador/pausado no está en el mapa.
  const listings = all.filter((l) => l.estado === "publicado");
  const [selIds, setSelIds] = useState<string[]>([]);
  const toggle = (id: string) =>
    setSelIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 5 ? prev : [...prev, id]);
  const sel = listings.filter((l) => selIds.includes(l.id));

  // Misma tabla enriquecida que "Cualquier listing": el backend resuelve los UUID
  // propios por url (= id del listing). Sin Ver/Quitar — el id es hash del url, no abre
  // /listing/$id, y la selección se maneja arriba con las tarjetas.
  const { data: enriched = [], isFetching } = useQuery<ComparadorListing[]>({
    queryKey: ["mis-listings-comparar", selIds],
    queryFn: () => apiFetch(API_ENDPOINTS.comparadorListings(selIds.join(","))),
    enabled: selIds.length >= 2,
    staleTime: 120_000,
    placeholderData: (p) => p,
  });
  // Mismo orden que las tarjetas (por selección): el backend devuelve en orden
  // arbitrario; para un propio, su `url` === el UUID seleccionado.
  const ordered = selIds.map((id) => enriched.find((e) => e.url === id)).filter(Boolean) as ComparadorListing[];

  if (isLoading) return <div className="py-10 text-center text-[13px]" style={{ color: C.muted }}>Cargando tus listings…</div>;
  if (listings.length === 0)
    return (
      <div className="rounded-2xl px-5 py-10 text-center text-[13px]" style={{ background: C.card, border: `1px solid ${C.line}`, color: C.muted }}>
        Aún no tienes listings publicados para comparar.
      </div>
    );

  return (
    <div className="flex flex-col gap-5">
      <Card title={`Elige tus listings (2 a 5)${sel.length > 0 ? ` · ${sel.length}/5` : ""}`}>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {listings.map((l) => {
            const i = sel.findIndex((s) => s.id === l.id);
            const on = i >= 0;
            const dis = !on && selIds.length >= 5;
            const col = on ? C.cat[i % C.cat.length] : null;
            return (
              <button key={l.id} type="button" onClick={() => toggle(l.id)} disabled={dis}
                className="relative flex items-center gap-2.5 rounded-xl p-2 text-left transition disabled:cursor-not-allowed"
                style={{
                  background: C.card,
                  border: `1.5px solid ${on ? col! : C.line}`,
                  opacity: dis ? 0.45 : 1,
                  boxShadow: on ? `0 6px 16px -8px ${col}66` : "0 1px 2px rgba(17,20,24,.05)",
                }}
                title={l.titulo}>
                <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg" style={{ background: C.soft }}>
                  {l.cover_url
                    ? <img src={l.cover_url} alt="" className="h-full w-full object-cover" />
                    : <div className="grid h-full w-full place-items-center text-base">🏠</div>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-semibold leading-tight" style={{ color: C.ink }}>{l.titulo}</div>
                  <div className="mt-0.5 truncate text-[11px] font-semibold tabular-nums" style={{ color: on ? col! : C.sub }}>
                    {fmtCOP(l.precio)}{l.operacion === "arriendo" ? "/mes" : ""}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-[10.5px]" style={{ color: C.muted }}>
                    <span className="shrink-0 rounded px-1 py-px text-[9px] font-bold uppercase tracking-wide" style={{ background: C.soft, color: C.sub }}>
                      {l.operacion === "arriendo" ? "Arriendo" : "Venta"}
                    </span>
                    <span className="truncate">{l.barrio}</span>
                  </div>
                </div>
                {on && (
                  <span className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: col!, boxShadow: "0 1px 3px rgba(0,0,0,.25)" }}>
                    {i + 1}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      {sel.length < 2 ? (
        <div className="rounded-2xl px-5 py-10 text-center text-[13px]" style={{ background: C.card, border: `1px solid ${C.line}`, color: C.muted }}>
          Selecciona al menos 2 de tus listings para comparar.
        </div>
      ) : ordered.length >= 2 ? (
        <ComparisonTable listings={ordered} />
      ) : isFetching ? (
        <div className="py-10 text-center text-[13px]" style={{ color: C.muted }}>Cargando comparación…</div>
      ) : (
        <div className="rounded-2xl px-5 py-10 text-center text-[13px]" style={{ background: C.card, border: `1px solid ${C.line}`, color: C.muted }}>
          Estos listings aún no aparecen en el mapa para comparar. Espera unos minutos tras publicar e inténtalo de nuevo.
        </div>
      )}
    </div>
  );
}
