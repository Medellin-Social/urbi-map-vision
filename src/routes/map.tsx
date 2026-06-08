import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { TargetProvider, useTarget, type Target } from "@/contexts/TargetContext";
import { ProfileChipMobile } from "@/components/Navbar";
import { MapNavbar, type MapTab } from "@/components/MapNavbar";
import { MapFilterBar, EMPTY_SHARED_FILTERS, TAB_TIPO_OP, type SharedFilters } from "@/components/MapFilterBar";
import { MapView } from "@/components/MapView";
import { FloatingPanel } from "@/components/FloatingPanel";
import { OpportunitiesPanel } from "@/components/OpportunitiesPanel";
import { MLSPanel } from "@/components/MLSPanel";
import type { Neighborhood } from "@/lib/adapters";
import type { ApiListing } from "@/lib/adapters";
import { auth } from "@/lib/auth";
import { track } from "@/lib/tracking";
import { useListings, useBarriosRaw, type ListingsApiFilters } from "@/hooks/useBarrios";
import { barrioToNeighborhood, barrioToOption, type BarrioOption } from "@/lib/adapters";
import { useMemo } from "react";
import { point, booleanPointInPolygon } from "@turf/turf";
import { ListingDrawer } from "@/components/ListingDrawer";
import { ListingMiniPopup } from "@/components/ListingMiniPopup";

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

// ─── Map page ──────────────────────────────────────────────────────────────────
function MapPage() {
  return (
    <TargetProvider>
      <MapPageInner />
    </TargetProvider>
  );
}

const TAB_TO_TARGET: Record<MapTab, Target | null> = {
  buy:   "buyer",
  rent:  "renter",
  sell:  "seller",
  agent: null,
};

