import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navbar, ProfileChipMobile } from "@/components/Navbar";
import { MapView } from "@/components/MapView";
import { FloatingPanel } from "@/components/FloatingPanel";
import { ListingPanel } from "@/components/ListingPanel";
import { OpportunitiesPanel } from "@/components/OpportunitiesPanel";
import { MLSPanel } from "@/components/MLSPanel";
import type { Neighborhood } from "@/lib/adapters";
import type { ApiListing, ApiListingDetail } from "@/lib/adapters";
import { auth } from "@/lib/auth";
import { useListings, useBarriosRaw } from "@/hooks/useBarrios";
import { barrioToNeighborhood, barrioToOption, type BarrioOption } from "@/lib/adapters";
import { useMemo } from "react";
import { point, booleanPointInPolygon } from "@turf/turf";
import { apiFetch } from "@/lib/apiClient";
import { API_ENDPOINTS } from "@/config/api";
import { ListingDetailContent } from "./listing.$id";

export const Route = createFileRoute("/map")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem("medellin-social.user");
    if (!raw) throw redirect({ to: "/login" });
  },
  component: MapPage,
});

const GOAL_TO_PERFIL: Record<string, string> = {
  airbnb: "airbnb",
  "renta-larga": "largo_plazo",
  valorizacion: "largo_plazo",
  mediano_plazo: "mediano_plazo",
  nomadas: "mediano_plazo",
};

// ─── Listing detail modal ──────────────────────────────────────────────────────
function ListingDetailModal({
  listingId,
  onClose,
  flyToRef,
}: {
  listingId: number;
  onClose: () => void;
  flyToRef: React.MutableRefObject<((lat: number, lng: number) => void) | null>;
}) {
  const { data: listing, isLoading } = useQuery<ApiListingDetail>({
    queryKey: ["listing-modal", listingId],
    queryFn: () => apiFetch(API_ENDPOINTS.listing(listingId)),
  });

  useEffect(() => {
    if (listing?.lat && listing?.lon) {
      flyToRef.current?.(listing.lat, listing.lon);
    }
  }, [listing?.id]);

  return (
    /* Backdrop */
    <div
      className="pointer-events-auto absolute inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/50 p-0 sm:p-10"
      style={{ right: 0 }}
      onClick={onClose}
    >
      {/* Panel */}
      <div
        className="relative w-full max-h-screen sm:max-h-[90vh] overflow-y-auto rounded-none sm:rounded-2xl sm:max-w-2xl"
        style={{
          background: '#FAF7F2',
          border: '0.5px solid #E8E0D0',
          boxShadow: '0 8px 40px rgba(26,18,8,0.18)',
          '--background': '#FFFFFF',
          '--foreground': '#1A1208',
          '--muted-foreground': '#6B5B45',
          '--muted': '#F5F0E8',
          '--border': 'rgb(184 164 138 / 50%)',
          '--primary': 'oklch(0.62 0.12 164)',
          '--primary-foreground': 'oklch(0.98 0.005 260)',
        } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()}
      >
        {isLoading || !listing ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <ListingDetailContent listing={listing} isModal onClose={onClose} />
        )}
      </div>
    </div>
  );
}

