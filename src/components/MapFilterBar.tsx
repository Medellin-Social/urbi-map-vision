import { useState, useRef, useEffect, useMemo, useCallback } from "react";

function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
import {
  ChevronDown, X, SlidersHorizontal, Search,
  UtensilsCrossed, Wind, WashingMachine,
  ArrowUpDown, Building2, Users, Dumbbell, Waves, Car, DoorClosed,
  Shield, Camera, Trees, Baby, TrainFront, Sofa,
} from "lucide-react";
import { useIsPro } from "@/components/LockedField";
import { useLang } from "@/lib/i18n";
import { useTrm } from "@/hooks/useTrm";
import type { MapTab } from "./MapNavbar";
import type { BarrioOption } from "@/lib/adapters";

// ─── Shared filter state (lifted to map.tsx, passed down to both FilterBar and MLSPanel) ────
export type SharedFilters = {
  tipoOp: "todos" | "venta" | "arriendo";
  precioMin: number | null;
  precioMax: number | null;
  habitaciones: number | null;
  tipoInmueble: string | null;
  areaMin: number | null;
  areaMax: number | null;
  banos: number | null;
  antiguedad: string | null;
  estrato: number[] | null;
  diasMercado: "nuevo" | "reciente" | "demorado" | "mas30" | "mas60" | null;
  amenidades: string[] | null;
  amoblado: boolean | null;
  busqueda: string | null;
};

export const EMPTY_SHARED_FILTERS: SharedFilters = {
  tipoOp: "todos",
  precioMin: null,
  precioMax: null,
  habitaciones: null,
  tipoInmueble: null,
  areaMin: null,
  areaMax: null,
  banos: null,
  antiguedad: null,
  estrato: null,
  diasMercado: null,
  amenidades: null,
  amoblado: null,
  busqueda: null,
};

export const TAB_TIPO_OP: Record<MapTab, "venta" | "arriendo" | "todos"> = {
  buy:        "venta",
  rent:       "arriendo",
  sell:       "todos",
  agent:      "todos",
  simulator:  "todos",
  comparador: "todos",
};

// ─── Component ───────────────────────────────────────────────────────────────

type MapFilterBarProps = {
  activeTab: MapTab;
  filters: SharedFilters;
  onFiltersChange: (f: Partial<SharedFilters>) => void;
  onResetAll?: () => void;
  allBarrios?: BarrioOption[];
  onBarrioNavigate?: (opt: BarrioOption) => void;
  onBarrioClear?: () => void;
  onSearchAll?: () => void;
  hasActiveScope?: boolean;
  // Cascader Comuna → Barrio (entre buscador y precio)
  activeComunaCd?: number | null;
  activeMunicipio?: string | null;
  onComunaSelect?: (cd: number | null, nombre: string | null, municipio?: string | null) => void;
};

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|\s|-)\p{L}/gu, (c) => c.toUpperCase());
}

type ComunaGroup = { cd: number | null; nombre: string; municipio?: string; barrios: BarrioOption[] };
function groupComunas(allBarrios?: BarrioOption[]): ComunaGroup[] {
  const m = new Map<number, ComunaGroup>();
  for (const b of allBarrios ?? []) {
    if (b.cd_comuna == null || !b.comuna) continue;
    let g = m.get(b.cd_comuna);
    if (!g) { g = { cd: b.cd_comuna, nombre: b.comuna, barrios: [] }; m.set(b.cd_comuna, g); }
    g.barrios.push(b);
  }
  return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
}
function groupMunicipios(allBarrios?: BarrioOption[]): ComunaGroup[] {
  const m = new Map<string, ComunaGroup>();
  for (const b of allBarrios ?? []) {
    if (b.cd_comuna != null) continue; // Medellín barrios have cd_comuna
    const mun = b.municipio?.toUpperCase();
    if (!mun || mun === "MEDELLÍN" || mun === "MEDELLIN" || mun === "—") continue;
    if (!m.has(mun)) m.set(mun, { cd: null, nombre: mun, municipio: mun, barrios: [] });
    m.get(mun)!.barrios.push(b);
  }
  return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
}

