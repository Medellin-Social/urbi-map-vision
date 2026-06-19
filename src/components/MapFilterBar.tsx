import { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, X, SlidersHorizontal } from "lucide-react";
import { useIsPro } from "@/components/LockedField";
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
};

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

const ANTIGUEDAD_OPTIONS = [
  { value: "Entre 0 y 5 años",   label: "0 – 5 años" },
  { value: "Entre 5 y 10 años",  label: "5 – 10 años" },
  { value: "Entre 10 y 20 años", label: "10 – 20 años" },
  { value: "Más de 20 años",     label: "+20 años" },
  { value: "Remodelado",         label: "Remodelado" },
];

const ANTIGUEDAD_DIST: { value: string | null; label: string; h: number }[] = [
  { value: "Entre 0 y 5 años",   label: "0–5a",   h: 0.50 },
  { value: "Entre 5 y 10 años",  label: "5–10a",  h: 0.72 },
  { value: "Entre 10 y 20 años", label: "10–20a", h: 0.90 },
  { value: "Más de 20 años",     label: "+20a",   h: 0.60 },
  { value: "Remodelado",         label: "Remods",  h: 0.28 },
];

type DropdownId = "precio" | "habitaciones" | "tipo" | "area" | "banos" | "antiguedad" | "mas";

