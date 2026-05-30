import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ExternalLink } from "lucide-react";
import type { ApiListing, BarrioOption, Neighborhood } from "@/lib/adapters";
import { formatCOP } from "@/lib/format";

type Props = {
  barrio: Neighborhood;
  listings: ApiListing[];
  isLoading: boolean;
  onBack: () => void;
  onListingSelect: (listing: ApiListing) => void;
  highlightedListingId?: number | null;
  activeBarrioName?: string | null;
  onBarrioFilter?: (barrio: string | null) => void;
  allBarrios?: BarrioOption[];
  onBarrioNavigate?: (opt: BarrioOption) => void;
  onFilteredListingsChange?: (listings: ApiListing[]) => void;
};

type Filters = {
  tipoOp: "todos" | "venta" | "arriendo";
  precioMax: number | null;
  areaMin: number | null;
  habitaciones: number | null;
  tipoInmueble: string | null;
};

const PRECIO_MAX_OPTIONS = [
  { label: "Sin límite", value: null },
  { label: "$500M", value: 500_000_000 },
  { label: "$800M", value: 800_000_000 },
  { label: "$1,500M", value: 1_500_000_000 },
  { label: "$3,000M", value: 3_000_000_000 },
  { label: "$5,000M", value: 5_000_000_000 },
];

const TIPO_INMUEBLE_OPTIONS = [
  { label: "Todos", value: null },
  { label: "Apto", value: "apartamento" },
  { label: "Casa", value: "casa" },
  { label: "Local", value: "local" },
  { label: "Oficina", value: "oficina" },
];

function tierColor(l: ApiListing): string {
  if (l.buena_oferta) return "#10b981";
  if (l.tipo_operacion === "arriendo") return "#3b82f6";
  return "#00d4ff";
}

