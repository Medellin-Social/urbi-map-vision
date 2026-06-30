import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Drawer } from "vaul";
import { useIsMobile } from "@/hooks/use-mobile";
import { ArrowLeft, ExternalLink, Plus, Check } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import type { ApiListing, BarrioOption, Neighborhood } from "@/lib/adapters";
import { formatCOP } from "@/lib/format";
import { useFavoritosListings } from "@/hooks/useFavoritosListings";
import { auth } from "@/lib/auth";
import { useTarget, targetTipoOperacion } from "@/contexts/TargetContext";
import { type SharedFilters, EMPTY_SHARED_FILTERS } from "@/components/MapFilterBar";
import { useComparadorStore } from "@/hooks/useComparadorStore";
import { useTrm } from "@/hooks/useTrm";
import { useIsPro } from "@/components/LockedField";
import { toast } from "sonner";

type Props = {
  barrio: Neighborhood;
  listings: ApiListing[];
  isLoading: boolean;
  onBack: () => void;
  onListingSelect: (listing: ApiListing, screenX: number, screenY: number) => void;
  highlightedListingId?: number | null;
  activeBarrioName?: string | null;
  onBarrioFilter?: (barrio: string | null) => void;
  allBarrios?: BarrioOption[];
  onBarrioNavigate?: (opt: BarrioOption) => void;
  radioUsadoMetros?: number | null;
  barriosIncluidos?: string[] | null;
  premiumExpanded?: ApiListing[];
  premiumIsLoading?: boolean;
  premiumRadio?: number | null;
  premiumBarriosIncluidos?: string[] | null;
  onPremiumExpand?: (v: boolean) => void;
  externalFilters?: SharedFilters;
  // Commune drill-down
  activeComuna?: string | null;
  activeMunicipio?: string | null;
  comunaBarrios?: Array<{ barrio_id: number; nombre: string }>;
  onBackToComuna?: () => void;
  onSelectBarrioInComune?: (barrioId: number) => void;
  // Mobile bottom-sheet (vaul) — controlled snap, owned by map.tsx so MapView can
  // reconcile camera auto-select with the sheet height. Ignored on desktop.
  sheetSnapPoints?: (number | string)[];
  sheetSnap?: number | string | null;
  onSheetSnapChange?: (s: number | string | null) => void;
};

// Internal-only filters — common filters (precio, hab, tipo, area, banos, antiguedad, tipoOp)
// now live in SharedFilters and come via the externalFilters prop from map.tsx.
type Filters = {
  soloPromium: boolean;
  modalidad: "corto" | "medio" | "largo" | null;
  scoreMin: number | null;
  scoreMax: number | null;
  yieldMin: number | null;
  yieldMax: number | null;
};

const TIPO_LABELS: Record<string, string> = {
  apartamento:   "Apartamento",
  apartaestudio: "Apartaestudio",
  casa:          "Casa",
  casa_lote:     "Casa-Lote",
  finca:         "Finca",
  local:         "Local comercial",
  oficina:       "Oficina",
  bodega:        "Bodega",
  consultorio:   "Consultorio",
  lote:          "Lote",
};

const TIPO_GRUPOS = [
  { label: "Residencial", tipos: ["apartamento", "apartaestudio", "casa", "casa_lote", "finca"] },
  { label: "Comercial",   tipos: ["local", "oficina", "bodega", "consultorio"] },
  { label: "Terreno",     tipos: ["lote"] },
];

const TIPO_INMUEBLE_COLOR: Record<string, string> = {
  apartamento:   '#1D9E75',
  casa:          '#D85A30',
  casa_lote:     '#D85A30',
  finca:         '#D85A30',
  apartaestudio: '#5DCAA5',
  lote:          '#BA7517',
  local:         '#7F77DD',
  oficina:       '#378ADD',
  bodega:        '#9B8B75',
  consultorio:   '#9B8B75',
};

function getTipoInmuebleBadgeStyle(tipo: string): React.CSSProperties {
  const bg = TIPO_INMUEBLE_COLOR[tipo] ?? '#9B8B75';
  return { background: bg, color: '#FFFFFF' };
}

function tierColor(l: ApiListing): string {
  if (l.tier === "agencia_premium") return "#ffc928";
  return TIPO_INMUEBLE_COLOR[l.tipo_inmueble ?? ""] ?? "#9B8B75";
}