// ─── Map page ──────────────────────────────────────────────────────────────────
function MapPage() {
  const [selected, setSelected] = useState<Neighborhood | null>(null);
  const [mostrarOportunidades, setMostrarOportunidades] = useState(
    () => auth.get()?.mostrarOportunidades ?? false
  );
  const [perfil, setPerfil] = useState<string | undefined>(
    () => GOAL_TO_PERFIL[auth.get()?.goal ?? ""] as string | undefined,
  );
  const [risk, setRisk] = useState<string | undefined>(() => auth.get()?.risk as string | undefined);

  // Vista 1 / Vista 2 toggle
  const [mapView, setMapView] = useState<"zonas" | "listings">("zonas");
  const [mlsBarrio, setMlsBarrio] = useState<Neighborhood | null>(null);
  const [highlightedListingId, setHighlightedListingId] = useState<number | null>(null);
  const [activeBarrioInComune, setActiveBarrioInComune] = useState<string | null>(null);
  const flyToListingRef = useRef<((lat: number, lng: number) => void) | null>(null);
  const [selectedListing, setSelectedListing] = useState<ApiListing | null>(null);
  const [listingPanelPos, setListingPanelPos] = useState<{ x: number; y: number } | null>(null);

  // Listing detail modal
  const [listingDetailId, setListingDetailId] = useState<number | null>(null);

  // Filtered listings for map (updated by MLSPanel when filters change)
  const [filteredListings, setFilteredListings] = useState<ApiListing[] | null>(null);

  // Draw-to-filter
  const [drawModeActive, setDrawModeActive] = useState(false);
  const [drawnPolygon, setDrawnPolygon] = useState<GeoJSON.Feature | null>(null);
  const clearDrawRef = useRef<(() => void) | null>(null);

  // Single unified call — backend fetches venta + arriendo concurrently (half each) and merges.
  const { data: mlsData, isLoading: mlsIsLoading } = useListings(mlsBarrio?.id ?? null, 500, 0);
  const mlsListings: ApiListing[] = useMemo(() => mlsData?.listings ?? [], [mlsData]);
  const mlsTotal = mlsListings.length;
  const mlsRadio = mlsData?.radio_usado_metros ?? null;
  const mlsBarriosIncluidos = mlsData?.barrios_incluidos ?? null;

  // Premium-expansion fetch — fires when premium filter is active to find nearby premium
  const [premiumExpand, setPremiumExpand] = useState(false);
  const { data: premiumData, isLoading: premiumIsLoading } = useListings(
    premiumExpand ? (mlsBarrio?.id ?? null) : null,
    500,
    0,
    undefined,
    true,
  );
  const premiumExpanded: ApiListing[] = premiumData?.listings ?? [];
  const premiumRadio = premiumData?.radio_usado_metros ?? null;
  const premiumBarriosIncluidos = premiumData?.barrios_incluidos ?? null;

  // Reset filtered listings when raw data changes (new barrio/commune loaded)
  useEffect(() => {
    setFilteredListings(null);
  }, [mlsListings]);

  // Apply polygon filter on top of raw listings
  const polygonFilteredListings = useMemo<ApiListing[]>(() => {
    if (!drawnPolygon) return mlsListings;
    return mlsListings.filter((l) => {
      if (!l.lat || !l.lon) return false;
      return booleanPointInPolygon(point([l.lon, l.lat]), drawnPolygon as GeoJSON.Feature<GeoJSON.Polygon>);
    });
  }, [mlsListings, drawnPolygon]);

  // Reset MLSPanel filters when polygon changes so mapListings stays consistent
  useEffect(() => {
    setFilteredListings(null);
  }, [drawnPolygon]);

  // All barrios for the municipality selector in MLSPanel
  const { data: barriosRaw } = useBarriosRaw(perfil);
  const allBarrioOptions = useMemo<BarrioOption[]>(
    () => (barriosRaw ?? []).map(barrioToOption),
    [barriosRaw],
  );

  // Drill-down state
  const [viewLevel, setViewLevel] = useState<"comunas" | "barrios">("comunas");
  const [activeComuna, setActiveComuna] = useState<string | null>(null);
  const returnToComunasRef = useRef<(() => void) | null>(null);

  // Read ?listing=X from URL on mount → open modal automatically
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const lid = params.get("listing");
    if (lid) {
      const id = Number(lid);
      if (!Number.isNaN(id)) setListingDetailId(id);
    }
  }, []);

  useEffect(() => {
    const sync = () => setMostrarOportunidades(auth.get()?.mostrarOportunidades ?? false);
    window.addEventListener("medellin-social:user", sync);
    return () => window.removeEventListener("medellin-social:user", sync);
  }, []);

  useEffect(() => {
    const onPerfilUpdated = () => {
      setPerfil(GOAL_TO_PERFIL[auth.get()?.goal ?? ""] as string | undefined);
      setRisk(auth.get()?.risk as string | undefined);
    };
    window.addEventListener("perfil-updated", onPerfilUpdated);
    return () => window.removeEventListener("perfil-updated", onPerfilUpdated);
  }, []);

  function openListingDetail(id: number) {
    setListingDetailId(id);
    window.history.pushState({}, "", `/map?listing=${id}`);
  }

  function closeListingDetail() {
    setListingDetailId(null);
    window.history.pushState({}, "", "/map");
  }

  function handleViewLevelChange(level: "comunas" | "barrios", comunaNombre: string | null) {
    setViewLevel(level);
    setActiveComuna(comunaNombre);
    if (level === "comunas") setSelected(null);
  }

  function handleBack() {
    returnToComunasRef.current?.();
  }

  // Called from barrio popup "Ver inversiones"
  function handleGoToMLS(barrio: Neighborhood) {
    const resolvedId = (barrio as Neighborhood & { barrio_id?: number }).barrio_id ?? barrio.id;
    if (!resolvedId) return;
    setSelected(null);
    setMlsBarrio({ ...barrio, id: resolvedId });
    setMapView("listings");
    setActiveBarrioInComune(null);
    setFilteredListings(null);
  }

  // Called from MLSPanel all-barrios selector
  function handleBarrioNavigate(opt: BarrioOption) {
    const apiBarrio = barriosRaw?.find((b) => b.barrio_id === opt.id);
    if (apiBarrio) {
      setMlsBarrio(barrioToNeighborhood(apiBarrio));
    } else {
      // Fallback: build a minimal Neighborhood from BarrioOption so listings update
      setMlsBarrio({
        id: opt.id, nombre: opt.nombre, comuna: opt.comuna ?? opt.nombre,
        municipio: opt.municipio.toUpperCase(), estrato: 3,
        precio_m2: 0, arriendo: 0, yield: 0, anos_recupero: 0,
        dist_metro: 0, dist_parque: 0, dist_mall: 0, n_venta: 0, n_arriendo: 0,
        lat: opt.lat, lng: opt.lng, cd_comuna: opt.cd_comuna,
      });
    }
    setActiveBarrioInComune(null);
    setFilteredListings(null);
    flyToListingRef.current?.(opt.lat, opt.lng);
  }

  // Called from MLSPanel "← Volver" and Navbar breadcrumb
  function handleBackToZonas() {
    setMapView("zonas");
    setMlsBarrio(null);
    setHighlightedListingId(null);
    setActiveBarrioInComune(null);
    setFilteredListings(null);
    setDrawnPolygon(null);
    setDrawModeActive(false);
  }

  function handleBarrioFilter(barrioNombre: string | null) {
    setActiveBarrioInComune(barrioNombre);
    if (barrioNombre) {
      const first = mlsListings.find((l) => l.barrio_nombre === barrioNombre && l.lat && l.lon);
      if (first?.lat && first?.lon) flyToListingRef.current?.(first.lat, first.lon);
    }
  }

  // Card click in MLSPanel → flyTo + highlight + panel at click pos
  function handleListingSelect(listing: ApiListing, screenX: number, screenY: number) {
    setHighlightedListingId(listing.id ?? null);
    setSelectedListing(listing);
    setListingPanelPos({ x: screenX, y: screenY });
    if (listing.lat && listing.lon) {
      flyToListingRef.current?.(listing.lat, listing.lon);
    }
  }

  // Point click on map → highlight card + show ListingPanel at click pos
  function handleListingClickFromMap(id: number, screenX: number, screenY: number) {
    setHighlightedListingId(id);
    // Use full mlsListings (not filtered mapListings) so venta listings work when arriendo tab is active
    const listing = mlsListings.find((l) => l.id === id);
    if (listing) {
      setSelectedListing(listing);
      setListingPanelPos({ x: screenX, y: screenY });
    }
  }

  // MLSPanel reports which listings pass its filters → update map GeoJSON
  function handleFilteredListingsChange(listings: ApiListing[]) {
    setFilteredListings(listings);
  }

  // Draw handlers — disabled, revisar filtros antes de habilitar
  // function handleToggleDrawMode() { ... }
  // function handleClearDraw() { ... }

  function handleDrawPolygon(poly: GeoJSON.Feature) {
    setDrawnPolygon(poly);
    setDrawModeActive(false);
  }

  function handleDrawDelete() {
    setDrawnPolygon(null);
  }

  // Map renders filtered subset when filters are active, otherwise all polygon-filtered listings
  const mapListings = filteredListings ?? polygonFilteredListings;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background">
      <MapView
        selectedId={selected?.id ?? null}
        onSelect={setSelected}
        perfil={perfil}
        risk={risk}
        mostrarOportunidades={mostrarOportunidades}
        onViewLevelChange={handleViewLevelChange}
        returnToComunasRef={returnToComunasRef}
        onGoToMLS={handleGoToMLS}
        mapView={mapView}
        mlsBarrioId={mlsBarrio?.id ?? null}
        mlsListings={mapListings}
        highlightedListingId={highlightedListingId}
        flyToListingRef={flyToListingRef}
        onListingClickFromMap={handleListingClickFromMap}
        onListingDblClickFromMap={openListingDetail}
        activeBarrioName={activeBarrioInComune}
        drawModeActive={drawModeActive}
        onDrawPolygon={handleDrawPolygon}
        onDrawDelete={handleDrawDelete}
        clearDrawRef={clearDrawRef}
      />

      {/* Gradiente superior */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-background/80 to-transparent" />

      {/* Botón volver a comunas — solo en vista de barrios y cuando no estamos en listings */}
      {viewLevel === "barrios" && mapView === "zonas" && (
        <button
          onClick={handleBack}
          className="absolute left-4 top-20 z-20 flex items-center gap-2 rounded-lg border border-white/10 bg-background/80 px-3 py-2 text-sm font-medium text-foreground backdrop-blur-md transition hover:bg-background/95"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
            <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {activeComuna ?? "Comunas"}
        </button>
      )}

      <Navbar
        mlsBarrio={mlsBarrio}
        mlsTotal={mlsTotal}
        onBack={handleBackToZonas}
      />
      <ProfileChipMobile />

      {/* Vista 1: paneles normales */}
      {mapView === "zonas" && (
        <>
          <FloatingPanel selected={selected} onClear={() => setSelected(null)} onSelect={setSelected} onGoToMLS={handleGoToMLS} />
          <OpportunitiesPanel onSelect={setSelected} perfil={perfil} mostrarOportunidades={mostrarOportunidades} />
        </>
      )}

      {/* Panel de listing seleccionado (popup flotante) */}
      {selectedListing && !listingDetailId && (
        <ListingPanel
          listing={selectedListing}
          barrio={barriosRaw?.find((b) => b.barrio_id === selectedListing.barrio_id) ?? null}
          initialPos={listingPanelPos ?? undefined}
          onClose={() => { setSelectedListing(null); setListingPanelPos(null); }}
          onOpenDetail={() => openListingDetail(selectedListing.id)}
        />
      )}

      {/* Vista 2: panel de listings */}
      {mapView === "listings" && mlsBarrio && (
        <MLSPanel
          barrio={mlsBarrio}
          listings={mlsListings}
          isLoading={mlsIsLoading}
          onBack={handleBackToZonas}
          onListingSelect={handleListingSelect}
          highlightedListingId={highlightedListingId}
          activeBarrioName={activeBarrioInComune}
          onBarrioFilter={handleBarrioFilter}
          allBarrios={allBarrioOptions}
          onBarrioNavigate={handleBarrioNavigate}
          onFilteredListingsChange={handleFilteredListingsChange}
          radioUsadoMetros={mlsRadio}
          barriosIncluidos={mlsBarriosIncluidos}
          premiumExpanded={premiumExpanded}
          premiumIsLoading={premiumIsLoading}
          premiumRadio={premiumRadio}
          premiumBarriosIncluidos={premiumBarriosIncluidos}
          onPremiumExpand={setPremiumExpand}
          // Draw-to-filter — disabled, revisar filtros antes de habilitar
          // drawModeActive={drawModeActive}
          // drawnPolygon={drawnPolygon}
          // onToggleDrawMode={handleToggleDrawMode}
          // onClearDraw={handleClearDraw}
        />
      )}

      {/* Listing detail modal — overlay sobre el mapa */}
      {listingDetailId && (
        <ListingDetailModal
          listingId={listingDetailId}
          onClose={closeListingDetail}
          flyToRef={flyToListingRef}
        />
      )}
    </div>
  );
}