function MapPageInner() {
  const { setTarget } = useTarget();
  const [activeTab, setActiveTab] = useState<MapTab>("buy");
  const [sharedFilters, setSharedFilters] = useState<SharedFilters>({
    ...EMPTY_SHARED_FILTERS, tipoOp: "venta",
  });
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

  // Listing detail modal
  const [listingDetailId, setListingDetailId] = useState<number | null>(null);

  // Mini popup (single-click on card or map point)
  const [miniPopupData, setMiniPopupData] = useState<{ listing: ApiListing; x: number; y: number } | null>(null);

  // Filtered listings for map (updated by MLSPanel when filters change)
  const [filteredListings, setFilteredListings] = useState<ApiListing[] | null>(null);

  // Draw-to-filter
  const [drawModeActive, setDrawModeActive] = useState(false);
  const [drawnPolygon, setDrawnPolygon] = useState<GeoJSON.Feature | null>(null);
  const clearDrawRef = useRef<(() => void) | null>(null);

  // API-level filters derived from sharedFilters — trigger refetch when changed
  const apiFilters = useMemo<ListingsApiFilters>(() => ({
    area_min:   sharedFilters.areaMin,
    area_max:   sharedFilters.areaMax,
    banos:      sharedFilters.banos,
    antiguedad: sharedFilters.antiguedad,
  }), [sharedFilters.areaMin, sharedFilters.areaMax, sharedFilters.banos, sharedFilters.antiguedad]);

  // Single unified call — backend fetches venta + arriendo concurrently (half each) and merges.
  const { data: mlsData, isLoading: mlsIsLoading } = useListings(mlsBarrio?.id ?? null, 500, 0, undefined, false, apiFilters);
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

  useEffect(() => {
    const onOpenDrawer = (e: Event) => {
      const id = (e as CustomEvent<{ id: number }>).detail?.id;
      if (id) openListingDetail(id);
    };
    window.addEventListener("open-listing-drawer", onOpenDrawer);
    return () => window.removeEventListener("open-listing-drawer", onOpenDrawer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openListingDetail(id: number) {
    setListingDetailId(id);
    window.history.pushState({}, "", `/map?listing=${id}`);
  }

  function closeListingDetail() {
    setListingDetailId(null);
    setMiniPopupData(null);
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

  // Tab click — switches target, resets filters, handles SELL/AGENT special cases
  function handleTabChange(tab: MapTab) {
    setActiveTab(tab);
    const tipoOp = TAB_TIPO_OP[tab];
    setSharedFilters({ ...EMPTY_SHARED_FILTERS, tipoOp });
    const t = TAB_TO_TARGET[tab];
    if (t) setTarget(t);
    if (tab === "sell") { setMapView("zonas"); setMlsBarrio(null); }
  }

  function handleFiltersChange(partial: Partial<SharedFilters>) {
    setSharedFilters((f) => ({ ...f, ...partial }));
  }

  function handleResetFilters() {
    setSharedFilters({ ...EMPTY_SHARED_FILTERS, tipoOp: TAB_TIPO_OP[activeTab] });
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

  // Card click in MLSPanel → flyTo + highlight + show mini popup
  function handleListingSelect(listing: ApiListing, screenX: number, screenY: number) {
    setHighlightedListingId(listing.id ?? null);
    if (listing.lat && listing.lon) {
      flyToListingRef.current?.(listing.lat, listing.lon);
    }
    track('listing_view', { entity_type: 'listing', entity_id: listing.url ?? undefined, barrio_id: listing.barrio_id ?? undefined });
    setMiniPopupData({ listing, x: screenX, y: screenY });
  }

  // Single click on map point → show mini popup
  function handleListingClickFromMap(id: number, screenX: number, screenY: number) {
    setHighlightedListingId(id);
    const listing = mlsListings.find((l) => l.id === id);
    if (!listing) return;
    track('listing_view', { entity_type: 'listing', entity_id: listing.url ?? undefined, barrio_id: listing.barrio_id ?? undefined });
    setMiniPopupData({ listing, x: screenX, y: screenY });
  }

  // Double click on map point → open drawer directly
  function handleListingDoubleClickFromMap(id: number) {
    setHighlightedListingId(id);
    setMiniPopupData(null);
    const listing = mlsListings.find((l) => l.id === id);
    if (listing) track('listing_view', { entity_type: 'listing', entity_id: listing.url ?? undefined, barrio_id: listing.barrio_id ?? undefined });
    openListingDetail(id);
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
    <div className="relative h-screen w-screen overflow-hidden bg-background max-md:flex max-md:flex-col">
      <div className="max-md:relative max-md:h-[45vh] max-md:shrink-0 md:absolute md:inset-0">
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
          onListingDoubleClickFromMap={handleListingDoubleClickFromMap}
          activeBarrioName={activeBarrioInComune}
          drawModeActive={drawModeActive}
          onDrawPolygon={handleDrawPolygon}
          onDrawDelete={handleDrawDelete}
          clearDrawRef={clearDrawRef}
        />
      </div>

      {/* Gradiente superior */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[108px] bg-gradient-to-b from-background/40 to-transparent" />

      {/* Botón volver a comunas — solo en vista de barrios y cuando no estamos en listings */}
      {viewLevel === "barrios" && mapView === "zonas" && (
        <button
          onClick={handleBack}
          className="absolute left-4 top-[108px] z-20 flex items-center gap-2 rounded-lg border border-white/10 bg-background/80 px-3 py-2 text-sm font-medium text-foreground backdrop-blur-md transition hover:bg-background/95"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
            <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {activeComuna ?? "Comunas"}
        </button>
      )}

      <MapNavbar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        mlsBarrio={mlsBarrio}
        mlsTotal={mlsTotal}
        onBack={handleBackToZonas}
      />
      <MapFilterBar
        activeTab={activeTab}
        filters={sharedFilters}
        onFiltersChange={handleFiltersChange}
        onResetAll={handleResetFilters}
        allBarrios={allBarrioOptions}
        onBarrioNavigate={handleBarrioNavigate}
      />
      <ProfileChipMobile />

      {/* Vista 1: paneles normales */}
      {mapView === "zonas" && (
        <>
          <FloatingPanel selected={selected} onClear={() => setSelected(null)} onSelect={setSelected} onGoToMLS={handleGoToMLS} />
          <OpportunitiesPanel onSelect={setSelected} perfil={perfil} mostrarOportunidades={mostrarOportunidades} />
        </>
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
          externalFilters={sharedFilters}
        />
      )}

      {/* Mini popup — single click on card or map point */}
      {miniPopupData && (
        <ListingMiniPopup
          listing={miniPopupData.listing}
          x={miniPopupData.x}
          y={miniPopupData.y}
          onClose={() => setMiniPopupData(null)}
          onViewMore={(id) => {
            setMiniPopupData(null);
            openListingDetail(id);
          }}
        />
      )}

      {/* Listing detail drawer — slide-in (desktop) / bottom sheet (mobile) */}
      <ListingDrawer listingId={listingDetailId} onClose={closeListingDetail} />
    </div>
  );
}