function diasLabel(dias: number | null | undefined): string | null {
  if (dias == null || dias < 0) return null;
  if (dias === 0) return "Publicado hoy";
  if (dias === 1) return "Publicado ayer";
  if (dias < 7)  return `${dias} días`;
  if (dias < 30) return `${Math.floor(dias / 7)} semana${Math.floor(dias / 7) > 1 ? "s" : ""}`;
  if (dias < 365) return `${Math.floor(dias / 30)} mes${Math.floor(dias / 30) > 1 ? "es" : ""}`;
  return `+${Math.floor(dias / 365)} año${Math.floor(dias / 365) > 1 ? "s" : ""}`;
}

function ListingCard({
  listing,
  highlighted,
  onSelect,
  cardRef,
  isFav,
  onToggleFav,
  onSimular,
}: {
  listing: ApiListing;
  highlighted: boolean;
  onSelect: (e: React.MouseEvent) => void;
  cardRef?: (el: HTMLDivElement | null) => void;
  isFav: boolean;
  onToggleFav: () => void;
  onSimular: () => void;
}) {
  const isPro = useIsPro();
  const isMobile = useIsMobile();
  const { addListing, removeListing, isSelected, canAdd } = useComparadorStore();
  const selected = isSelected(listing.id);
  const trm = useTrm();
  const precio = listing.precio_cop ? formatCOP(listing.precio_cop) : "—";
  const precioUsd = listing.precio_cop
    ? `~$${(listing.precio_cop / trm / 1000).toFixed(0)}k USD`
    : null;
  const _pm2 = listing.precio_m2;
  const m2 =
    _pm2 && _pm2 > 0 && _pm2 < 50_000_000
      ? `$${(_pm2 / 1_000_000).toFixed(1)}M/m²`
      : "N/A";
  const tipo = listing.tipo_operacion?.toUpperCase() ?? "—";
  const tipoInmueble = listing.tipo_inmueble ?? "";
  const specs = [
    listing.habitaciones ? `${listing.habitaciones} hab` : null,
    listing.banos ? `${listing.banos} baños` : null,
    listing.area_m2 ? `${listing.area_m2}m²` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // Mobile: vertical compact card — photo + tipo badge + price + specs + fav only.
  if (isMobile) {
    return (
      <div
        ref={cardRef}
        onClick={(e) => onSelect(e)}
        className="cursor-pointer rounded-lg border overflow-hidden"
        style={highlighted
          ? { border: '1.5px solid #1D9E75', background: '#FFFFFF', boxShadow: '0 2px 8px rgba(29,158,117,0.15)' }
          : { border: '0.5px solid #E8E0D0', background: '#FFFFFF' }
        }
      >
        <div className="relative h-[90px] w-full overflow-hidden" style={{ background: '#F5F0E8' }}>
          {listing.foto_principal ? (
            <img src={listing.foto_principal} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="flex h-full w-full items-center justify-center" style={{ background: 'linear-gradient(135deg, #1D9E75 0%, #085041 100%)' }}>
              <span style={{ color: '#fff', opacity: 0.5, fontSize: 11, fontWeight: 700 }}>Medellín Social</span>
            </div>
          )}
          <span
            className="absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
            style={{ background: listing.tipo_operacion === "arriendo" ? "#1D9E75" : "#D85A30", color: "#FFFFFF" }}
          >
            {tipo}
          </span>
        </div>
        <div className="flex items-start justify-between gap-2 p-2">
          <div className="min-w-0">
            <div className="text-sm font-bold leading-tight text-[#1A1208]">{precio}</div>
            {specs && <div className="mt-0.5 truncate text-[11px] text-[#6B5B45]">{specs}</div>}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFav(); }}
            className="shrink-0 text-base leading-none transition hover:scale-110"
            title={isFav ? "Quitar de favoritos" : "Guardar propiedad"}
          >
            {isFav ? "❤️" : "🤍"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={cardRef}
      onClick={(e) => onSelect(e)}
      className="cursor-pointer rounded-lg border overflow-hidden transition-all hover:bg-[#F5F0E8]"
      style={highlighted
        ? { border: '1.5px solid #1D9E75', background: '#FFFFFF', boxShadow: '0 2px 8px rgba(29,158,117,0.15)' }
        : { border: '0.5px solid #E8E0D0', background: '#FFFFFF' }
      }
    >
      {/* Photo */}
      <div className="relative h-[140px] w-full overflow-hidden" style={{ background: '#F5F0E8' }}>
        {listing.foto_principal ? (
          <img
            src={listing.foto_principal}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #1D9E75 0%, #085041 100%)' }}
          >
            <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: 36, height: 36, opacity: 0.45 }}>
              <rect x="6" y="12" width="24" height="30" rx="1" fill="white"/>
              <rect x="30" y="20" width="14" height="22" rx="1" fill="white"/>
              <rect x="10" y="16" width="4" height="4" fill="#1D9E75"/>
              <rect x="18" y="16" width="4" height="4" fill="#1D9E75"/>
              <rect x="10" y="24" width="4" height="4" fill="#1D9E75"/>
              <rect x="18" y="24" width="4" height="4" fill="#1D9E75"/>
              <rect x="13" y="32" width="6" height="10" fill="#1D9E75"/>
              <rect x="34" y="24" width="4" height="4" fill="#1D9E75"/>
              <rect x="34" y="30" width="4" height="4" fill="#1D9E75"/>
            </svg>
          </div>
        )}
        {/* VENTA/ARRIENDO badge over photo */}
        <span
          className="absolute top-2 left-2 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
          style={{
            background: listing.tipo_operacion === "arriendo" ? "#1D9E75" : "#D85A30",
            color:      "#FFFFFF",
          }}
        >
          {tipo}
        </span>
        {/* Comparador "+" button */}
        {isPro && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (selected) {
                removeListing(listing.id);
              } else if (canAdd) {
                addListing(listing);
              } else {
                toast.info("Máximo 5 inmuebles en el comparador");
              }
            }}
            title={selected ? "Quitar de comparación" : canAdd ? "Agregar a comparación" : "Máximo 5 inmuebles"}
            className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full shadow-md transition hover:scale-110"
            style={{
              background: selected ? "#1D9E75" : "rgba(255,255,255,0.92)",
              border: selected ? "none" : "0.5px solid #E8E0D0",
            }}
          >
            {selected
              ? <Check className="h-3.5 w-3.5 text-white" />
              : <Plus className="h-3.5 w-3.5 text-[#1D9E75]" />
            }
          </button>
        )}
      </div>
      <div className="p-3">
      <div className="mb-2 flex items-center gap-2 flex-wrap">
        {listing.tier === "agencia_premium" && (
          <span className="rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ background: '#ffc928', color: '#1A1208' }}>
            ✦ Premium
          </span>
        )}
        {listing.disponible_actualmente === false && (
          <span className="rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/60 border border-border">
            YA NO DISPONIBLE
          </span>
        )}
        {isPro && listing.buena_oferta && listing.disponible_actualmente !== false && (
          <span
            className="rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
            style={{ background: '#E1F5EE', color: '#085041', border: '0.5px solid #1D9E75' }}
          >
            BUENA OFERTA
          </span>
        )}
        {listing.amoblado && (
          <span
            className="rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
            style={{ background: '#F0EBE1', color: '#6B5B45', border: '0.5px solid #C8B99A' }}
          >
            AMOBLADO
          </span>
        )}
        <span
          className="rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
          style={{
            background: listing.tipo_operacion === "arriendo" ? "#1D9E75" : "#D85A30",
            color:      "#FFFFFF",
          }}
        >
          {tipo}
        </span>
        {tipoInmueble && (
          <span className="rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={getTipoInmuebleBadgeStyle(tipoInmueble)}>
            {TIPO_LABELS[tipoInmueble] ?? tipoInmueble}
          </span>
        )}
      </div>

      <div className="text-base font-bold leading-tight text-[#1A1208]">{precio}</div>
      {precioUsd && <div className="text-[11px] text-[#6B5B45]">{precioUsd}</div>}
      {specs && <div className="mt-1 text-xs text-[#6B5B45]">{specs}</div>}
      <div className="text-[11px] text-[#6B5B45]">{m2}</div>

      {(listing.pct_bajo_mediana ?? 0) > 5 && (
        <div className="mt-1.5 text-[11px] font-medium text-[#085041]">
          {listing.pct_bajo_mediana?.toFixed(0)}% bajo la mediana del barrio
        </div>
      )}

      {diasLabel(listing.dias_en_mercado) && (
        <div
          className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium"
          title={listing.fecha_publicacion ? `Publicado el ${listing.fecha_publicacion}` : undefined}
        >
          {(listing.dias_en_mercado ?? 0) < 7 && (
            <span className="rounded px-1.5 py-0 text-[10px] font-bold uppercase tracking-wider" style={{ background: '#ffc928', color: '#1A1208' }}>
              NUEVO
            </span>
          )}
          <span className={
            (listing.dias_en_mercado ?? 0) < 7
              ? "text-[#085041]"
              : (listing.dias_en_mercado ?? 0) < 30
              ? "text-[#6B5B45]"
              : (listing.dias_en_mercado ?? 0) < 90
              ? "text-[#BA7517]"
              : "text-[#E24B4A]"
          }>
            {diasLabel(listing.dias_en_mercado)}
            {(listing.dias_en_mercado ?? 0) > 90 && " · Lleva tiempo"}
          </span>
        </div>
      )}

      <div className="mt-2 flex items-center justify-between">
        {listing.url && listing.disponible_actualmente !== false ? (
          <a
            href={listing.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 text-[10px] text-[#9B8B75] capitalize hover:text-[#1D9E75] transition-colors"
          >
            {listing.fuente ?? "—"}
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        ) : listing.disponible_actualmente === false ? (
          <span
            className="flex items-center gap-1 text-[10px] text-[#C8B8A2] capitalize cursor-default"
            title="Este listing ya no está disponible, pero sus datos son referencia histórica del mercado"
          >
            {listing.fuente ?? "—"}
            <ExternalLink className="h-2.5 w-2.5 opacity-30" />
          </span>
        ) : (
          <span className="text-[10px] text-[#9B8B75] capitalize">
            {listing.fuente ?? "—"}
          </span>
        )}

        <div className="flex items-center gap-1.5">
          <button
            onClick={(e) => { e.stopPropagation(); onSimular(); }}
            className="rounded px-1.5 py-0.5 text-[10px] text-[#9B8B75] border border-[#E8E0D0] hover:text-[#1D9E75] hover:border-[#1D9E75]/40 transition"
            title="Simular inversión"
          >
            Simular
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFav(); }}
            className="text-base leading-none transition hover:scale-110"
            title={isFav ? "Quitar de favoritos" : "Guardar propiedad"}
          >
            {isFav ? "❤️" : "🤍"}
          </button>
        </div>
      </div>
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
  radioUsadoMetros,
  barriosIncluidos,
  premiumExpanded = [],
  premiumIsLoading = false,
  premiumRadio,
  premiumBarriosIncluidos,
  onPremiumExpand,
  externalFilters,
  activeComuna,
  activeMunicipio,
  comunaBarrios,
  onBackToComuna,
  onSelectBarrioInComune,
  sheetSnapPoints,
  sheetSnap,
  onSheetSnapChange,
}: Props) {
  const isMobile = useIsMobile();
  const [filters, setFilters] = useState<Filters>({
    soloPromium: false,
    modalidad: null,
    scoreMin: null,
    scoreMax: null,
    yieldMin: null,
    yieldMax: null,
  });
  // Resolved external filters with safe defaults
  const ef = externalFilters ?? EMPTY_SHARED_FILTERS;
  const navigate = useNavigate();
  const { isFav, toggle: toggleFav } = useFavoritosListings();
  const { target, setTarget } = useTarget();

  // Reset internal filters when target or barrio changes
  useEffect(() => {
    setFilters({ soloPromium: false, modalidad: null, scoreMin: null, scoreMax: null, yieldMin: null, yieldMax: null });
  }, [target, barrio.id]);

  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const listContainerRef = useRef<HTMLDivElement>(null);


  const nVenta = useMemo(
    () => listings.filter((l) => l.tipo_operacion === "venta").length,
    [listings],
  );
  const nArriendo = useMemo(
    () => listings.filter((l) => l.tipo_operacion === "arriendo").length,
    [listings],
  );

  // Premium state — must be declared before filtered useMemo
  const premiumFilterActive = filters.soloPromium;
  const premiumInCurrent = useMemo(
    () => listings.filter((l) => l.tier === "agencia_premium").length,
    [listings],
  );

  // Shared filters (precio/hab/banos/area/estrato/tipo/dias/busqueda/tipoOp) are now
  // applied server-side in /viewport — the `listings` prop arrives pre-filtered, so the
  // panel renders the same set as the map. Only the panel-local refinements remain
  // client-side: premium toggle + investor score/yield (not part of the viewport query).
  const filtered = useMemo(() => {
    const src = (premiumFilterActive && premiumInCurrent === 0 && premiumExpanded.length > 0)
      ? premiumExpanded : listings;
    return src.filter((l) => {
      if (filters.soloPromium && l.tier !== "agencia_premium") return false;
      if (filters.scoreMin !== null && (l.barrio_score ?? 0) < filters.scoreMin) return false;
      if (filters.scoreMax !== null && (l.barrio_score ?? 0) > filters.scoreMax) return false;
      if (filters.yieldMin !== null && (l.barrio_yield ?? 0) < filters.yieldMin) return false;
      if (filters.yieldMax !== null && (l.barrio_yield ?? 0) > filters.yieldMax) return false;
      return true;
    });
  }, [listings, filters, premiumFilterActive, premiumInCurrent, premiumExpanded]);
  useEffect(() => {
    if (premiumFilterActive && premiumInCurrent === 0) {
      onPremiumExpand?.(true);
    } else {
      onPremiumExpand?.(false);
    }
  }, [premiumFilterActive, premiumInCurrent]); // eslint-disable-line react-hooks/exhaustive-deps

  // Source: use premiumExpanded when premium filter active and no local premium
  const effectiveListings = premiumFilterActive && premiumInCurrent === 0 && premiumExpanded.length > 0
    ? premiumExpanded
    : listings;
  const effectiveRadio = premiumFilterActive && premiumInCurrent === 0 && premiumExpanded.length > 0
    ? premiumRadio
    : radioUsadoMetros;
  const effectiveBarrios = premiumFilterActive && premiumInCurrent === 0 && premiumExpanded.length > 0
    ? premiumBarriosIncluidos
    : barriosIncluidos;

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

  const headerName = toTitleCase(barrio.nombre);
  const isAtBarrioLevel = barrio.id > 0;
  const isAtTopLevel = barrio.id === -1 && !activeComuna && !activeMunicipio;
  const comunaLabel = activeComuna
    ? toTitleCase(activeComuna)
    : activeMunicipio
    ? toTitleCase(activeMunicipio)
    : isAtBarrioLevel
    ? toTitleCase(barrio.comuna ?? "")
    : null;

  const panelVars = { '--background': '#FFFFFF', '--foreground': '#1A1208', '--surface': '#FAF7F2', '--surface-elevated': '#F5F0E8', '--muted': '#F5F0E8', '--muted-foreground': '#6B5B45', '--border': 'rgb(184 164 138 / 50%)', '--input': '#FAF7F2', '--card': '#FFFFFF', '--card-foreground': '#1A1208' } as React.CSSProperties;

  const peekCount = isLoading
    ? "Cargando…"
    : `${filtered.length} ${filtered.length === 1 ? "propiedad" : "propiedades"}`;

  const body = (
    <>
      {/* Peek summary — always visible at the smallest snap (handle + count) */}
      {isMobile && (
        <p className="px-4 pb-1.5 pt-0.5 text-center text-sm font-semibold text-foreground">{peekCount}</p>
      )}
        {/* Header — desktop clears the navbar+filterbar (104px); mobile sits in the sheet */}
        <div className={`border-b border-border px-4 pb-3 ${isMobile ? "pt-1" : "pt-[104px]"}`}>
          {isAtTopLevel ? (
            <button
              onClick={onBack}
              className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground transition hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Volver al análisis
            </button>
          ) : (
            <div className="mb-2 flex flex-wrap items-center gap-1 text-xs">
              <button
                onClick={onBack}
                className="font-medium text-primary transition hover:underline"
              >
                Medellín
              </button>
              {comunaLabel && (
                <>
                  <span className="text-muted-foreground/60">›</span>
                  {isAtBarrioLevel && onBackToComuna && activeComuna ? (
                    <button onClick={onBackToComuna} className="text-primary transition hover:underline">
                      {comunaLabel}
                    </button>
                  ) : (
                    <span className={isAtBarrioLevel ? "text-muted-foreground" : "font-semibold text-foreground"}>
                      {comunaLabel}
                    </span>
                  )}
                </>
              )}
              {isAtBarrioLevel && (
                <>
                  <span className="text-muted-foreground/60">›</span>
                  <span className="font-semibold text-foreground">{headerName}</span>
                </>
              )}
            </div>
          )}

          {!isAtBarrioLevel && (
            <div className="flex flex-col gap-0.5">
              <h2 className="font-display text-base font-semibold">{headerName}</h2>
            </div>
          )}

          {activeComuna && comunaBarrios && comunaBarrios.length > 0 && (
            <select
              value={isAtBarrioLevel ? String(barrio.id) : ""}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) onBackToComuna?.();
                else onSelectBarrioInComune?.(Number(v));
              }}
              className="mt-2 w-full cursor-pointer rounded-md border border-border bg-surface-elevated px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            >
              <option value="">Todos los barrios</option>
              {comunaBarrios
                .slice()
                .sort((a, b) => a.nombre.localeCompare(b.nombre))
                .map(b => (
                  <option key={b.barrio_id} value={b.barrio_id}>
                    {toTitleCase(b.nombre)}
                  </option>
                ))}
            </select>
          )}
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isLoading
              ? "Cargando…"
              : listings.length === 0
              ? "Sin propiedades"
              : filtered.length < listings.length
              ? `${filtered.length} de ${listings.length} propiedades`
              : ef.tipoOp === "todos"
              ? `${listings.length} propiedades · ${nVenta} venta · ${nArriendo} arriendo`
              : `${listings.length} propiedades`}
          </p>
          {!isLoading && !premiumIsLoading && effectiveRadio != null && effectiveRadio > 0 && (
            <p className="mt-0.5 text-[10px] text-muted-foreground/70">
              {premiumFilterActive && premiumInCurrent === 0
                ? `✦ Premium más cercano — ${effectiveBarrios?.slice(0,3).join(", ")}`
                : effectiveRadio === 500
                ? "+ barrios cercanos (500 m)"
                : "+ zona amplia (1 km)"}
            </p>
          )}
        </div>

        {/* Filtros internos: premium + landlord + investor */}
        <div className="border-b border-border px-4 py-2.5 flex gap-2 flex-wrap items-center">
          <button
            onClick={() => setFilters((f) => ({ ...f, soloPromium: !f.soloPromium }))}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition border ${
              filters.soloPromium
                ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                : "bg-surface/60 text-muted-foreground border-border hover:text-foreground"
            }`}
          >
            ✦ Premium
          </button>

          {target === "landlord" && (
            <>
              <span className="text-[11px] text-muted-foreground">Modalidad:</span>
              {([null, "corto", "medio", "largo"] as const).map((m) => (
                <button
                  key={String(m)}
                  onClick={() => setFilters((f) => ({ ...f, modalidad: m }))}
                  className={btnFilter(filters.modalidad === m)}
                >
                  {m === null ? "Todas" : m === "corto" ? "Corto" : m === "medio" ? "Medio" : "Largo"}
                </button>
              ))}
            </>
          )}

          {target === "investor" && (
            <div className="w-full space-y-2 pt-1">
              <div className="space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">Score: {filters.scoreMin ?? 0}–{filters.scoreMax ?? 100}</span>
                  {(filters.scoreMin !== null || filters.scoreMax !== null) && (
                    <button onClick={() => setFilters((f) => ({ ...f, scoreMin: null, scoreMax: null }))} className="text-[10px] text-primary">Reset</button>
                  )}
                </div>
                <input type="range" min={0} max={100} step={5} value={filters.scoreMin ?? 0}
                  onChange={(e) => { const v = Number(e.target.value); const curMax = filters.scoreMax ?? 100; setFilters((f) => ({ ...f, scoreMin: v === 0 ? null : v, scoreMax: v > curMax ? (v === 100 ? null : v) : f.scoreMax })); }}
                  className="w-full accent-[#1D9E75] cursor-pointer" />
                <input type="range" min={0} max={100} step={5} value={filters.scoreMax ?? 100}
                  onChange={(e) => { const v = Number(e.target.value); const curMin = filters.scoreMin ?? 0; setFilters((f) => ({ ...f, scoreMax: v === 100 ? null : v, scoreMin: v < curMin ? (v === 0 ? null : v) : f.scoreMin })); }}
                  className="w-full accent-[#1D9E75] cursor-pointer" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">Yield: {filters.yieldMin ?? 0}%–{filters.yieldMax ?? 15}%</span>
                  {(filters.yieldMin !== null || filters.yieldMax !== null) && (
                    <button onClick={() => setFilters((f) => ({ ...f, yieldMin: null, yieldMax: null }))} className="text-[10px] text-primary">Reset</button>
                  )}
                </div>
                <input type="range" min={0} max={15} step={0.5} value={filters.yieldMin ?? 0}
                  onChange={(e) => { const v = Number(e.target.value); const curMax = filters.yieldMax ?? 15; setFilters((f) => ({ ...f, yieldMin: v === 0 ? null : v, yieldMax: v > curMax ? (v >= 15 ? null : v) : f.yieldMax })); }}
                  className="w-full accent-[#1D9E75] cursor-pointer" />
                <input type="range" min={0} max={15} step={0.5} value={filters.yieldMax ?? 15}
                  onChange={(e) => { const v = Number(e.target.value); const curMin = filters.yieldMin ?? 0; setFilters((f) => ({ ...f, yieldMax: v >= 15 ? null : v, yieldMin: v < curMin ? (v === 0 ? null : v) : f.yieldMin })); }}
                  className="w-full accent-[#1D9E75] cursor-pointer" />
              </div>
            </div>
          )}
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
              key={`${l.fuente ?? "x"}-${l.id}`}
              listing={l}
              highlighted={highlightedListingId === l.id}
              onSelect={(e) => onListingSelect(l, e.clientX, e.clientY)}
              cardRef={(el) => { cardRefs.current[l.id] = el; }}
              isFav={isFav(l.url)}
              onToggleFav={() => {
                if (!auth.get()) return;
                toggleFav(l.url, l.barrio_id);
              }}
              onSimular={() => {
                const p = new URLSearchParams();
                if (l.barrio_id) p.set("barrio", String(l.barrio_id));
                if (l.precio_cop) p.set("precio", String(l.precio_cop));
                if (l.area_m2)   p.set("area",   String(l.area_m2));
                if (l.url)       p.set("uid",     l.url);
                if (l.fuente)    p.set("fuente",  l.fuente);
                if (l.url)       p.set("url_listing", l.url);
                navigate({ to: "/simulador", search: { barrio: l.barrio_id ?? undefined, precio: l.precio_cop ?? undefined } });
              }}
            />
          ))}
        </div>
    </>
  );

  // Mobile: bottom-sheet over the full-screen map. modal=false keeps the map
  // interactive behind the sheet; dismissible=false keeps it pinned (snaps only).
  if (isMobile) {
    return (
      <Drawer.Root
        open
        modal={false}
        dismissible={false}
        snapPoints={sheetSnapPoints ?? [0.12, 0.5, 0.9]}
        activeSnapPoint={sheetSnap ?? 0.12}
        setActiveSnapPoint={(s) => onSheetSnapChange?.(s)}
      >
        <Drawer.Portal>
          <Drawer.Content
            className="fixed inset-x-0 bottom-0 z-30 flex h-full max-h-[97%] flex-col rounded-t-2xl shadow-2xl outline-none"
            style={{ background: '#FAF7F2', borderTop: '0.5px solid #E8E0D0', ...panelVars }}
          >
            <Drawer.Handle className="!mx-auto !my-2 !h-1.5 !w-12 !rounded-full !bg-border" />
            {body}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  // Desktop: unchanged — right-edge overlay column (380px).
  return (
    <AnimatePresence>
      <motion.aside
        key="mls-panel"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 280 }}
        className="absolute right-0 top-0 z-20 flex h-full w-[380px] max-w-full flex-col shadow-2xl"
        style={{ background: '#FAF7F2', borderLeft: '0.5px solid #E8E0D0', ...panelVars }}
      >
        {body}
      </motion.aside>
    </AnimatePresence>
  );
}
