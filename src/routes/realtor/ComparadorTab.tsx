import { useState } from "react";
import { useBarriosComunas, useBarriosPorComuna, useComparar } from "@/hooks/useBarrios";
import { useMisListings } from "@/hooks/useRealtorDashboard";
import { useComparadorStore } from "@/hooks/useComparadorStore";
import { TabInmuebles } from "@/routes/comparador";
import type { Neighborhood } from "@/lib/adapters";
import type { MiListing } from "@/lib/realtorApi";
import { C, fmt, fmtCOP, Card } from "./_kit";

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
  { key: "precio", label: "Precio / m²", grupo: "zona", get: (n) => n.precio_m2 ?? null, fmtVal: (v) => fmtCOP(v), higherBetter: false },
  { key: "arr", label: "Arriendo típico", grupo: "zona", get: (n) => n.arriendo ?? null, fmtVal: (v) => fmtCOP(v), higherBetter: false },
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
      <div className="rounded-xl p-3" style={{ background: C.card, border: `1px solid ${C.line}` }}>
        <div className="mb-2 text-[11px] font-semibold tracking-tight" style={{ color: C.ink }}>{label}</div>
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
          className="rounded-lg px-4 py-1.5 text-[13px] font-semibold transition-colors"
          style={value === id ? { background: C.brand, color: "#fff" } : { color: C.sub }}>
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