/** Filtro cascada: Todo → comunas Medellín / municipios Valle de Aburrá → barrio. */
function ZonaCascader({ allBarrios, activeComunaCd, activeMunicipio, onComunaSelect, onBarrioNavigate }: {
  allBarrios?: BarrioOption[];
  activeComunaCd?: number | null;
  activeMunicipio?: string | null;
  onComunaSelect?: (cd: number | null, nombre: string | null, municipio?: string | null) => void;
  onBarrioNavigate?: (opt: BarrioOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) &&
          !(e.target as Element)?.closest?.("[data-zona-dropdown]")) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const comunas = useMemo(() => groupComunas(allBarrios), [allBarrios]);
  const municipioGroups = useMemo(() => groupMunicipios(allBarrios), [allBarrios]);

  const active: ComunaGroup | null =
    activeComunaCd != null ? (comunas.find((c) => c.cd === activeComunaCd) ?? null) :
    activeMunicipio ? (municipioGroups.find((m) => m.municipio === activeMunicipio) ?? null) :
    null;
  const isSelected = !!active || !!activeMunicipio;
  const label = active ? titleCase(active.nombre) : activeMunicipio ? titleCase(activeMunicipio) : "Toda la ciudad";

  const openIt = () => { setRect(ref.current?.getBoundingClientRect() ?? null); setOpen((o) => !o); };

  const itemStyle = (sel = false): React.CSSProperties => ({
    display: "block", width: "100%", textAlign: "left", background: sel ? "#E1F5EE" : "none",
    border: "none", cursor: "pointer", padding: "8px 12px", fontSize: 13,
    color: sel ? "#085041" : C.ink, borderRadius: 8, fontWeight: sel ? 600 : 400,
  });

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        ref={ref}
        onClick={openIt}
        style={{
          display: "flex", alignItems: "center", gap: 5, height: 32, padding: "0 11px",
          border: `1px solid ${isSelected ? C.teal : C.border}`, borderRadius: 8,
          background: isSelected ? "#E1F5EE" : C.white, color: isSelected ? C.tealDeep : C.ink,
          fontSize: 12, fontWeight: isSelected ? 600 : 500, cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        {label}
        <ChevronDown size={13} style={{ opacity: 0.7 }} />
      </button>
      {open && rect && (
        <div
          data-zona-dropdown
          style={{
            position: "fixed", top: rect.bottom + 6, left: rect.left, zIndex: 200,
            width: 240, maxHeight: 340, overflowY: "auto",
            background: C.white, border: `1px solid ${C.border}`, borderRadius: 12,
            boxShadow: "0 12px 32px rgba(26,18,8,0.16)", padding: 6,
          }}
        >
          {!active ? (
            <>
              <button style={itemStyle(activeComunaCd == null && !activeMunicipio)} onClick={() => { onComunaSelect?.(null, null); setOpen(false); }}>
                Toda la ciudad
              </button>
              <div style={{ padding: "6px 12px 4px", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted }}>Comunas Medellín</div>
              {comunas.map((c) => (
                <button key={c.cd} style={itemStyle()} onClick={() => onComunaSelect?.(c.cd as number, c.nombre)}>
                  {titleCase(c.nombre)}
                </button>
              ))}
              {municipioGroups.length > 0 && (
                <>
                  <div style={{ padding: "6px 12px 4px", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted }}>Otros municipios</div>
                  {municipioGroups.map((g) => (
                    <button key={g.municipio} style={itemStyle()} onClick={() => onComunaSelect?.(null, g.nombre, g.municipio)}>
                      {titleCase(g.nombre)}
                    </button>
                  ))}
                </>
              )}
            </>
          ) : (
            <>
              <button
                onClick={() => onComunaSelect?.(null, null)}
                style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", padding: "6px 12px", fontSize: 12, fontWeight: 600, color: C.teal }}
              >
                ‹ {active.municipio ? "Municipios" : "Comunas"}
              </button>
              {/* "Toda la ciudad" siempre a 1 click, aun con comuna activa */}
              <button style={itemStyle()} onClick={() => { onComunaSelect?.(null, null); setOpen(false); }}>
                Toda la ciudad
              </button>
              <button style={itemStyle(true)} onClick={() => setOpen(false)}>
                Toda {titleCase(active.nombre)}
              </button>
              <div style={{ padding: "6px 12px 4px", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted }}>Barrios</div>
              {active.barrios.slice().sort((a, b) => a.nombre.localeCompare(b.nombre)).map((b) => (
                <button key={b.id} style={itemStyle()} onClick={() => { onBarrioNavigate?.(b); setOpen(false); }}>
                  {titleCase(b.nombre)}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const C = {
  white:    "#FFFFFF",
  teal:     "#1D9E75",
  tealDeep: "#085041",
  muted:    "#6B5B45",
  border:   "#E8E0D0",
  ink:      "#1A1208",
  coral:    "#D85A30",
  surface:  "#F5F0E8",
};

const TIPO_OPTIONS = [
  { value: "apartamento",   label: "Apartamento" },
  { value: "casa",          label: "Casa" },
  { value: "apartaestudio", label: "Apartaestudio" },
  { value: "lote",          label: "Lote" },
  { value: "local",         label: "Local" },
  { value: "oficina",       label: "Oficina" },
  { value: "bodega",        label: "Bodega" },
];

type DropdownId = "precio" | "habBanos" | "tipo" | "filtros" | "amenidades";

function countActive(f: SharedFilters): number {
  let n = 0;
  if (f.precioMax !== null || f.precioMin !== null) n++;
  if (f.habitaciones !== null) n++;
  if (f.banos !== null) n++;
  if (f.tipoInmueble !== null) n++;
  if (f.areaMin !== null || f.areaMax !== null) n++;
  if (f.antiguedad !== null) n++;
  if (f.estrato !== null && f.estrato.length > 0) n++;
  if (f.diasMercado !== null) n++;
  if (f.amoblado !== null) n++;
  if (f.busqueda !== null) n++;
  return n;
}

// ─── FilterPill ───────────────────────────────────────────────────────────────

function FilterPill({
  label, active, onClear, onClick, isOpen,
}: {
  label: string;
  active: boolean;
  onClear?: () => void;
  onClick: (anchor: DOMRect) => void;
  isOpen: boolean;
}) {
  return (
    <button
      onClick={(e) => onClick(e.currentTarget.getBoundingClientRect())}
      style={{
        display: "flex", alignItems: "center", gap: 4,
        background: active ? C.teal : C.white,
        color: active ? "#fff" : C.ink,
        border: `1px solid ${active ? C.teal : C.border}`,
        borderRadius: 8, padding: "0 10px",
        height: 32, fontSize: 12, fontWeight: 500,
        cursor: "pointer", whiteSpace: "nowrap",
        outline: isOpen && !active ? `2px solid ${C.teal}` : "none",
        outlineOffset: 1,
        transition: "all 0.12s",
        flexShrink: 0,
      }}
    >
      <span>{label}</span>
      {active && onClear ? (
        <span
          role="button"
          onClick={(e) => { e.stopPropagation(); onClear(); }}
          style={{ marginLeft: 2, display: "flex", alignItems: "center", opacity: 0.85 }}
        >
          <X size={11} />
        </span>
      ) : (
        <ChevronDown
          size={11}
          style={{
            opacity: 0.55, marginLeft: 2,
            transform: isOpen ? "rotate(180deg)" : "none",
            transition: "transform 0.15s",
          }}
        />
      )}
    </button>
  );
}

// ─── Label helpers ────────────────────────────────────────────────────────────

// ARRIENDO: por valor — < $1M en K (700K), >= $1M en millones (1.5M).
function fmtCOPRent(v: number): string {
  if (v < 1_000_000) return `$${Math.round(v / 1_000)}K`;
  return `$${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

// VENTA: siempre en millones (nunca K); billones como B. <10M con 1 decimal.
function fmtCOPBuy(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (v < 10_000_000) return `$${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  return `$${Math.round(v / 1_000_000)}M`;
}

// USD label (own thresholds): <$1k exact, <$1M in k, >=$1M in M.
function fmtUSD(v: number): string {
  if (v < 1_000) return `$${Math.round(v)}`;
  if (v < 1_000_000) return `$${(v / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return `$${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

// Values are always COP internally; EN convierte el LABEL a USD. ES usa el
// formato según operación: venta → millones, arriendo → K/M por valor.
function fmtPrice(cop: number, lang: string, trm: number, isRent: boolean): string {
  if (lang === "en") return fmtUSD(cop / trm);
  return isRent ? fmtCOPRent(cop) : fmtCOPBuy(cop);
}

function precioLabel(f: SharedFilters, isRent: boolean, lang: string, trm: number): string {
  if (f.precioMin !== null && f.precioMax !== null)
    return `${fmtPrice(f.precioMin, lang, trm, isRent)} – ${fmtPrice(f.precioMax, lang, trm, isRent)}`;
  if (f.precioMax !== null) return `Hasta ${fmtPrice(f.precioMax, lang, trm, isRent)}`;
  if (f.precioMin !== null) return `Desde ${fmtPrice(f.precioMin, lang, trm, isRent)}`;
  return isRent ? "Precio/mes" : "Precio";
}

function habLabel(f: SharedFilters): string {
  if (f.habitaciones === null) return "Habitaciones";
  if (f.habitaciones === 4) return "4+ hab.";
  return `${f.habitaciones} hab.`;
}

function tipoLabel(f: SharedFilters): string {
  return TIPO_OPTIONS.find((o) => o.value === f.tipoInmueble)?.label ?? "Tipo";
}

function areaLabel(f: SharedFilters): string {
  if (f.areaMin !== null && f.areaMax !== null) return `${f.areaMin}–${f.areaMax} m²`;
  if (f.areaMax !== null) return `Hasta ${f.areaMax} m²`;
  if (f.areaMin !== null) return `Desde ${f.areaMin} m²`;
  return "Área";
}

function banosLabel(f: SharedFilters): string {
  if (f.banos === null) return "Baños";
  if (f.banos === 4) return "4+ baños";
  return `${f.banos} baños`;
}

function habBanosLabel(f: SharedFilters): string {
  const parts: string[] = [];
  if (f.habitaciones !== null) parts.push(f.habitaciones === 4 ? "4+ hab." : `${f.habitaciones} hab.`);
  if (f.banos !== null) parts.push(f.banos === 4 ? "4+ baños" : `${f.banos} baños`);
  return parts.length > 0 ? parts.join(", ") : "Hab. y Baños";
}

// ─── Dropdown panels ──────────────────────────────────────────────────────────

const panelBase: React.CSSProperties = {
  background: "#fff", borderRadius: 12,
  border: `1px solid ${C.border}`,
  boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
  padding: 16, minWidth: 240,
};

const labelSm: React.CSSProperties = {
  fontSize: 10, color: C.muted, fontWeight: 700,
  textTransform: "uppercase", letterSpacing: "0.6px",
  marginBottom: 8, display: "block",
};

function BtnGroup({
  options, current, onChange,
}: {
  options: { value: number | null; label: string }[];
  current: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          style={{
            padding: "5px 12px", borderRadius: 8, fontSize: 12,
            border: `1px solid ${current === o.value ? C.teal : C.border}`,
            background: current === o.value ? C.teal : C.white,
            color: current === o.value ? "#fff" : C.ink,
            cursor: "pointer", fontWeight: current === o.value ? 600 : 400,
            transition: "all 0.1s",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function NumInput({
  placeholder, value, onChange,
}: {
  placeholder: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <input
      type="number"
      placeholder={placeholder}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      style={{
        width: "100%", border: `1px solid ${C.border}`, borderRadius: 8,
        padding: "7px 10px", fontSize: 12, outline: "none", background: C.white,
        color: C.ink,
      }}
    />
  );
}

function PrecioPanel({
  filters, isRent, onChange, onClose, lang, trm,
}: {
  filters: SharedFilters;
  isRent: boolean;
  onChange: (f: Partial<SharedFilters>) => void;
  onClose: () => void;
  lang: string;
  trm: number;
}) {
  const TOTAL_MIN = 0;
  // Ranges calibrated to real data (validity-capped): arriendo p99 ~38M (cap 50M);
  // venta p99 ~9B. STEP: arriendo 0.5M uniforme; venta 5M.
  const TOTAL_MAX = isRent ? 50_000_000 : 10_000_000_000;
  const STEP      = isRent ? 500_000    : 5_000_000;

  const curMin = filters.precioMin ?? TOTAL_MIN;
  const curMax = filters.precioMax ?? TOTAL_MAX;

  const trackRef = useRef<HTMLDivElement>(null);

  const snap  = (v: number) => Math.round(v / STEP) * STEP;
  const toR   = (v: number) => (v - TOTAL_MIN) / (TOTAL_MAX - TOTAL_MIN);
  const fromR = (r: number) => snap(TOTAL_MIN + r * (TOTAL_MAX - TOTAL_MIN));

  const minR = toR(curMin);
  const maxR = toR(curMax);

  const getRatio = (e: React.PointerEvent) => {
    if (!trackRef.current) return 0;
    const rect = trackRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  };

  const BARS = 30;
  const hist = useMemo(() => {
    const peak  = isRent ? 0.28 : 0.15;
    const sigma = isRent ? 0.20 : 0.16;
    const raw   = Array.from({ length: BARS }, (_, i) => {
      const x = (i + 0.5) / BARS;
      return Math.exp(-0.5 * ((x - peak) / sigma) ** 2);
    });
    const maxH = Math.max(...raw);
    return raw.map(h => h / maxH);
  }, [isRent]);

  const fmt  = (v: number) => {
    if (v <= TOTAL_MIN) return "Mín";
    if (v >= TOTAL_MAX) return "Máx";
    return fmtPrice(v, lang, trm, isRent);
  };

  const thumbStyle: React.CSSProperties = {
    position: "absolute", bottom: 2,
    width: 20, height: 20,
    background: "#fff", borderRadius: "50%",
    border: `2.5px solid ${C.teal}`,
    boxShadow: "0 1px 5px rgba(0,0,0,0.28)",
    cursor: "ew-resize", touchAction: "none", zIndex: 2,
    transform: "translateX(-50%)",
  };

  return (
    <div style={{ ...panelBase, minWidth: 300, userSelect: "none" }}>
      {/* Range labels */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.teal }}>{fmt(curMin)}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.teal }}>{fmt(curMax)}</span>
      </div>

      {/* Histogram + dual slider */}
      <div ref={trackRef} style={{ position: "relative", height: 76, marginBottom: 4 }}>

        {/* Histogram bars */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, bottom: 24,
          display: "flex", alignItems: "flex-end", gap: 2,
        }}>
          {hist.map((h, i) => {
            const barR = (i + 0.5) / BARS;
            const inRange = barR >= minR && barR <= maxR;
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: `${Math.max(h * 100, 4)}%`,
                  background: inRange ? C.teal : "#D4CEC5",
                  borderRadius: "2px 2px 0 0",
                  opacity: inRange ? 0.8 : 0.3,
                  transition: "background 0.07s, opacity 0.07s",
                }}
              />
            );
          })}
        </div>

        {/* Track */}
        <div style={{
          position: "absolute", bottom: 8, left: 0, right: 0,
          height: 4, background: "#DDD8CF", borderRadius: 2,
        }}>
          <div style={{
            position: "absolute",
            left: `${minR * 100}%`,
            width: `${(maxR - minR) * 100}%`,
            height: "100%", background: C.teal, borderRadius: 2,
          }} />
        </div>

        {/* Min thumb */}
        <div
          style={{ ...thumbStyle, left: `${minR * 100}%` }}
          onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
          onPointerMove={(e) => {
            if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
            const v = fromR(getRatio(e));
            onChange({ precioMin: v <= TOTAL_MIN ? null : Math.min(v, curMax - STEP) });
          }}
          onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
        />

        {/* Max thumb */}
        <div
          style={{ ...thumbStyle, left: `${maxR * 100}%` }}
          onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
          onPointerMove={(e) => {
            if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
            const v = fromR(getRatio(e));
            onChange({ precioMax: v >= TOTAL_MAX ? null : Math.max(v, curMin + STEP) });
          }}
          onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
        />
      </div>

      <button
        onClick={onClose}
        style={{
          width: "100%", padding: "8px", borderRadius: 8,
          background: C.teal, color: "#fff", border: "none",
          fontSize: 12, fontWeight: 600, cursor: "pointer",
        }}
      >
        Aplicar
      </button>
    </div>
  );
}

// ─── AreaPanel ────────────────────────────────────────────────────────────────

function AreaPanel({
  filters, onChange, onClose,
}: {
  filters: SharedFilters;
  onChange: (f: Partial<SharedFilters>) => void;
  onClose: () => void;
}) {
  const TOTAL_MIN = 0;
  const TOTAL_MAX = 600;
  const STEP      = 5;

  const curMin = filters.areaMin ?? TOTAL_MIN;
  const curMax = filters.areaMax ?? TOTAL_MAX;

  const trackRef = useRef<HTMLDivElement>(null);

  const snap  = (v: number) => Math.round(v / STEP) * STEP;
  const toR   = (v: number) => (v - TOTAL_MIN) / (TOTAL_MAX - TOTAL_MIN);
  const fromR = (r: number) => snap(TOTAL_MIN + r * (TOTAL_MAX - TOTAL_MIN));

  const minR = toR(curMin);
  const maxR = toR(curMax);

  const getRatio = (e: React.PointerEvent) => {
    if (!trackRef.current) return 0;
    const rect = trackRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  };

  const BARS = 30;
  const hist = useMemo(() => {
    // Medellín market: peak ~65–80 m² (apartments)
    const peak  = 0.13;
    const sigma = 0.13;
    const raw   = Array.from({ length: BARS }, (_, i) => {
      const x = (i + 0.5) / BARS;
      return Math.exp(-0.5 * ((x - peak) / sigma) ** 2);
    });
    const maxH = Math.max(...raw);
    return raw.map(h => h / maxH);
  }, []);

  const fmt = (v: number) => {
    if (v <= TOTAL_MIN) return "0";
    if (v >= TOTAL_MAX) return "Sin límite";
    return `${v} m²`;
  };

  const thumbStyle: React.CSSProperties = {
    position: "absolute", bottom: 2,
    width: 20, height: 20,
    background: "#fff", borderRadius: "50%",
    border: `2.5px solid ${C.teal}`,
    boxShadow: "0 1px 5px rgba(0,0,0,0.28)",
    cursor: "ew-resize", touchAction: "none", zIndex: 2,
    transform: "translateX(-50%)",
  };

  return (
    <div style={{ ...panelBase, minWidth: 300, userSelect: "none" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.teal }}>{fmt(curMin)}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.teal }}>{fmt(curMax)}</span>
      </div>

      <div ref={trackRef} style={{ position: "relative", height: 76, marginBottom: 4 }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 24, display: "flex", alignItems: "flex-end", gap: 2 }}>
          {hist.map((h, i) => {
            const barR   = (i + 0.5) / BARS;
            const inRange = barR >= minR && barR <= maxR;
            return (
              <div key={i} style={{
                flex: 1,
                height: `${Math.max(h * 100, 4)}%`,
                background: inRange ? C.teal : "#D4CEC5",
                borderRadius: "2px 2px 0 0",
                opacity: inRange ? 0.8 : 0.3,
                transition: "background 0.07s, opacity 0.07s",
              }} />
            );
          })}
        </div>

        <div style={{ position: "absolute", bottom: 8, left: 0, right: 0, height: 4, background: "#DDD8CF", borderRadius: 2 }}>
          <div style={{ position: "absolute", left: `${minR * 100}%`, width: `${(maxR - minR) * 100}%`, height: "100%", background: C.teal, borderRadius: 2 }} />
        </div>

        <div
          style={{ ...thumbStyle, left: `${minR * 100}%` }}
          onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
          onPointerMove={(e) => {
            if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
            const v = fromR(getRatio(e));
            onChange({ areaMin: v <= TOTAL_MIN ? null : Math.min(v, curMax - STEP) });
          }}
          onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
        />

        <div
          style={{ ...thumbStyle, left: `${maxR * 100}%` }}
          onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
          onPointerMove={(e) => {
            if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
            const v = fromR(getRatio(e));
            onChange({ areaMax: v >= TOTAL_MAX ? null : Math.max(v, curMin + STEP) });
          }}
          onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
        />
      </div>

      <button
        onClick={onClose}
        style={{ width: "100%", padding: "8px", borderRadius: 8, background: C.teal, color: "#fff", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
      >
        Aplicar
      </button>
    </div>
  );
}

// ─── HabBanosPanel ───────────────────────────────────────────────────────────

function HabBanosPanel({
  filters, onChange,
}: {
  filters: SharedFilters;
  onChange: (f: Partial<SharedFilters>) => void;
}) {
  const OPTS = [
    { value: null as number | null, label: "Cualquiera" },
    { value: 1, label: "1" },
    { value: 2, label: "2" },
    { value: 3, label: "3" },
    { value: 4, label: "4+" },
  ];
  return (
    <div style={{ ...panelBase, minWidth: 240 }}>
      <span style={labelSm}>Habitaciones</span>
      <BtnGroup options={OPTS} current={filters.habitaciones} onChange={(v) => onChange({ habitaciones: v })} />
      <div style={{ marginTop: 14 }}>
        <span style={labelSm}>Baños</span>
        <BtnGroup options={OPTS} current={filters.banos} onChange={(v) => onChange({ banos: v })} />
      </div>
      {(filters.habitaciones !== null || filters.banos !== null) && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={() => onChange({ habitaciones: null, banos: null })}
            style={{ fontSize: 12, color: C.muted, background: "none", border: "none", cursor: "pointer" }}
          >
            Limpiar
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Amenidades ───────────────────────────────────────────────────────────────

type AmenItem = { key: string; label: string; Icon: React.ElementType };

const AMENIDADES_GROUPS: { id: string; label: string; items: AmenItem[] }[] = [
  {
    id: "interior",
    label: "INTERIOR",
    items: [
      { key: "amoblado",         label: "Amoblado",          Icon: Sofa },
      { key: "cocina_integral",  label: "Cocina integral",   Icon: UtensilsCrossed },
      { key: "balcon",           label: "Balcón / Terraza",  Icon: Wind },
      { key: "lavanderia",       label: "Lavandería",        Icon: WashingMachine },
    ],
  },
  {
    id: "edificio",
    label: "EDIFICIO Y CONJUNTO",
    items: [
      { key: "ascensor",               label: "Ascensor",              Icon: ArrowUpDown },
      { key: "conjunto_cerrado",       label: "Conjunto cerrado",      Icon: Building2 },
      { key: "salon_comunal",          label: "Salón comunal",         Icon: Users },
      { key: "gimnasio",               label: "Gimnasio",              Icon: Dumbbell },
      { key: "piscina",                label: "Piscina",               Icon: Waves },
      { key: "parqueadero_visitantes", label: "Parqueadero visitantes",Icon: Car },
      { key: "porteria",               label: "Portería",              Icon: DoorClosed },
    ],
  },
  {
    id: "seguridad",
    label: "SEGURIDAD Y ENTORNO",
    items: [
      { key: "vigilancia",  label: "Vigilancia 24h",        Icon: Shield },
      { key: "camaras",     label: "Cámaras de seguridad",  Icon: Camera },
      { key: "zonas_verdes",label: "Zonas verdes",          Icon: Trees },
      { key: "zona_ninos",  label: "Zona de niños",         Icon: Baby },
      { key: "transporte",  label: "Cerca al transporte",   Icon: TrainFront },
    ],
  },
];

function AmenidadesPanel({
  current,
  onChange,
  onClose,
}: {
  current: string[];
  onChange: (keys: string[]) => void;
  onClose: () => void;
}) {
  const [pending, setPending] = useState<string[]>(current);

  const toggleKey = (key: string) =>
    setPending((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);

  const clearAll = () => setPending([]);

  const apply = () => { onChange(pending); onClose(); };

  const ICON_COLOR = "#9B8B75";

  return (
    <div style={{ ...panelBase, width: 320, padding: 0, display: "flex", flexDirection: "column" }}>
      {/* Scrollable body */}
      <div style={{ overflowY: "auto", maxHeight: "min(460px, 70vh)", padding: "12px 16px 4px" }}>
        {AMENIDADES_GROUPS.map((group, gi) => (
          <div key={group.id}>
            <span style={{
              display: "block", fontSize: 10, fontWeight: 700, letterSpacing: "0.5px",
              textTransform: "uppercase", color: C.muted,
              padding: gi === 0 ? "4px 0 6px" : "10px 0 6px",
              borderTop: gi > 0 ? `1px solid ${C.border}` : "none",
            }}>
              {group.label}
            </span>
            {group.items.map(({ key, label, Icon }) => {
              const checked = pending.includes(key);
              return (
                <div
                  key={key}
                  role="checkbox"
                  aria-checked={checked}
                  onClick={() => toggleKey(key)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "7px 6px", borderRadius: 7, cursor: "pointer",
                    userSelect: "none",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = C.surface; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <Icon size={16} color={checked ? C.teal : ICON_COLOR} strokeWidth={1.8} />
                  <span style={{ flex: 1, fontSize: 13, color: C.ink }}>{label}</span>
                  <span style={{
                    width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                    border: `2px solid ${checked ? C.teal : C.border}`,
                    background: checked ? C.teal : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.12s",
                  }}>
                    {checked && (
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4L3.5 6.5L9 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{
        display: "flex", gap: 8, padding: "12px 16px",
        borderTop: `1px solid ${C.border}`,
        background: "#fff",
      }}>
        <button
          onClick={clearAll}
          style={{
            flex: 1, padding: "8px", borderRadius: 8,
            border: `1px solid ${C.border}`, background: "transparent",
            color: C.muted, fontSize: 12, cursor: "pointer",
          }}
        >
          Limpiar
        </button>
        <button
          onClick={apply}
          disabled={pending.length === 0 && current.length === 0}
          style={{
            flex: 1, padding: "8px", borderRadius: 8, border: "none",
            background: (pending.length > 0 || current.length > 0) ? C.teal : C.border,
            color: (pending.length > 0 || current.length > 0) ? "#fff" : C.muted,
            fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}
        >
          {pending.length > 0 ? `Aplicar (${pending.length})` : "Aplicar"}
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MapFilterBar({
  activeTab, filters, onFiltersChange, onResetAll, allBarrios, onBarrioNavigate, onBarrioClear,
  activeComunaCd, activeMunicipio, onComunaSelect,
}: MapFilterBarProps) {
  const isPro = useIsPro();
  const { lang } = useLang();
  const trm = useTrm();
  const [open, setOpen] = useState<DropdownId | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ── Search autocomplete state ──────────────────────────────────────────────
  const [searchQ, setSearchQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchSelected, setSearchSelected] = useState<BarrioOption | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchRect, setSearchRect] = useState<DOMRect | null>(null);

  // Sync when busqueda cleared externally (Reset All)
  useEffect(() => {
    if (!filters.busqueda) { setSearchQ(""); setSearchSelected(null); }
  }, [filters.busqueda]);

  const suggestions = useMemo<BarrioOption[]>(() => {
    if (!searchQ.trim() || !allBarrios) return [];
    const q = norm(searchQ);
    return allBarrios
      .filter(b =>
        norm(b.nombre).includes(q) ||
        norm(b.municipio).includes(q) ||
        (b.comuna && norm(b.comuna).includes(q))
      )
      .slice(0, 8);
  }, [searchQ, allBarrios]);

  const handleSearchSelect = useCallback((opt: BarrioOption) => {
    setSearchSelected(opt);
    setSearchQ(opt.nombre);
    setSearchOpen(false);
    onFiltersChange({ busqueda: null });
    onBarrioNavigate?.(opt);
  }, [onBarrioNavigate, onFiltersChange]);

  const handleSearchClear = useCallback(() => {
    setSearchQ("");
    setSearchSelected(null);
    setSearchOpen(false);
    onFiltersChange({ busqueda: null });
    onBarrioClear?.();
  }, [onBarrioClear, onFiltersChange]);

  const toggle = (id: DropdownId, a: DOMRect) => {
    setAnchor(a);
    setOpen((p) => (p === id ? null : id));
  };
  const close  = () => setOpen(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!barRef.current?.contains(t) && !dropdownRef.current?.contains(t)) close();
      if (!searchRef.current?.contains(t)) setSearchOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (activeTab === "agent" || activeTab === "simulator" || activeTab === "comparador") return null;

  const isRent     = activeTab === "rent";
  const activeCount = countActive(filters);
  const precioActive     = filters.precioMax !== null || filters.precioMin !== null;
  const habActive        = filters.habitaciones !== null;
  const tipoActive       = filters.tipoInmueble !== null;
  const areaActive       = filters.areaMin !== null || filters.areaMax !== null;
  const banosActive      = filters.banos !== null;

  // ── Sell tab: barrio selector ──────────────────────────────────────────────
  const sellContent = (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 12, color: C.muted, fontWeight: 500 }}>Analiza tu barrio:</span>
      <select
        defaultValue=""
        onChange={(e) => {
          const opt = allBarrios?.find((b) => String(b.id) === e.target.value);
          if (opt) onBarrioNavigate?.(opt);
        }}
        style={{
          border: `1px solid ${C.border}`, borderRadius: 8,
          padding: "5px 12px", fontSize: 12, background: C.white,
          color: C.ink, outline: "none", cursor: "pointer", minWidth: 220,
        }}
      >
        <option value="">Selecciona un barrio...</option>
        {allBarrios?.map((b) => (
          <option key={b.id} value={b.id}>
            {b.nombre} – {b.municipio}
          </option>
        ))}
      </select>
    </div>
  );

  // ── Desktop pill row ───────────────────────────────────────────────────────
  const habBanosActive = filters.habitaciones !== null || filters.banos !== null;
  const filtrosCount = [
    areaActive,
    isRent  && (filters.estrato?.length ?? 0) > 0,
    filters.diasMercado !== null,
  ].filter(Boolean).length;
  const amenCount = filters.amenidades?.length ?? 0;

  const desktopContent = (
    <div style={{ display: "flex", alignItems: "center", gap: 7, overflowX: "auto", paddingBottom: 2 }}>

      {/* Search autocomplete */}
      <div ref={searchRef} style={{ position: "relative", flexShrink: 0 }}>
        <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.muted, pointerEvents: "none", zIndex: 1 }} />
        <input
          ref={searchInputRef}
          type="text"
          placeholder="Buscar barrio o municipio..."
          value={searchQ}
          onChange={(e) => {
            const v = e.target.value;
            setSearchQ(v);
            setSearchSelected(null);
            setSearchRect(searchInputRef.current?.getBoundingClientRect() ?? null);
            setSearchOpen(!!v.trim());
            onFiltersChange({ busqueda: v || null });
          }}
          onFocus={() => {
            if (searchQ.trim()) {
              setSearchRect(searchInputRef.current?.getBoundingClientRect() ?? null);
              setSearchOpen(true);
            }
          }}
          style={{
            height: 32, paddingLeft: 28, paddingRight: (searchQ || searchSelected) ? 26 : 10,
            border: `1px solid ${searchSelected ? C.teal : searchQ ? C.teal : C.border}`,
            borderRadius: 8, fontSize: 12, color: C.ink, background: C.white,
            outline: "none", width: 210, flexShrink: 0,
          }}
        />
        {(searchQ || searchSelected) && (
          <button
            onClick={handleSearchClear}
            style={{ position: "absolute", right: 7, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: C.muted, display: "flex", padding: 0, zIndex: 1 }}
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Zona: cascader Comuna → Barrio (entre buscador y precio) */}
      <ZonaCascader
        allBarrios={allBarrios}
        activeComunaCd={activeComunaCd}
        activeMunicipio={activeMunicipio}
        onComunaSelect={onComunaSelect}
        onBarrioNavigate={onBarrioNavigate}
      />

      {/* Separador visual */}
      <div style={{ width: 1, height: 20, background: C.border, flexShrink: 0, margin: "0 2px" }} />

      {/* Precio */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        <FilterPill
          label={precioLabel(filters, isRent, lang, trm)}
          active={precioActive}
          onClear={() => onFiltersChange({ precioMin: null, precioMax: null })}
          onClick={(a) => toggle("precio", a)}
          isOpen={open === "precio"}
        />
      </div>

      {/* Habitaciones y Baños */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        <FilterPill
          label={habBanosLabel(filters)}
          active={habBanosActive}
          onClear={habBanosActive ? () => onFiltersChange({ habitaciones: null, banos: null }) : undefined}
          onClick={(a) => toggle("habBanos", a)}
          isOpen={open === "habBanos"}
        />
      </div>

      {/* Tipo */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        <FilterPill
          label={tipoLabel(filters)}
          active={tipoActive}
          onClear={() => onFiltersChange({ tipoInmueble: null })}
          onClick={(a) => toggle("tipo", a)}
          isOpen={open === "tipo"}
        />
      </div>

      {/* Filtros */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        <FilterPill
          label={filtrosCount > 0 ? `Filtros (${filtrosCount})` : "Filtros"}
          active={filtrosCount > 0}
          onClear={filtrosCount > 0 ? () => onFiltersChange({ areaMin: null, areaMax: null, antiguedad: null, estrato: null, diasMercado: null }) : undefined}
          onClick={(a) => toggle("filtros", a)}
          isOpen={open === "filtros"}
        />
      </div>

      {/* Amenidades */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        <FilterPill
          label={amenCount > 0 ? `Amenidades (${amenCount})` : "Amenidades"}
          active={amenCount > 0}
          onClear={amenCount > 0 ? () => onFiltersChange({ amenidades: null }) : undefined}
          onClick={(a) => toggle("amenidades", a)}
          isOpen={open === "amenidades"}
        />
      </div>

      {/* Clear all */}
      {activeCount > 0 && (
        <button
          onClick={onResetAll}
          style={{
            background: "none", border: "none", color: C.teal,
            fontSize: 12, fontWeight: 600, cursor: "pointer",
            padding: "0 4px", flexShrink: 0,
          }}
        >
          Limpiar
        </button>
      )}
    </div>
  );

  // ── Mobile bottom sheet ────────────────────────────────────────────────────
  const mobileSheet = mobileOpen && (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.45)",
        display: "flex", flexDirection: "column", justifyContent: "flex-end",
      }}
      onClick={() => setMobileOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: "16px 16px 0 0",
          padding: "20px 20px 32px", maxHeight: "80vh", overflowY: "auto",
          width: "100%", maxWidth: "100%", boxSizing: "border-box", overflowX: "hidden",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>Filtros</span>
          <button onClick={() => setMobileOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted }}>
            <X size={20} />
          </button>
        </div>

        {/* Zona: Toda la ciudad → comuna → barrio (selects nativos) */}
        <div style={{ marginBottom: 20 }}>
          <span style={labelSm}>Zona</span>
          <div style={{ display: "flex", gap: 8 }}>
            <select
              value={activeComunaCd != null ? String(activeComunaCd) : (activeMunicipio ? `mun:${activeMunicipio}` : "")}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) { onComunaSelect?.(null, null); return; }
                if (v.startsWith("mun:")) {
                  const mun = v.slice(4);
                  const g = groupMunicipios(allBarrios).find((x) => x.municipio === mun);
                  if (g) onComunaSelect?.(null, g.nombre, g.municipio);
                  return;
                }
                const c = groupComunas(allBarrios).find((g) => String(g.cd) === v);
                if (c) onComunaSelect?.(c.cd as number, c.nombre);
              }}
              style={{ flex: 1, minWidth: 0, boxSizing: "border-box", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, color: C.ink, background: "#fff" }}
            >
              <option value="">Toda la ciudad</option>
              <optgroup label="Comunas Medellín">
                {groupComunas(allBarrios).map((c) => (
                  <option key={c.cd} value={c.cd!}>{titleCase(c.nombre)}</option>
                ))}
              </optgroup>
              {groupMunicipios(allBarrios).length > 0 && (
                <optgroup label="Otros municipios">
                  {groupMunicipios(allBarrios).map((g) => (
                    <option key={g.municipio} value={`mun:${g.municipio}`}>{titleCase(g.nombre)}</option>
                  ))}
                </optgroup>
              )}
            </select>
            {activeComunaCd != null && (
              <select
                value=""
                onChange={(e) => {
                  const b = groupComunas(allBarrios).find((g) => g.cd === activeComunaCd)
                    ?.barrios.find((x) => String(x.id) === e.target.value);
                  if (b) { onBarrioNavigate?.(b); setMobileOpen(false); }
                }}
                style={{ flex: 1, minWidth: 0, boxSizing: "border-box", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, color: C.ink, background: "#fff" }}
              >
                <option value="">Toda la comuna</option>
                {(groupComunas(allBarrios).find((g) => g.cd === activeComunaCd)?.barrios ?? [])
                  .slice().sort((a, b) => a.nombre.localeCompare(b.nombre))
                  .map((b) => <option key={b.id} value={b.id}>{titleCase(b.nombre)}</option>)}
              </select>
            )}
          </div>
        </div>

        {/* Precio */}
        <div style={{ marginBottom: 20 }}>
          <span style={labelSm}>{isRent ? "Precio / mes" : "Precio"}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="number" placeholder="Mínimo" value={filters.precioMin ?? ""}
              onChange={(e) => onFiltersChange({ precioMin: e.target.value ? Number(e.target.value) : null })}
              style={{ flex: 1, minWidth: 0, boxSizing: "border-box", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none", color: C.ink, background: "#fff" }}
            />
            <input
              type="number" placeholder="Máximo" value={filters.precioMax ?? ""}
              onChange={(e) => onFiltersChange({ precioMax: e.target.value ? Number(e.target.value) : null })}
              style={{ flex: 1, minWidth: 0, boxSizing: "border-box", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none", color: C.ink, background: "#fff" }}
            />
          </div>
        </div>

        {/* Habitaciones */}
        <div style={{ marginBottom: 20 }}>
          <span style={labelSm}>Habitaciones</span>
          <div style={{ display: "flex", gap: 6 }}>
            {[null, 1, 2, 3, 4].map((h, i) => (
              <button
                key={String(h)}
                onClick={() => onFiltersChange({ habitaciones: h })}
                style={{
                  flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 12,
                  border: `1px solid ${filters.habitaciones === h ? C.teal : C.border}`,
                  background: filters.habitaciones === h ? C.teal : C.white,
                  color: filters.habitaciones === h ? "#fff" : C.ink,
                  cursor: "pointer",
                }}
              >
                {["Todas", "1", "2", "3", "4+"][i]}
              </button>
            ))}
          </div>
        </div>

        {/* Tipo */}
        <div style={{ marginBottom: 20 }}>
          <span style={labelSm}>Tipo de inmueble</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[{ value: null, label: "Todos" }, ...TIPO_OPTIONS].map((opt) => (
              <button
                key={String(opt.value)}
                onClick={() => onFiltersChange({ tipoInmueble: opt.value })}
                style={{
                  padding: "6px 12px", borderRadius: 8, fontSize: 12,
                  border: `1px solid ${filters.tipoInmueble === opt.value ? C.teal : C.border}`,
                  background: filters.tipoInmueble === opt.value ? C.teal : C.white,
                  color: filters.tipoInmueble === opt.value ? "#fff" : C.ink,
                  cursor: "pointer",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Área */}
        <div style={{ marginBottom: 20 }}>
          <span style={labelSm}>Área (m²)</span>
          <div style={{ display: "flex", gap: 8 }}>
            <input type="number" placeholder="Mínima" value={filters.areaMin ?? ""} onChange={(e) => onFiltersChange({ areaMin: e.target.value ? Number(e.target.value) : null })} style={{ flex: 1, minWidth: 0, boxSizing: "border-box", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none", color: C.ink, background: "#fff" }} />
            <input type="number" placeholder="Máxima" value={filters.areaMax ?? ""} onChange={(e) => onFiltersChange({ areaMax: e.target.value ? Number(e.target.value) : null })} style={{ flex: 1, minWidth: 0, boxSizing: "border-box", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none", color: C.ink, background: "#fff" }} />
          </div>
        </div>

        {activeTab === "buy" && (
          <>
            {/* Baños */}
            <div style={{ marginBottom: 20 }}>
              <span style={labelSm}>Baños</span>
              <div style={{ display: "flex", gap: 6 }}>
                {[null, 1, 2, 3, 4].map((b, i) => (
                  <button
                    key={String(b)}
                    onClick={() => onFiltersChange({ banos: b })}
                    style={{
                      flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 12,
                      border: `1px solid ${filters.banos === b ? C.teal : C.border}`,
                      background: filters.banos === b ? C.teal : C.white,
                      color: filters.banos === b ? "#fff" : C.ink,
                      cursor: "pointer",
                    }}
                  >
                    {["Todos", "1", "2", "3", "4+"][i]}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <div style={{ display: "flex", gap: 10, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
          <button
            onClick={() => { onResetAll?.(); setMobileOpen(false); }}
            style={{ flex: 1, padding: "12px", borderRadius: 10, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontSize: 13, cursor: "pointer" }}
          >
            Limpiar todo
          </button>
          <button
            onClick={() => setMobileOpen(false)}
            style={{ flex: 2, padding: "12px", borderRadius: 10, background: C.teal, color: "#fff", border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            Aplicar filtros
          </button>
        </div>
      </div>
    </div>
  );

  // ── Floating dropdown (fixed-positioned sibling to escape stacking context) ──
  const wrapStyle: React.CSSProperties | null = anchor ? {
    position: "fixed",
    top: anchor.bottom + 4,
    left: Math.min(anchor.left, window.innerWidth - 284),
    zIndex: 200,
  } : null;

  const activePanel = open && wrapStyle ? (() => {
    switch (open) {
      case "precio":
        return (
          <div ref={dropdownRef} style={wrapStyle}>
            <PrecioPanel filters={filters} isRent={isRent} onChange={onFiltersChange} onClose={close} lang={lang} trm={trm} />
          </div>
        );
      case "habBanos":
        return (
          <div ref={dropdownRef} style={wrapStyle}>
            <HabBanosPanel filters={filters} onChange={onFiltersChange} />
          </div>
        );
      case "tipo":
        return (
          <div ref={dropdownRef} style={wrapStyle}>
            <div style={panelBase}>
              <span style={labelSm}>Tipo de inmueble</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {[{ value: null, label: "Todos los tipos" }, ...TIPO_OPTIONS].map((opt) => (
                  <label key={String(opt.value)} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: C.ink }}>
                    <input
                      type="radio" name="tipo-dd"
                      checked={filters.tipoInmueble === opt.value}
                      onChange={() => { onFiltersChange({ tipoInmueble: opt.value }); close(); }}
                      style={{ accentColor: C.teal }}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        );
      case "amenidades":
        return (
          <div ref={dropdownRef} style={wrapStyle}>
            <AmenidadesPanel
              current={[...(filters.amenidades ?? []), ...(filters.amoblado ? ["amoblado"] : [])]}
              onChange={(keys) => {
                const hasAmoblado = keys.includes("amoblado");
                const rest = keys.filter(k => k !== "amoblado");
                onFiltersChange({ amenidades: rest.length === 0 ? null : rest, amoblado: hasAmoblado ? true : null });
              }}
              onClose={close}
            />
          </div>
        );
      case "filtros": {
        const tiempoOpts = isRent
          ? ([
              { val: "nuevo",  label: "Recién publicado", sub: "< 7 días" },
              { val: "mas30",  label: "Más de 30 días",   sub: "lleva tiempo" },
              { val: "mas60",  label: "Más de 60 días",   sub: "negociable" },
            ] as const)
          : ([
              { val: "nuevo",    label: "Nuevo",    sub: "< 7 días" },
              { val: "reciente", label: "Reciente", sub: "< 30 días" },
              { val: "demorado", label: "Demorado", sub: "> 90 días" },
            ] as const);

        const proTeasers = isRent
          ? [
              { label: "Canon mediano del barrio", desc: "¿Está por encima o debajo del mercado?" },
              { label: "Evolución de arriendos",   desc: "Cómo ha cambiado el precio en la zona" },
              { label: "Historial de disponibilidad", desc: "Cuánto tarda en arrendarse ese tipo" },
            ]
          : [
              { label: "Buenas ofertas", desc: "Propiedades bajo la mediana del barrio" },
              { label: "Yield mínimo",   desc: "Rentabilidad para inversores" },
              { label: "Score de zona",  desc: "Calidad y potencial del barrio" },
            ];

        return (
          <div ref={dropdownRef} style={wrapStyle}>
            <div style={{ ...panelBase, minWidth: 300 }}>
              <span style={{ ...labelSm, fontSize: 13, fontWeight: 700, marginBottom: 16 }}>
                Filtros
              </span>

              {/* Área m² */}
              <span style={labelSm}>Área m²</span>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <NumInput
                  placeholder="Mínimo"
                  value={filters.areaMin}
                  onChange={(v) => onFiltersChange({ areaMin: v })}
                />
                <NumInput
                  placeholder="Máximo"
                  value={filters.areaMax}
                  onChange={(v) => onFiltersChange({ areaMax: v })}
                />
              </div>

              {/* Estrato — solo arriendo */}
              {isRent && (
                <>
                  <span style={labelSm}>Estrato</span>
                  <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
                    {[1, 2, 3, 4, 5, 6].map((e) => {
                      const active = (filters.estrato ?? []).includes(e);
                      return (
                        <button
                          key={e}
                          onClick={() => {
                            const cur = filters.estrato ?? [];
                            const next = active ? cur.filter((x) => x !== e) : [...cur, e];
                            onFiltersChange({ estrato: next.length === 0 ? null : next });
                          }}
                          style={{
                            width: 36, height: 32, borderRadius: 8,
                            border: `1.5px solid ${active ? C.teal : C.border}`,
                            background: active ? C.teal : "transparent",
                            color: active ? "#fff" : C.ink,
                            fontSize: 12, fontWeight: 700, cursor: "pointer",
                          }}
                        >
                          {e}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Tiempo en mercado */}
              <span style={labelSm}>{isRent ? "Tiempo publicado" : "Tiempo en mercado"}</span>
              <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
                {tiempoOpts.map((opt) => {
                  const active = filters.diasMercado === opt.val;
                  return (
                    <button
                      key={opt.val}
                      onClick={() => onFiltersChange({ diasMercado: active ? null : opt.val })}
                      style={{
                        flex: 1, padding: "6px 4px", borderRadius: 8, cursor: "pointer",
                        border: `1.5px solid ${active ? C.teal : C.border}`,
                        background: active ? C.teal : "transparent",
                        textAlign: "center",
                      }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 700, color: active ? "#fff" : C.ink, lineHeight: 1.3 }}>{opt.label}</div>
                      <div style={{ fontSize: 9, color: active ? "rgba(255,255,255,0.75)" : C.muted }}>{opt.sub}</div>
                    </button>
                  );
                })}
              </div>

              {/* PRO teasers — solo para usuarios sin plan pro */}
              {!isPro && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                <span style={labelSm}>Filtros PRO</span>
                {proTeasers.map((t) => (
                  <div key={t.label} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "8px 10px", borderRadius: 8,
                    background: "rgba(255,201,40,0.06)",
                    border: "1px solid rgba(255,201,40,0.3)",
                    userSelect: "none",
                  }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.ink }}>🔒 {t.label}</div>
                      <div style={{ fontSize: 10, color: C.muted }}>{t.desc}</div>
                    </div>
                    <span style={{
                      fontSize: 9, fontWeight: 800, letterSpacing: "1px",
                      background: "#ffc928", color: "#1A1208",
                      padding: "2px 7px", borderRadius: 999, flexShrink: 0,
                    }}>
                      PRO
                    </span>
                  </div>
                ))}
              </div>
              )}

              {/* Actions */}
              <div style={{ display: "flex", gap: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
                <button
                  onClick={() => { onFiltersChange({ areaMin: null, areaMax: null, antiguedad: null, estrato: null, diasMercado: null, amoblado: null }); close(); }}
                  style={{ flex: 1, padding: "8px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontSize: 12, cursor: "pointer" }}
                >
                  Limpiar
                </button>
                <button
                  onClick={close}
                  style={{ flex: 1, padding: "8px", borderRadius: 8, background: C.teal, color: "#fff", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        );
      }
      default:
        return null;
    }
  })() : null;

  // ── Bar container ──────────────────────────────────────────────────────────
  return (
    <>
      <div
        ref={barRef}
        style={{
          position: "fixed", top: 52, left: 0, right: 0, zIndex: 40,
          background: C.white,
          borderBottom: `1px solid ${C.border}`,
          height: 48,
          display: "flex", alignItems: "center",
          padding: "0 16px",
        }}
      >
        {/* Desktop */}
        <div className="hidden md:flex w-full">
          {activeTab === "sell" ? sellContent : desktopContent}
        </div>

        {/* Mobile trigger */}
        <div className="flex md:hidden w-full items-center justify-between">
          {activeTab === "sell" ? sellContent : (
            <>
              <button
                onClick={() => setMobileOpen(true)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: activeCount > 0 ? C.teal : C.white,
                  color: activeCount > 0 ? "#fff" : C.ink,
                  border: `1px solid ${activeCount > 0 ? C.teal : C.border}`,
                  borderRadius: 8, padding: "0 14px", height: 34,
                  fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}
              >
                <SlidersHorizontal size={13} />
                Filtros
                {activeCount > 0 && (
                  <span style={{
                    background: "#fff", color: C.teal,
                    borderRadius: 999, padding: "0 6px",
                    fontSize: 10, fontWeight: 700,
                  }}>
                    {activeCount}
                  </span>
                )}
              </button>
              {activeCount > 0 && (
                <button
                  onClick={onResetAll}
                  style={{ background: "none", border: "none", color: C.teal, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                >
                  Limpiar
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Search suggestions — position:fixed so it floats above map/WebGL */}
      {searchOpen && suggestions.length > 0 && searchRect && (
        <div
          ref={searchRef}
          style={{
            position: "fixed",
            top: searchRect.bottom + 4,
            left: searchRect.left,
            zIndex: 9999,
            background: C.white, border: `1px solid ${C.border}`,
            borderRadius: 10, boxShadow: "0 4px 20px rgba(0,0,0,0.16)",
            minWidth: 240, maxHeight: 280, overflowY: "auto",
          }}
        >
          {suggestions.map((opt) => (
            <button
              key={opt.id}
              onMouseDown={(e) => { e.preventDefault(); handleSearchSelect(opt); }}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "9px 14px", background: "none", border: "none",
                cursor: "pointer", fontSize: 13, color: C.ink,
                borderBottom: `1px solid ${C.border}`,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = C.surface)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              <span style={{ fontWeight: 600 }}>{opt.nombre}</span>
              <span style={{ color: C.muted, fontSize: 11, marginLeft: 6 }}>{opt.municipio}</span>
              {opt.comuna && (
                <span style={{ color: C.muted, fontSize: 11, marginLeft: 4 }}>· {opt.comuna}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {activePanel}
      {mobileSheet}
    </>
  );
}
