import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Navbar, ProfileChipMobile } from "@/components/Navbar";
import { MapView } from "@/components/MapView";
import { FloatingPanel } from "@/components/FloatingPanel";
import { ListingPanel } from "@/components/ListingPanel";
import { OpportunitiesPanel } from "@/components/OpportunitiesPanel";
import { MLSPanel } from "@/components/MLSPanel";
import type { Neighborhood } from "@/lib/adapters";
import type { ApiListing } from "@/lib/adapters";
import { auth } from "@/lib/auth";
import { useListings, useBarriosRaw } from "@/hooks/useBarrios";
import { barrioToNeighborhood, barrioToOption, type BarrioOption } from "@/lib/adapters";
import { useMemo } from "react";

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

  // Filtered listings for map (updated by MLSPanel when filters change)
  const [filteredListings, setFilteredListings] = useState<ApiListing[] | null>(null);

  // Fetch venta + arriendo separately — ORDER BY pm2 ASC puts arriendo before venta,
  // so a single unfiltered call of 500 returns ~498 arriendo and ~2 venta.
  const { data: ventaData,    isLoading: ventaLoading    } = useListings(mlsBarrio?.id ?? null, 250, 0, "venta");
  const { data: arrendoData,  isLoading: arrendoLoading  } = useListings(mlsBarrio?.id ?? null, 250, 0, "arriendo");
  const mlsListings: ApiListing[] = useMemo(
    () => [...(ventaData?.listings ?? []), ...(arrendoData?.listings ?? [])],
    [ventaData, arrendoData],
  );
  const mlsIsLoading = ventaLoading || arrendoLoading;
  const mlsTotal = mlsListings.length;
  const mlsRadio = ventaData?.radio_usado_metros ?? arrendoData?.radio_usado_metros ?? null;
  const mlsBarriosIncluidos = ventaData?.barrios_incluidos ?? arrendoData?.barrios_incluidos ?? null;

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
        id: opt.id, nombre: opt.nombre, comuna: opt.nombre,
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

  // Map renders filtered subset when filters are active, otherwise all listings
  const mapListings = filteredListings ?? mlsListings;

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
        activeBarrioName={activeBarrioInComune}
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

      {/* Panel de listing seleccionado */}
      {selectedListing && (
        <ListingPanel
          listing={selectedListing}
          barrio={barriosRaw?.find((b) => b.barrio_id === selectedListing.barrio_id) ?? null}
          initialPos={listingPanelPos ?? undefined}
          onClose={() => { setSelectedListing(null); setListingPanelPos(null); }}
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
        />
      )}
    </div>
  );
}