function BarrioCompare() {
  const [comuna, setComuna] = useState<string | null>(null);
  const [sel, setSel] = useState<{ id: number; nombre: string }[]>([]);
  const { data: comunas } = useBarriosComunas();
  const { data: barrios } = useBarriosPorComuna(comuna);
  const { data: comp } = useComparar(sel.map((s) => s.id));

  const add = (id: number, nombre: string) => {
    if (sel.length >= 4 || sel.some((s) => s.id === id)) return;
    setSel([...sel, { id, nombre }]);
  };
  const remove = (id: number) => setSel(sel.filter((s) => s.id !== id));

  return (
    <div className="flex flex-col gap-5">
      <Card title="Compara barrios (hasta 4)">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: C.muted }}>Comuna</span>
            <select className="rounded-xl border bg-white px-3 py-2 text-[13px]" style={{ borderColor: C.line, color: C.ink }}
              value={comuna ?? ""} onChange={(e) => setComuna(e.target.value || null)}>
              <option value="">Elige comuna…</option>
              {(comunas ?? []).map((c) => <option key={c.key} value={c.key}>{c.label} · {c.municipio}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: C.muted }}>Agregar barrio</span>
            <select className="rounded-xl border bg-white px-3 py-2 text-[13px]" style={{ borderColor: C.line, color: C.ink }} disabled={!comuna}
              value="" onChange={(e) => { const b = (barrios ?? []).find((x) => x.id === Number(e.target.value)); if (b) add(b.id, b.nombre); }}>
              <option value="">Elige barrio…</option>
              {(barrios ?? []).filter((b) => !sel.some((s) => s.id === b.id)).map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
            </select>
          </label>
        </div>
        {sel.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {sel.map((s, i) => (
              <span key={s.id} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-semibold text-white"
                style={{ background: C.cat[i % C.cat.length] }}>
                {s.nombre}
                <button onClick={() => remove(s.id)} className="opacity-80 hover:opacity-100">✕</button>
              </span>
            ))}
          </div>
        )}
      </Card>

      {sel.length < 2 ? (
        <div className="rounded-2xl px-5 py-10 text-center text-[13px]" style={{ background: C.card, border: `1px solid ${C.line}`, color: C.muted }}>
          Agrega al menos 2 barrios para comparar.
        </div>
      ) : comp && comp.length > 0 ? (
        <div className="flex flex-col gap-6">
          {GRUPOS.map((g) => (
            <div key={g.id}>
              <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide" style={{ color: C.muted }}>{g.label}</div>
              <div className="grid gap-4 sm:grid-cols-2">
                {METRICS.filter((m) => m.grupo === g.id).map((m) => (
                  <MetricCard key={m.key} label={m.label} higherBetter={m.higherBetter} fmtVal={m.fmtVal}
                    vals={comp.map((n) => ({ nombre: n.nombre, v: m.get(n) }))} />
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

type LMetric = { key: string; label: string; get: (l: MiListing) => number | null; fmtVal: (v: number) => string; higherBetter: boolean };
const MIS_METRICS: LMetric[] = [
  { key: "precio", label: "Precio", get: (l) => l.precio ?? null, fmtVal: (v) => fmtCOP(v), higherBetter: false },
  { key: "m2", label: "Precio / m²", get: (l) => (l.area_m2 && l.precio ? Math.round(l.precio / l.area_m2) : null), fmtVal: (v) => fmtCOP(v), higherBetter: false },
  { key: "area", label: "Área", get: (l) => l.area_m2 ?? null, fmtVal: (v) => `${fmt(v)} m²`, higherBetter: true },
  { key: "hab", label: "Habitaciones", get: (l) => l.habitaciones ?? null, fmtVal: (v) => `${v}`, higherBetter: true },
  { key: "banos", label: "Baños", get: (l) => l.banos ?? null, fmtVal: (v) => `${v}`, higherBetter: true },
  { key: "estrato", label: "Estrato", get: (l) => l.estrato ?? null, fmtVal: (v) => `${v}`, higherBetter: true },
  { key: "vistas", label: "Vistas", get: (l) => l.vistas_total ?? null, fmtVal: (v) => `${v}`, higherBetter: true },
  { key: "favs", label: "Favoritos", get: (l) => l.favoritos ?? null, fmtVal: (v) => `${v}`, higherBetter: true },
];

function MisListingsCompare() {
  const { data: listings = [], isLoading } = useMisListings();
  const [selIds, setSelIds] = useState<string[]>([]);
  const toggle = (id: string) =>
    setSelIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 5 ? prev : [...prev, id]);
  const sel = listings.filter((l) => selIds.includes(l.id));

  if (isLoading) return <div className="py-10 text-center text-[13px]" style={{ color: C.muted }}>Cargando tus listings…</div>;
  if (listings.length === 0)
    return (
      <div className="rounded-2xl px-5 py-10 text-center text-[13px]" style={{ background: C.card, border: `1px solid ${C.line}`, color: C.muted }}>
        Aún no tienes listings publicados para comparar.
      </div>
    );

  return (
    <div className="flex flex-col gap-5">
      <Card title="Elige tus listings (2 a 5)">
        <div className="flex flex-wrap gap-2">
          {listings.map((l) => {
            const on = selIds.includes(l.id);
            const dis = !on && selIds.length >= 5;
            return (
              <button key={l.id} onClick={() => toggle(l.id)} disabled={dis}
                className="rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors"
                style={on ? { background: C.brand, color: "#fff" } : { background: C.soft, color: C.sub, border: `1px solid ${C.line}`, opacity: dis ? 0.4 : 1 }}
                title={l.titulo}>
                {l.titulo.length > 28 ? l.titulo.slice(0, 28) + "…" : l.titulo}
              </button>
            );
          })}
        </div>
      </Card>

      {sel.length < 2 ? (
        <div className="rounded-2xl px-5 py-10 text-center text-[13px]" style={{ background: C.card, border: `1px solid ${C.line}`, color: C.muted }}>
          Selecciona al menos 2 de tus listings para comparar.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {MIS_METRICS.map((m) => (
            <MetricCard key={m.key} compact label={m.label} higherBetter={m.higherBetter} fmtVal={m.fmtVal}
              vals={sel.map((l) => ({ nombre: l.titulo, v: m.get(l) }))} />
          ))}
        </div>
      )}
    </div>
  );
}