function ListingCard({
  listing,
  highlighted,
  onSelect,
  cardRef,
}: {
  listing: ApiListing;
  highlighted: boolean;
  onSelect: () => void;
  cardRef?: (el: HTMLDivElement | null) => void;
}) {
  const precio = listing.precio_cop ? formatCOP(listing.precio_cop) : "—";
  const precioUsd = listing.precio_usd
    ? `~$${(listing.precio_usd / 1000).toFixed(0)}k USD`
    : null;
  const _pm2 = listing.precio_m2;
  const m2 =
    _pm2 && _pm2 > 0 && _pm2 < 50_000_000
      ? `$${(_pm2 / 1_000_000).toFixed(1)}M/m²`
      : "N/A";
  const tipo = listing.tipo_operacion?.toUpperCase() ?? "—";
  const tipoColor = listing.tipo_operacion === "arriendo" ? "#3b82f6" : "#00d4ff";
  const badgeColor = tierColor(listing);
  const showBuenaOferta = listing.buena_oferta;
  const tipoInmueble = listing.tipo_inmueble ?? "";
  const specs = [
    listing.habitaciones ? `${listing.habitaciones} hab` : null,
    listing.banos ? `${listing.banos} baños` : null,
    listing.area_m2 ? `${listing.area_m2}m²` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      ref={cardRef}
      onClick={onSelect}
      className={`cursor-pointer rounded-lg border p-3 transition-all ${
        highlighted
          ? "border-cyan-400/60 bg-cyan-400/10 shadow-md shadow-cyan-400/20"
          : "border-border bg-surface/60 hover:border-border/80 hover:bg-surface/90"
      }`}
    >
      <div className="mb-2 flex items-center gap-2 flex-wrap">
        {listing.disponible_actualmente === false && (
          <span className="rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/60 border border-border">
            YA NO DISPONIBLE
          </span>
        )}
        {showBuenaOferta && listing.disponible_actualmente !== false && (
          <span
            className="rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white"
            style={{ background: badgeColor }}
          >
            BUENA OFERTA
          </span>
        )}
        <span
          className="rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white"
          style={{ background: tipoColor }}
        >
          {tipo}
        </span>
        {tipoInmueble && (
          <span className="text-[11px] text-muted-foreground capitalize">
            {tipoInmueble}
          </span>
        )}
      </div>

      <div className="text-base font-bold leading-tight">{precio}</div>
      {precioUsd && <div className="text-[11px] text-muted-foreground">{precioUsd}</div>}
      {specs && <div className="mt-1 text-xs text-muted-foreground">{specs}</div>}
      <div className="text-[11px] text-muted-foreground">{m2}</div>

      {(listing.pct_bajo_mediana ?? 0) > 5 && (
        <div className="mt-1.5 text-[11px] font-medium text-emerald-400">
          {listing.pct_bajo_mediana?.toFixed(0)}% bajo la mediana del barrio
        </div>
      )}

      <div className="mt-2 flex items-center justify-between">
        {listing.url && listing.disponible_actualmente !== false ? (
          <a
            href={listing.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 text-[10px] text-muted-foreground/60 capitalize hover:text-primary transition-colors"
          >
            {listing.fuente ?? "—"}
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        ) : listing.disponible_actualmente === false ? (
          <span
            className="flex items-center gap-1 text-[10px] text-muted-foreground/40 capitalize cursor-default"
            title="Este listing ya no está disponible, pero sus datos son referencia histórica del mercado"
          >
            {listing.fuente ?? "—"}
            <ExternalLink className="h-2.5 w-2.5 opacity-30" />
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground/60 capitalize">
            {listing.fuente ?? "—"}
          </span>
        )}
      </div>
    </div>
  );
}

function toTitleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function MLSPanel({
  barrio,
  listings,
  isLoading,
  onBack,
  onListingSelect,
  highlightedListingId,
  activeBarrioName,
  onBarrioFilter,
  allBarrios,
  onBarrioNavigate,
  onFilteredListingsChange,
}: Props) {
  const [filters, setFilters] = useState<Filters>({
    tipoOp: "todos",
    precioMax: null,
    areaMin: null,
    habitaciones: null,
    tipoInmueble: null,
  });

  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const listContainerRef = useRef<HTMLDivElement>(null);

  const barrioNames = useMemo(() => {
    const names = new Set<string>();
    listings.forEach((l) => { if (l.barrio_nombre) names.add(l.barrio_nombre); });
    return [...names].sort();
  }, [listings]);

  const nVenta = useMemo(
    () => listings.filter((l) => l.tipo_operacion === "venta").length,
    [listings],
  );
  const nArriendo = useMemo(
    () => listings.filter((l) => l.tipo_operacion === "arriendo").length,
    [listings],
  );

  // Listings that pass the type/price/area/rooms/tipo filters (no barrio_nombre filter)
  // — used for updating the map GeoJSON
  const filteredForMap = useMemo(() => {
    return listings.filter((l) => {
      if (filters.tipoOp !== "todos" && l.tipo_operacion !== filters.tipoOp) return false;
      if (filters.precioMax !== null && (l.precio_cop ?? 0) > filters.precioMax) return false;
      if (filters.areaMin !== null && (l.area_m2 ?? 0) < filters.areaMin) return false;
      if (filters.habitaciones !== null) {
        if (filters.habitaciones === 4) {
          if ((l.habitaciones ?? 0) < 4) return false;
        } else {
          if (l.habitaciones !== filters.habitaciones) return false;
        }
      }
      if (filters.tipoInmueble !== null) {
        const ti = (l.tipo_inmueble ?? "").toLowerCase();
        if (!ti.includes(filters.tipoInmueble)) return false;
      }
      return true;
    });
  }, [listings, filters]);

  // Panel list also respects the barrio name button filter
  const filtered = useMemo(() => {
    if (!activeBarrioName) return filteredForMap;
    return filteredForMap.filter((l) => l.barrio_nombre === activeBarrioName);
  }, [filteredForMap, activeBarrioName]);

  // Notify parent when map-relevant filters change so it can update the GeoJSON
  useEffect(() => {
    onFilteredListingsChange?.(filteredForMap);
  }, [filteredForMap]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll highlighted card into view
  useEffect(() => {
    if (highlightedListingId == null) return;
    const el = cardRefs.current[highlightedListingId];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [highlightedListingId]);

  const btnFilter = (active: boolean) =>
    `rounded-md px-2.5 py-1 text-xs font-medium transition ${
      active
        ? "bg-primary/20 text-primary border border-primary/40"
        : "bg-surface/60 text-muted-foreground border border-border hover:text-foreground"
    }`;

  const headerName = toTitleCase(activeBarrioName ?? barrio.comuna ?? barrio.nombre);

  return (
    <AnimatePresence>
      <motion.aside
        key="mls-panel"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 280 }}
        className="absolute right-0 top-0 z-20 flex h-full w-[380px] max-w-full flex-col border-l border-border bg-background/95 backdrop-blur-xl shadow-2xl"
      >
        {/* Header */}
        <div className="border-b border-border px-4 pb-3 pt-16">
          <button
            onClick={onBack}
            className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver al análisis
          </button>
          <div className="flex items-baseline gap-2">
            <h2 className="font-display text-base font-semibold">{headerName}</h2>
            <span className="text-[11px] text-muted-foreground">(comuna)</span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isLoading
              ? "Cargando…"
              : listings.length === 0
              ? "Sin propiedades"
              : `${filtered.length} propiedades · ${nVenta} venta · ${nArriendo} arriendo`}
          </p>
        </div>

        {/* Navegación a otro barrio/municipio */}
        {allBarrios && allBarrios.length > 0 && (
          <div className="border-b border-border px-4 py-2">
            <select
              className="w-full rounded-md border border-border bg-background/80 px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              value=""
              onChange={(e) => {
                const id = Number(e.target.value);
                const opt = allBarrios.find((b) => b.id === id);
                if (opt) onBarrioNavigate?.(opt);
              }}
            >
              <option value="" disabled>Ir a barrio…</option>
              {Object.entries(
                allBarrios.reduce<Record<string, BarrioOption[]>>((acc, b) => {
                  const m = toTitleCase(b.municipio);
                  if (!acc[m]) acc[m] = [];
                  acc[m].push(b);
                  return acc;
                }, {})
              )
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([municipio, opts]) => (
                  <optgroup key={municipio} label={municipio}>
                    {opts
                      .sort((a, b) => a.nombre.localeCompare(b.nombre))
                      .map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {toTitleCase(opt.nombre)}
                        </option>
                      ))}
                  </optgroup>
                ))}
            </select>
          </div>
        )}

        {/* Filtros */}
        <div className="border-b border-border px-4 py-3 space-y-3">
          <div className="flex gap-2">
            {(["todos", "venta", "arriendo"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilters((f) => ({ ...f, tipoOp: t }))}
                className={btnFilter(filters.tipoOp === t)}
              >
                {t === "todos" ? "Todos" : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-muted-foreground shrink-0">Precio máx:</span>
            {PRECIO_MAX_OPTIONS.map((o) => (
              <button
                key={String(o.value)}
                onClick={() => setFilters((f) => ({ ...f, precioMax: o.value }))}
                className={btnFilter(filters.precioMax === o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Habs:</span>
            {([null, 1, 2, 3, 4] as (number | null)[]).map((h) => (
              <button
                key={String(h)}
                onClick={() => setFilters((f) => ({ ...f, habitaciones: h }))}
                className={btnFilter(filters.habitaciones === h)}
              >
                {h === null ? "Todos" : h === 4 ? "4+" : String(h)}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-muted-foreground shrink-0">Tipo:</span>
            {TIPO_INMUEBLE_OPTIONS.map((o) => (
              <button
                key={String(o.value)}
                onClick={() => setFilters((f) => ({ ...f, tipoInmueble: o.value }))}
                className={btnFilter(filters.tipoInmueble === o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>

          {barrioNames.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
              <span className="text-[11px] text-muted-foreground shrink-0">Barrio:</span>
              <button
                onClick={() => onBarrioFilter?.(null)}
                className={`${btnFilter(activeBarrioName == null)} shrink-0`}
              >
                Todos
              </button>
              {barrioNames.map((b) => (
                <button
                  key={b}
                  onClick={() => onBarrioFilter?.(b)}
                  className={`${btnFilter(activeBarrioName === b)} shrink-0`}
                >
                  {toTitleCase(b)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Leyenda */}
        <div className="flex items-center gap-4 border-b border-border px-4 py-2">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            Buena oferta
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
            Arriendo
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-full bg-cyan-400" />
            Venta
          </div>
        </div>

        {/* Lista */}
        <div ref={listContainerRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
          {isLoading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              Cargando listings…
            </div>
          )}
          {!isLoading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <div className="text-3xl mb-2">🏠</div>
              <div className="text-sm font-medium">Sin resultados</div>
              <div className="text-xs mt-1">Intenta con otros filtros</div>
            </div>
          )}
          {filtered.map((l) => (
            <ListingCard
              key={l.id}
              listing={l}
              highlighted={highlightedListingId === l.id}
              onSelect={() => onListingSelect(l)}
              cardRef={(el) => { cardRefs.current[l.id] = el; }}
            />
          ))}
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}
