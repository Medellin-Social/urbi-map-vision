import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { API_ENDPOINTS } from "@/config/api";
import { useTarget, type Target } from "@/contexts/TargetContext";
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
import { ListingDrawer } from "@/components/ListingDrawer";
import { ListingMiniPopup } from "@/components/ListingMiniPopup";
import { ComparadorBadge } from "@/components/ComparadorBadge";

export const Route = createFileRoute("/map")({
  component: MapPage,
});

const GOAL_TO_PERFIL: Record<string, string> = {
  airbnb: "airbnb",
  "renta-larga": "largo_plazo",
  valorizacion: "largo_plazo",
  mediano_plazo: "mediano_plazo",
  nomadas: "mediano_plazo",
};

type ComunaBarrioItem = {
  barrio_id: number;
  nombre: string;
  lat: number | null;
  lon: number | null;
  precio_m2_cop: number | null;
  arriendo_cop: number | null;
  yield_pct: number | null;
};

// ─── Map page ──────────────────────────────────────────────────────────────────
function MapPage() {
  return <MapPageInner />;
}

const TAB_TO_TARGET: Record<MapTab, Target | null> = {
  buy:        "buyer",
  rent:       "renter",
  sell:       "seller",
  agent:      null,
  simulator:  null,
  comparador: null,
};

