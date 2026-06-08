import { useState, useRef, useEffect } from "react";
import { ChevronDown, X, SlidersHorizontal } from "lucide-react";
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
};

export const TAB_TIPO_OP: Record<MapTab, "venta" | "arriendo" | "todos"> = {
  buy:   "venta",
  rent:  "arriendo",
  sell:  "todos",
  agent: "todos",
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
  return n;
}

// ─── FilterPill ───────────────────────────────────────────────────────────────

function FilterPill({
  label, active, onClear, onClick, isOpen,
}: {
  label: string;
  active: boolean;
  onClear?: () => void;
  onClick: () => void;
  isOpen: boolean;
}) {
  return (
    <button
      onClick={onClick}
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
  position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 50,
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
  const unit = isRent ? "k" : "M";
  const div  = isRent ? 1_000 : 1_000_000;
  const quicks = isRent ? [1000, 1500, 2000, 3000, 4000] : [200, 400, 600, 800, 1000];

  return (
    <div style={{ ...panelBase, minWidth: 280 }}>
      <span style={labelSm}>{isRent ? "Precio / mes (COP $k)" : "Rango de precio (COP $M)"}</span>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>Mínimo</div>
          <NumInput
            placeholder="0"
            value={filters.precioMin !== null ? Math.round(filters.precioMin / div) : null}
            onChange={(v) => onChange({ precioMin: v !== null ? v * div : null })}
          />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>Máximo</div>
          <NumInput
            placeholder="Sin límite"
            value={filters.precioMax !== null ? Math.round(filters.precioMax / div) : null}
            onChange={(v) => onChange({ precioMax: v !== null ? v * div : null })}
          />
        </div>
      </div>
      <span style={labelSm}>Opciones rápidas</span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {quicks.map((q, i) => {
          const isLast = i === quicks.length - 1;
          return (
            <button
              key={q}
              onClick={() => {
                if (isLast) onChange({ precioMin: q * div, precioMax: null });
                else        onChange({ precioMax: q * div, precioMin: null });
              }}
              style={{
                padding: "4px 10px", borderRadius: 8, fontSize: 12,
                border: `1px solid ${C.border}`, background: C.surface,
                color: C.ink, cursor: "pointer",
              }}
            >
              {isLast ? `$${q}${unit}+` : `$${q}${unit}`}
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

// ─── Main component ───────────────────────────────────────────────────────────

export function MapFilterBar({
  activeTab, filters, onFiltersChange, onResetAll, allBarrios, onBarrioNavigate,
}: MapFilterBarProps) {
  const [open, setOpen] = useState<DropdownId | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  const toggle = (id: DropdownId) => setOpen((p) => (p === id ? null : id));
  const close  = () => setOpen(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (activeTab === "agent") return null;

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
          onClick={() => toggle("precio")}
          isOpen={open === "precio"}
        />
        {open === "precio" && (
          <PrecioPanel
            filters={filters} isRent={isRent}
            onChange={onFiltersChange} onClose={close}
          />
        )}
      </div>

      {/* Habitaciones */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        <FilterPill
          label={habLabel(filters)}
          active={habActive}
          onClear={() => onFiltersChange({ habitaciones: null })}
          onClick={() => toggle("habitaciones")}
          isOpen={open === "habitaciones"}
        />
        {open === "habitaciones" && (
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
        )}
      </div>

      {/* Tipo */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        <FilterPill
          label={tipoLabel(filters)}
          active={tipoActive}
          onClear={() => onFiltersChange({ tipoInmueble: null })}
          onClick={() => toggle("tipo")}
          isOpen={open === "tipo"}
        />
        {open === "tipo" && (
          <div style={panelBase}>
            <span style={labelSm}>Tipo de inmueble</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {[{ value: null, label: "Todos los tipos" }, ...TIPO_OPTIONS].map((opt) => (
                <label
                  key={String(opt.value)}
                  style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}
                >
                  <input
                    type="radio"
                    name="tipo-dd"
                    checked={filters.tipoInmueble === opt.value}
                    onChange={() => { onFiltersChange({ tipoInmueble: opt.value }); close(); }}
                    style={{ accentColor: C.teal }}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Área */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        <FilterPill
          label={areaLabel(filters)}
          active={areaActive}
          onClear={() => onFiltersChange({ areaMin: null, areaMax: null })}
          onClick={() => toggle("area")}
          isOpen={open === "area"}
        />
        {open === "area" && (
          <div style={panelBase}>
            <span style={labelSm}>Área (m²)</span>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>Mínima</div>
                <NumInput
                  placeholder="0"
                  value={filters.areaMin}
                  onChange={(v) => onFiltersChange({ areaMin: v })}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>Máxima</div>
                <NumInput
                  placeholder="Sin límite"
                  value={filters.areaMax}
                  onChange={(v) => onFiltersChange({ areaMax: v })}
                />
              </div>
            </div>
          </div>
        )}
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
              onClick={() => toggle("banos")}
              isOpen={open === "banos"}
            />
            {open === "banos" && (
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
            )}
          </div>

          {/* Antigüedad */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <FilterPill
              label={antiguedadLabel(filters)}
              active={antiguedadActive}
              onClear={() => onFiltersChange({ antiguedad: null })}
              onClick={() => toggle("antiguedad")}
              isOpen={open === "antiguedad"}
            />
            {open === "antiguedad" && (
              <div style={panelBase}>
                <span style={labelSm}>Antigüedad</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {[{ value: null, label: "Todas" }, ...ANTIGUEDAD_OPTIONS].map((opt) => (
                    <label
                      key={String(opt.value)}
                      style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}
                    >
                      <input
                        type="radio"
                        name="antiguedad-dd"
                        checked={filters.antiguedad === (opt.value as string | null)}
                        onChange={() => { onFiltersChange({ antiguedad: opt.value as string | null }); close(); }}
                        style={{ accentColor: C.teal }}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* + Más filtros */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        <FilterPill
          label={`+ Más${activeCount > 0 ? ` (${activeCount})` : ""}`}
          active={false}
          onClick={() => toggle("mas")}
          isOpen={open === "mas"}
        />
        {open === "mas" && (
          <div style={{ ...panelBase, minWidth: 320 }}>
            <span style={{ ...labelSm, fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Más filtros</span>

            <span style={labelSm}>{isRent ? "Precio máx./mes" : "Precio máximo"}</span>
            <NumInput
              placeholder={isRent ? "COP máx mensual" : "COP máx total"}
              value={filters.precioMax}
              onChange={(v) => onFiltersChange({ precioMax: v })}
            />
            <div style={{ height: 14 }} />

            <span style={labelSm}>Área (m²)</span>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <NumInput placeholder="Mínima" value={filters.areaMin} onChange={(v) => onFiltersChange({ areaMin: v })} />
              <NumInput placeholder="Máxima" value={filters.areaMax} onChange={(v) => onFiltersChange({ areaMax: v })} />
            </div>

            <div style={{ display: "flex", gap: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
              <button
                onClick={() => { onResetAll?.(); close(); }}
                style={{
                  flex: 1, padding: "8px", borderRadius: 8,
                  border: `1px solid ${C.border}`, background: "transparent",
                  color: C.muted, fontSize: 12, cursor: "pointer",
                }}
              >
                Limpiar todo
              </button>
              <button
                onClick={close}
                style={{
                  flex: 1, padding: "8px", borderRadius: 8,
                  background: C.teal, color: "#fff", border: "none",
                  fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}
              >
                Aplicar filtros
              </button>
            </div>
          </div>
        )}
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
                  <label key={String(opt.value)} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
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

  // ── Bar container ──────────────────────────────────────────────────────────
  return (
    <>
      <div
        ref={barRef}
        style={{
          position: "absolute", top: 52, left: 0, right: 0, zIndex: 25,
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

      {mobileSheet}
    </>
  );
}