function countActive(f: SharedFilters, tab: MapTab): number {
  let n = 0;
  if (f.precioMax !== null || f.precioMin !== null) n++;
  if (f.habitaciones !== null) n++;
  if (f.tipoInmueble !== null) n++;
  if (f.areaMin !== null || f.areaMax !== null) n++;
  if (tab === "buy") {
    if (f.banos !== null) n++;
    if (f.antiguedad !== null) n++;
  }
  if (f.estrato !== null && f.estrato.length > 0) n++;
  if (f.diasMercado !== null) n++;
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

function precioLabel(f: SharedFilters, isRent: boolean): string {
  const unit = isRent ? "k" : "M";
  const div  = isRent ? 1_000 : 1_000_000;
  if (f.precioMin !== null && f.precioMax !== null)
    return `$${(f.precioMin / div).toFixed(0)}${unit} – $${(f.precioMax / div).toFixed(0)}${unit}`;
  if (f.precioMax !== null) return `Hasta $${(f.precioMax / div).toFixed(0)}${unit}`;
  if (f.precioMin !== null) return `Desde $${(f.precioMin / div).toFixed(0)}${unit}`;
  return isRent ? "Precio/mes" : "Precio";
}

function habLabel(f: SharedFilters): string {
  if (f.habitaciones === null) return "Habitaciones";
  if (f.habitaciones === 4) return "4+ hab.";
  return `${f.habitaciones}+ hab.`;
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
  if (f.banos === 3) return "3+ baños";
  return `${f.banos}+ baños`;
}

function antiguedadLabel(f: SharedFilters): string {
  return ANTIGUEDAD_OPTIONS.find((o) => o.value === f.antiguedad)?.label ?? "Antigüedad";
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
  filters, isRent, onChange, onClose,
}: {
  filters: SharedFilters;
  isRent: boolean;
  onChange: (f: Partial<SharedFilters>) => void;
  onClose: () => void;
}) {
  const TOTAL_MIN = 0;
  const TOTAL_MAX = isRent ? 5_000_000 : 2_000_000_000;
  const STEP      = isRent ? 50_000   : 5_000_000;

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

  const unit = isRent ? "k" : "M";
  const div  = isRent ? 1_000 : 1_000_000;
  const fmt  = (v: number) => {
    if (v <= TOTAL_MIN) return "Mín";
    if (v >= TOTAL_MAX) return "Máx";
    return `$${Math.round(v / div)}${unit}`;
  };

  const quicks = isRent
    ? [500_000, 1_000_000, 1_500_000, 2_500_000, 4_000_000]
    : [200_000_000, 400_000_000, 600_000_000, 800_000_000, 1_200_000_000];

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

      {/* Quick picks */}
      <span style={{ ...labelSm, marginTop: 10 }}>Opciones rápidas</span>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
        {quicks.map((q, i) => {
          const isLast = i === quicks.length - 1;
          return (
            <button
              key={q}
              onClick={() => {
                if (isLast) onChange({ precioMin: q, precioMax: null });
                else        onChange({ precioMax: q, precioMin: null });
              }}
              style={{
                padding: "4px 10px", borderRadius: 8, fontSize: 11,
                border: `1px solid ${C.border}`, background: C.surface,
                color: C.ink, cursor: "pointer",
              }}
            >
              {isLast ? `$${Math.round(q / div)}${unit}+` : `$${Math.round(q / div)}${unit}`}
            </button>
          );
        })}
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

// ─── AntiguedadPanel ──────────────────────────────────────────────────────────

function AntiguedadPanel({
  filters, onChange, onClose,
}: {
  filters: SharedFilters;
  onChange: (f: Partial<SharedFilters>) => void;
  onClose: () => void;
}) {
  return (
    <div style={{ ...panelBase, minWidth: 260, userSelect: "none" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 72, marginBottom: 6 }}>
        {ANTIGUEDAD_DIST.map((opt) => {
          const sel = filters.antiguedad === opt.value;
          return (
            <button
              key={String(opt.value)}
              onClick={() => { onChange({ antiguedad: opt.value as string | null }); onClose(); }}
              title={opt.label}
              style={{
                flex: 1,
                height: `${opt.h * 100}%`,
                background: sel ? C.teal : "#D4CEC5",
                opacity: sel ? 0.9 : 0.35,
                border: `1.5px solid ${sel ? C.teal : "transparent"}`,
                borderRadius: "4px 4px 0 0",
                cursor: "pointer",
                padding: 0,
                transition: "background 0.1s, opacity 0.1s",
              }}
            />
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 5, marginBottom: 12 }}>
        {ANTIGUEDAD_DIST.map((opt) => {
          const sel = filters.antiguedad === opt.value;
          return (
            <button
              key={String(opt.value)}
              onClick={() => { onChange({ antiguedad: opt.value as string | null }); onClose(); }}
              style={{
                flex: 1, fontSize: 9, padding: "2px 0", textAlign: "center",
                color: sel ? C.teal : C.muted, fontWeight: sel ? 700 : 400,
                background: "none", border: "none", cursor: "pointer",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <button
        onClick={() => { onChange({ antiguedad: null }); onClose(); }}
        style={{ width: "100%", padding: "7px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontSize: 12, cursor: "pointer" }}
      >
        Todas las antigüedades
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MapFilterBar({
  activeTab, filters, onFiltersChange, onResetAll, allBarrios, onBarrioNavigate,
}: MapFilterBarProps) {
  const isPro = useIsPro();
  const [open, setOpen] = useState<DropdownId | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const toggle = (id: DropdownId, a: DOMRect) => {
    setAnchor(a);
    setOpen((p) => (p === id ? null : id));
  };
  const close  = () => setOpen(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!barRef.current?.contains(t) && !dropdownRef.current?.contains(t)) close();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (activeTab === "agent" || activeTab === "simulator" || activeTab === "comparador") return null;

  const isRent     = activeTab === "rent";
  const activeCount = countActive(filters, activeTab);
  const precioActive     = filters.precioMax !== null || filters.precioMin !== null;
  const habActive        = filters.habitaciones !== null;
  const tipoActive       = filters.tipoInmueble !== null;
  const areaActive       = filters.areaMin !== null || filters.areaMax !== null;
  const banosActive      = filters.banos !== null;
  const antiguedadActive = filters.antiguedad !== null;

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
  const desktopContent = (
    <div style={{ display: "flex", alignItems: "center", gap: 7, overflowX: "auto", paddingBottom: 2 }}>

      {/* Precio */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        <FilterPill
          label={precioLabel(filters, isRent)}
          active={precioActive}
          onClear={() => onFiltersChange({ precioMin: null, precioMax: null })}
          onClick={(a) => toggle("precio", a)}
          isOpen={open === "precio"}
        />
      </div>

      {/* Habitaciones */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        <FilterPill
          label={habLabel(filters)}
          active={habActive}
          onClear={() => onFiltersChange({ habitaciones: null })}
          onClick={(a) => toggle("habitaciones", a)}
          isOpen={open === "habitaciones"}
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

      {/* Área */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        <FilterPill
          label={areaLabel(filters)}
          active={areaActive}
          onClear={() => onFiltersChange({ areaMin: null, areaMax: null })}
          onClick={(a) => toggle("area", a)}
          isOpen={open === "area"}
        />
      </div>

      {/* BUY-only */}
      {activeTab === "buy" && (
        <>
          {/* Baños */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <FilterPill
              label={banosLabel(filters)}
              active={banosActive}
              onClear={() => onFiltersChange({ banos: null })}
              onClick={(a) => toggle("banos", a)}
              isOpen={open === "banos"}
            />
          </div>

          {/* Antigüedad */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <FilterPill
              label={antiguedadLabel(filters)}
              active={antiguedadActive}
              onClear={() => onFiltersChange({ antiguedad: null })}
              onClick={(a) => toggle("antiguedad", a)}
              isOpen={open === "antiguedad"}
            />
          </div>
        </>
      )}

      {/* + Más filtros */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        <FilterPill
          label={`+ Más${activeCount > 0 ? ` (${activeCount})` : ""}`}
          active={false}
          onClick={(a) => toggle("mas", a)}
          isOpen={open === "mas"}
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
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>Filtros</span>
          <button onClick={() => setMobileOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted }}>
            <X size={20} />
          </button>
        </div>

        {/* Precio */}
        <div style={{ marginBottom: 20 }}>
          <span style={labelSm}>{isRent ? "Precio / mes" : "Precio"}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="number" placeholder="Mínimo" value={filters.precioMin ?? ""}
              onChange={(e) => onFiltersChange({ precioMin: e.target.value ? Number(e.target.value) : null })}
              style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none" }}
            />
            <input
              type="number" placeholder="Máximo" value={filters.precioMax ?? ""}
              onChange={(e) => onFiltersChange({ precioMax: e.target.value ? Number(e.target.value) : null })}
              style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none" }}
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
                {["Todas", "1+", "2+", "3+", "4+"][i]}
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
            <input type="number" placeholder="Mínima" value={filters.areaMin ?? ""} onChange={(e) => onFiltersChange({ areaMin: e.target.value ? Number(e.target.value) : null })} style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none" }} />
            <input type="number" placeholder="Máxima" value={filters.areaMax ?? ""} onChange={(e) => onFiltersChange({ areaMax: e.target.value ? Number(e.target.value) : null })} style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none" }} />
          </div>
        </div>

        {activeTab === "buy" && (
          <>
            {/* Baños */}
            <div style={{ marginBottom: 20 }}>
              <span style={labelSm}>Baños</span>
              <div style={{ display: "flex", gap: 6 }}>
                {[null, 1, 2, 3].map((b, i) => (
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
                    {["Todos", "1+", "2+", "3+"][i]}
                  </button>
                ))}
              </div>
            </div>

            {/* Antigüedad */}
            <div style={{ marginBottom: 20 }}>
              <span style={labelSm}>Antigüedad</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[{ value: null, label: "Todas" }, ...ANTIGUEDAD_OPTIONS].map((opt) => (
                  <label key={String(opt.value)} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: C.ink }}>
                    <input
                      type="radio" name="antiguedad-m"
                      checked={filters.antiguedad === (opt.value as string | null)}
                      onChange={() => onFiltersChange({ antiguedad: opt.value as string | null })}
                      style={{ accentColor: C.teal }}
                    />
                    {opt.label}
                  </label>
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
            <PrecioPanel filters={filters} isRent={isRent} onChange={onFiltersChange} onClose={close} />
          </div>
        );
      case "habitaciones":
        return (
          <div ref={dropdownRef} style={wrapStyle}>
            <div style={panelBase}>
              <span style={labelSm}>Habitaciones</span>
              <BtnGroup
                options={[
                  { value: null, label: "Cualquiera" },
                  { value: 1, label: "1+" },
                  { value: 2, label: "2+" },
                  { value: 3, label: "3+" },
                  { value: 4, label: "4+" },
                ]}
                current={filters.habitaciones}
                onChange={(v) => { onFiltersChange({ habitaciones: v }); close(); }}
              />
            </div>
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
      case "area":
        return (
          <div ref={dropdownRef} style={wrapStyle}>
            <AreaPanel filters={filters} onChange={onFiltersChange} onClose={close} />
          </div>
        );
      case "banos":
        return (
          <div ref={dropdownRef} style={wrapStyle}>
            <div style={panelBase}>
              <span style={labelSm}>Baños</span>
              <BtnGroup
                options={[
                  { value: null, label: "Cualquiera" },
                  { value: 1, label: "1+" },
                  { value: 2, label: "2+" },
                  { value: 3, label: "3+" },
                ]}
                current={filters.banos}
                onChange={(v) => { onFiltersChange({ banos: v }); close(); }}
              />
            </div>
          </div>
        );
      case "antiguedad":
        return (
          <div ref={dropdownRef} style={wrapStyle}>
            <AntiguedadPanel filters={filters} onChange={onFiltersChange} onClose={close} />
          </div>
        );
      case "mas": {
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
                Más filtros
              </span>

              {/* Estrato */}
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

              {/* Tiempo — condicional según tab */}
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
                  onClick={() => { onResetAll?.(); close(); }}
                  style={{ flex: 1, padding: "8px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontSize: 12, cursor: "pointer" }}
                >
                  Limpiar todo
                </button>
                <button
                  onClick={close}
                  style={{ flex: 1, padding: "8px", borderRadius: 8, background: C.teal, color: "#fff", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                >
                  Aplicar
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
          position: "absolute", top: 52, left: 0, right: 0, zIndex: 30,
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

      {activePanel}
      {mobileSheet}
    </>
  );
}