function MapPageInner() {
  const { setTarget } = useTarget();
  const [activeTab, setActiveTab] = useState<MapTab>(() => {
    if (typeof window === "undefined") return "buy";
    const op = new URLSearchParams(window.location.search).get("tipo_operacion");
    return op === "arriendo" ? "rent" : "buy";
  });
  const [sharedFilters, setSharedFilters] = useState<SharedFilters>(() => {
    const op = typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("tipo_operacion")
      : null;
    return { ...EMPTY_SHARED_FILTERS, tipoOp: op === "arriendo" ? "arriendo" : "venta" };
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

  // Listings currently rendered as map dots via viewport loading (FIX 1) — used
  // to resolve a map-point click into the listing for the mini-popup/drawer.
  const [viewportListings, setViewportListings] = useState<ApiListing[]>([]);

  const [globalSearch, setGlobalSearch] = useState(false);

  // Count active filters for hint banner
  const activeFilterCount = [
    sharedFilters.precioMax, sharedFilters.precioMin,
    sharedFilters.habitaciones, sharedFilters.tipoInmueble,
    sharedFilters.areaMin, sharedFilters.areaMax,
    sharedFilters.banos, sharedFilters.antiguedad,
    sharedFilters.busqueda,
  ].filter((v) => v !== null).length;

  // API-level filters derived from sharedFilters — trigger refetch when changed
  const apiFilters = useMemo<ListingsApiFilters>(() => ({
    area_min:   sharedFilters.areaMin,
    area_max:   sharedFilters.areaMax,
    banos:      sharedFilters.banos,
    antiguedad: sharedFilters.antiguedad,
    amenidades: sharedFilters.amenidades,
    amoblado:   sharedFilters.amoblado,
  }), [sharedFilters.areaMin, sharedFilters.areaMax, sharedFilters.banos, sharedFilters.antiguedad, sharedFilters.amenidades, sharedFilters.amoblado]);

  // Remaining shared filters applied server-side in /viewport (map + panel single source).
  const mlsFilters = useMemo(() => ({
    habitaciones: sharedFilters.habitaciones,
    banos:        sharedFilters.banos,
    areaMin:      sharedFilters.areaMin,
    areaMax:      sharedFilters.areaMax,
    estrato:      sharedFilters.estrato,
    tipoInmueble: sharedFilters.tipoInmueble,
    diasMercado:  sharedFilters.diasMercado,
    busqueda:     sharedFilters.busqueda,
    amenidades:   sharedFilters.amenidades,
  }), [sharedFilters.habitaciones, sharedFilters.banos, sharedFilters.areaMin, sharedFilters.areaMax,
       sharedFilters.estrato, sharedFilters.tipoInmueble, sharedFilters.diasMercado, sharedFilters.busqueda,
       sharedFilters.amenidades]);

  // Pass tipoOp to backend so it returns the correct type (not a mixed 50/50 split).
  // undefined when "todos" so backend does the balanced venta+arriendo fetch.
  const mlsTipoOp = sharedFilters.tipoOp !== "todos" ? sharedFilters.tipoOp : undefined;
  const { data: mlsData, isLoading: mlsIsLoading } = useListings(mlsBarrio?.id ?? null, 500, 0, mlsTipoOp, false, apiFilters);
  const mlsListings: ApiListing[] = useMemo(() => mlsData?.listings ?? [], [mlsData]);
  const mlsRadio = mlsData?.radio_usado_metros ?? null;
  const mlsBarriosIncluidos = mlsData?.barrios_incluidos ?? null;

  // Global Valle search — only fires when user clicks "Buscar en el Valle"
  const { data: globalData, isLoading: globalIsLoading } = useListings(
    null, 500, 0, mlsTipoOp, false, apiFilters,
    undefined, undefined, globalSearch,
  );

  // Premium-expansion fetch — fires when premium filter is active to find nearby premium
  const [premiumExpand, setPremiumExpand] = useState(false);
  const { data: premiumData, isLoading: premiumIsLoading } = useListings(
    premiumExpand ? (mlsBarrio?.id ?? null) : null,
    500,
    0,
    undefined,
    true,
  );
  const premiumExpanded: ApiListing[] = useMemo(() => premiumData?.listings ?? [], [premiumData]);
  const premiumRadio = premiumData?.radio_usado_metros ?? null;
  const premiumBarriosIncluidos = premiumData?.barrios_incluidos ?? null;

  // All barrios for the municipality selector in MLSPanel
  const { data: barriosRaw } = useBarriosRaw(perfil);
  const allBarrioOptions = useMemo<BarrioOption[]>(
    () => (barriosRaw ?? []).map(barrioToOption),
    [barriosRaw],
  );

  // Drill-down state
  const [viewLevel, setViewLevel] = useState<"comunas" | "barrios">("comunas");
  const [activeComuna, setActiveComuna] = useState<string | null>(null);
  const [activeComunaCd, setActiveComunaCd] = useState<number | null>(null);
  const [activeMunicipio, setActiveMunicipio] = useState<string | null>(null);
  const returnToComunasRef = useRef<(() => void) | null>(null);
  const [comunaBarriosList, setComunaBarriosList] = useState<ComunaBarrioItem[]>([]);

  useEffect(() => {
    if (!activeComunaCd) { setComunaBarriosList([]); return; }
    fetch(API_ENDPOINTS.comunasBarriosByCd(activeComunaCd))
      .then(r => r.ok ? r.json() : [])
      .then(data => setComunaBarriosList(Array.isArray(data) ? data : []))
      .catch(() => setComunaBarriosList([]));
  }, [activeComunaCd]);

  // Camera-derived commune filter forwarded to MapView's viewport fetch.
  const cdComunaQuery = mlsBarrio == null && !activeMunicipio ? (activeComunaCd ?? undefined) : undefined;

  // FIX 1d: single source of truth — the panel mirrors exactly the viewport the
  // map shows (clusters mode returns a capped list, points mode the points).
  const mergedListings = globalSearch ? (globalData?.listings ?? []) : viewportListings;
  const mergedLoading  = globalSearch ? globalIsLoading : (mlsBarrio ? mlsIsLoading : false);
  const mlsTotal = mergedListings.length;

  // Panel zone label — real barrio > active commune > active municipality > Medellín default
  const activePanelName = activeComuna ?? activeMunicipio;
  const panelBarrio: Neighborhood | null = mlsBarrio ?? (globalSearch ? {
    id: -1,
    nombre: "Valle de Aburrá",
    comuna: "Valle de Aburrá",
    municipio: "MEDELLÍN",
    estrato: 0,
    precio_m2: 0, arriendo: 0, yield: 0, anos_recupero: 0,
    dist_metro: 0, dist_parque: 0, dist_mall: 0,
    n_venta: 0, n_arriendo: 0,
    lat: 6.2442, lng: -75.5812,
  } : activePanelName ? {
    id: -1,
    nombre: activePanelName,
    comuna: activePanelName,
    municipio: activeMunicipio ?? "MEDELLÍN",
    estrato: 0,
    precio_m2: 0, arriendo: 0, yield: 0, anos_recupero: 0,
    dist_metro: 0, dist_parque: 0, dist_mall: 0,
    n_venta: 0, n_arriendo: 0,
    lat: 6.2442, lng: -75.5812,
  } : {
    id: -1,
    nombre: "Medellín",
    comuna: "Medellín",
    municipio: "MEDELLÍN",
    estrato: 0,
    precio_m2: 0, arriendo: 0, yield: 0, anos_recupero: 0,
    dist_metro: 0, dist_parque: 0, dist_mall: 0,
    n_venta: 0, n_arriendo: 0,
    lat: 6.2442, lng: -75.5812,
  });

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

  function handleViewLevelChange(level: "comunas" | "barrios", comunaNombre: string | null, municipioFilter?: string | null, cdComuna?: number | null) {
    setViewLevel(level);
    if (level === "comunas") {
      setActiveComuna(null);
      setActiveComunaCd(null);
      setActiveMunicipio(null);
      setSelected(null);
    } else if (level === "barrios" && (comunaNombre || cdComuna)) {
      if (municipioFilter) {
        // Non-Medellín municipality block → filter by municipio
        setActiveMunicipio(municipioFilter);
        setActiveComuna(null);
        setActiveComunaCd(null);
      } else {
        // Medellín commune → filter by cd_comuna (reliable int) + name for display
        setActiveComuna(comunaNombre);
        setActiveComunaCd(cdComuna ?? null);
        setActiveMunicipio(null);
      }
      setMlsBarrio(null);
      setMapView("listings");
    }
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
    if (tab === "sell") { setMapView("zonas"); setMlsBarrio(null); setGlobalSearch(false); }
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
  }

  // Called from MLSPanel all-barrios selector
  function handleBarrioNavigate(opt: BarrioOption) {
    const apiBarrio = barriosRaw?.find((b) => b.barrio_id === opt.id);
    if (apiBarrio) {
      setMlsBarrio(barrioToNeighborhood(apiBarrio));
    } else {
      setMlsBarrio({
        id: opt.id, nombre: opt.nombre, comuna: opt.comuna ?? opt.nombre,
        municipio: opt.municipio.toUpperCase(), estrato: 3,
        precio_m2: 0, arriendo: 0, yield: 0, anos_recupero: 0,
        dist_metro: 0, dist_parque: 0, dist_mall: 0, n_venta: 0, n_arriendo: 0,
        lat: opt.lat, lng: opt.lng, cd_comuna: opt.cd_comuna,
      });
    }
    setMapView("listings");
    setSelected(null);
    setActiveBarrioInComune(null);
    flyToListingRef.current?.(opt.lat, opt.lng);
  }

  // Called from MLSPanel "← Volver" and Navbar breadcrumb
  function handleBackToZonas() {
    setMapView("zonas");
    setMlsBarrio(null);
    setGlobalSearch(false);
    setActiveComuna(null);
    setActiveComunaCd(null);
    setActiveMunicipio(null);
    setViewLevel("comunas");
    setHighlightedListingId(null);
    setActiveBarrioInComune(null);
  }

  function handleBackToCommune() {
    setMlsBarrio(null);
  }

  function handleSelectBarrioInComune(barrioId: number) {
    const item = comunaBarriosList.find(b => b.barrio_id === barrioId);
    if (!item) return;
    setMlsBarrio({
      id: item.barrio_id,
      nombre: item.nombre,
      comuna: activeComuna ?? item.nombre,
      municipio: "MEDELLÍN",
      estrato: 0,
      precio_m2: item.precio_m2_cop ?? 0,
      arriendo: item.arriendo_cop ?? 0,
      yield: item.yield_pct ?? 0,
      anos_recupero: 0,
      dist_metro: 0, dist_parque: 0, dist_mall: 0,
      n_venta: 0, n_arriendo: 0,
      lat: item.lat ?? 6.2442,
      lng: item.lon ?? -75.5812,
    });
    if (item.lat && item.lon) flyToListingRef.current?.(item.lat, item.lon);
  }

  function handleBarrioFilter(barrioNombre: string | null) {
    setActiveBarrioInComune(barrioNombre);
    if (barrioNombre) {
      const first = mergedListings.find((l) => l.barrio_nombre === barrioNombre && l.lat && l.lon);
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
    const listing = viewportListings.find((l) => l.id === id) ?? mergedListings.find((l) => l.id === id);
    if (!listing) return;
    track('listing_view', { entity_type: 'listing', entity_id: listing.url ?? undefined, barrio_id: listing.barrio_id ?? undefined });
    setMiniPopupData({ listing, x: screenX, y: screenY });
  }

  // Double click on map point → open drawer directly
  function handleListingDoubleClickFromMap(id: number) {
    setHighlightedListingId(id);
    setMiniPopupData(null);
    const listing = viewportListings.find((l) => l.id === id) ?? mergedListings.find((l) => l.id === id);
    if (listing) track('listing_view', { entity_type: 'listing', entity_id: listing.url ?? undefined, barrio_id: listing.barrio_id ?? undefined });
    openListingDetail(id);
  }


  // Camera auto-select (FIX 1c): barrio under map center at high zoom → scope panel+dots.
  function handleAutoSelectBarrio(barrioId: number | null) {
    if (barrioId == null) { setMlsBarrio(null); return; }
    const b = (barriosRaw ?? []).find((x) => x.barrio_id === barrioId);
    if (b) setMlsBarrio(barrioToNeighborhood(b));
  }

  // Camera-derived commune/municipio (zoom < TIER) → scope viewport + breadcrumb.
  function handleAutoSelectComuna(cd: number | null, municipio: string | null, nombre: string | null) {
    setMlsBarrio(null);
    setActiveComunaCd(cd);
    setActiveMunicipio(municipio);
    setActiveComuna(nombre);
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background max-md:flex max-md:flex-col">
      <div className="max-md:relative max-md:h-[45vh] max-md:shrink-0 md:absolute md:inset-0 z-0">
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
          mlsTipoOp={mlsTipoOp}
          mlsPrecioMin={sharedFilters.precioMin}
          mlsPrecioMax={sharedFilters.precioMax}
          mlsAmoblado={sharedFilters.amoblado}
          mlsCdComuna={cdComunaQuery ?? null}
          mlsMunicipio={activeMunicipio}
          mlsFilters={mlsFilters}
          onViewportListingsChange={setViewportListings}
          onAutoSelectBarrio={handleAutoSelectBarrio}
          onAutoSelectComuna={handleAutoSelectComuna}
          highlightedListingId={highlightedListingId}
          flyToListingRef={flyToListingRef}
          onListingClickFromMap={handleListingClickFromMap}
          onListingDoubleClickFromMap={handleListingDoubleClickFromMap}
          activeBarrioName={activeBarrioInComune}
          activeTab={activeTab}
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
        onBarrioClear={() => { setMlsBarrio(null); setMapView("zonas"); setGlobalSearch(false); }}
        onSearchAll={() => { setGlobalSearch(true); setMapView("listings"); }}
        hasActiveScope={!!mlsBarrio || !!activePanelName}
      />
      <ProfileChipMobile />

      {/* Buscar en el Valle — filtros activos pero sin barrio/zona seleccionada */}
      {activeFilterCount > 0 && !mlsBarrio && !globalSearch && activeTab !== "agent" && (
        <button
          onClick={() => { setGlobalSearch(true); setMapView("listings"); }}
          style={{
            position: "absolute", top: 108, left: "50%", transform: "translateX(-50%)",
            zIndex: 24, background: "#1e3a5f", color: "#FAF7F2",
            borderRadius: 8, padding: "6px 16px", fontSize: 12, fontWeight: 600,
            border: "none", cursor: "pointer", whiteSpace: "nowrap",
            boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
          }}
        >
          Buscar en el Valle de Aburrá →
        </button>
      )}

      {/* Vista 1: paneles normales */}
      {mapView === "zonas" && (
        <>
          <FloatingPanel selected={selected} onClear={() => setSelected(null)} onSelect={setSelected} onGoToMLS={handleGoToMLS} />
          <OpportunitiesPanel onSelect={setSelected} perfil={perfil} mostrarOportunidades={mostrarOportunidades} />
        </>
      )}

      {/* Vista 2: panel de listings */}
      {mapView === "listings" && panelBarrio && (
        <MLSPanel
          barrio={panelBarrio}
          listings={mergedListings}
          isLoading={mergedLoading}
          onBack={handleBackToZonas}
          onListingSelect={handleListingSelect}
          highlightedListingId={highlightedListingId}
          activeBarrioName={activeBarrioInComune}
          onBarrioFilter={handleBarrioFilter}
          allBarrios={allBarrioOptions}
          onBarrioNavigate={handleBarrioNavigate}
          radioUsadoMetros={mlsRadio}
          barriosIncluidos={mlsBarriosIncluidos}
          premiumExpanded={premiumExpanded}
          premiumIsLoading={premiumIsLoading}
          premiumRadio={premiumRadio}
          premiumBarriosIncluidos={premiumBarriosIncluidos}
          onPremiumExpand={setPremiumExpand}
          externalFilters={sharedFilters}
          activeComuna={activeComuna}
          activeMunicipio={activeMunicipio}
          comunaBarrios={comunaBarriosList}
          onBackToComuna={handleBackToCommune}
          onSelectBarrioInComune={handleSelectBarrioInComune}
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

      {/* Comparador floating badge */}
      <ComparadorBadge />
    </div>
  );
}
