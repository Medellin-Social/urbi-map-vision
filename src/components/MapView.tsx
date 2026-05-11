import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl, { Map as MapboxMap } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAPBOX_TOKEN } from "@/lib/mapboxToken";
import { NEIGHBORHOODS, type Neighborhood } from "@/data/neighborhoods";
import { OPPORTUNITIES } from "@/data/marketActivity";
import { auth, MAP_STYLES } from "@/lib/auth";
import { barrioToNeighborhood, barriosToGeoJSON, type ApiBarrio } from "@/lib/adapters";
import { useBarriosRaw } from "@/hooks/useBarrios";
import {
  OPP_COLORS,
  PALETTE_EVENT,
  getActivePaletteId,
  type ScorePaletteId,
} from "@/config/mapColors";

type Props = {
  onSelect: (n: Neighborhood) => void;
  selectedId: number | null;
  perfil?: string;
  mostrarOportunidades?: boolean;
};

const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

export function MapView({ onSelect, selectedId, perfil, mostrarOportunidades = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const mapLoadedRef = useRef(false);
  const barriosRef = useRef<ApiBarrio[]>([]);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const tokenError = !MAPBOX_TOKEN || MAPBOX_TOKEN.includes("REPLACE_ME");

  const [scorePalette, setScorePalette] = useState<ScorePaletteId>(getActivePaletteId);

  useEffect(() => {
    const onPalette = () => setScorePalette(getActivePaletteId());
    window.addEventListener(PALETTE_EVENT, onPalette);
    return () => window.removeEventListener(PALETTE_EVENT, onPalette);
  }, []);

  const { data: barriosRaw } = useBarriosRaw(perfil);

  const geoJsonData = useMemo(() => {
    if (!barriosRaw?.length) return null;
    barriosRef.current = barriosRaw;
    return barriosToGeoJSON(barriosRaw, scorePalette);
  }, [barriosRaw, scorePalette]);

  // Map initialization
  useEffect(() => {
    if (tokenError || !containerRef.current || mapRef.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;
    const styleId = auth.get()?.mapStyle ?? "dark";
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_STYLES[styleId]?.url ?? "mapbox://styles/mapbox/dark-v11",
      center: [-75.5812, 6.2442],
      zoom: 11.5,
      pitch: 35,
      bearing: -10,
      antialias: true,
    });
    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true, showCompass: true }), "bottom-right");

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);
    requestAnimationFrame(() => map.resize());

    map.on("load", () => {
      map.resize();
      mapLoadedRef.current = true;

      map.addSource("barrios", { type: "geojson", data: EMPTY_FC });

      // Fill layer
      map.addLayer({
        id: "barrios-fill",
        type: "fill",
        source: "barrios",
        paint: {
          "fill-color": ["get", "color_hex"],
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false], 0.85,
            ["boolean", ["feature-state", "hover"], false], 0.75,
            ["==", ["get", "color_hex"], "#00d4ff"], 0.2,
            0.5,
          ],
        },
      });

      // Outline layer
      map.addLayer({
        id: "barrios-line",
        type: "line",
        source: "barrios",
        paint: {
          "line-color": "#ffffff",
          "line-width": [
            "case",
            ["boolean", ["feature-state", "selected"], false], 2.5,
            ["boolean", ["feature-state", "hover"], false], 1.5,
            0.8,
          ],
        },
      });

      // Labels
      map.addLayer({
        id: "barrios-label",
        type: "symbol",
        source: "barrios",
        layout: {
          "text-field": ["get", "nombre"],
          "text-size": 11,
          "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
          "text-letter-spacing": 0.08,
          "text-transform": "uppercase",
        },
        paint: {
          "text-color": "#f9fafb",
          "text-halo-color": "rgba(10, 14, 26, 0.9)",
          "text-halo-width": 1.4,
        },
      });

      // Hover tooltip
      let hoverId: number | null = null;
      const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });

      map.on("mousemove", "barrios-fill", (e) => {
        if (!e.features?.length) return;
        const f = e.features[0];
        const id = f.properties?.id as number;
        if (hoverId !== null && hoverId !== id) {
          map.setFeatureState({ source: "barrios", id: hoverId }, { hover: false });
        }
        hoverId = id;
        map.setFeatureState({ source: "barrios", id }, { hover: true });
        map.getCanvas().style.cursor = "pointer";
        const nombre = f.properties?.nombre ?? "";
        const score = f.properties?.score_activo as number | null;
        const cat = f.properties?.cat_activo ?? "—";
        const excluido = f.properties?.excluir_inversion === true;
        const sinDatos = !excluido && (score === null || score < 20);
        const scoreHtml = excluido
          ? `<span style="color:#9ca3af;font-size:11px;">No disponible</span>`
          : sinDatos
          ? `<span style="color:#9ca3af;font-size:11px;">${cat}</span>`
          : `<span style="color:#00d4ff;font-weight:700;">${score}</span><span style="color:#9ca3af;font-size:11px;">${cat}</span>`;
        popup
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="display:flex;align-items:center;gap:8px;">
              <span style="font-weight:600;letter-spacing:.04em;">${nombre}</span>
              ${scoreHtml}
            </div>`
          )
          .addTo(map);
      });

      map.on("mouseleave", "barrios-fill", () => {
        if (hoverId !== null) map.setFeatureState({ source: "barrios", id: hoverId }, { hover: false });
        hoverId = null;
        map.getCanvas().style.cursor = "";
        popup.remove();
      });

      map.on("click", "barrios-fill", (e) => {
        if (!e.features?.length) return;
        const f = e.features[0];
        if (f.properties?.excluir_inversion === true) return;
        const id = f.properties?.id as number;
        const name = (f.properties?.nombre ?? "").toString();

        const barrio = barriosRef.current.find((b) => b.barrio_id === id);
        let n: Neighborhood;
        if (barrio) {
          n = barrioToNeighborhood(barrio);
        } else {
          const seed = name.split("").reduce((a: number, c: string) => a + c.charCodeAt(0), 0);
          const y = Number((f.properties?.yield ?? 6).toString());
          const [lng, lat] = [e.lngLat.lng, e.lngLat.lat];
          const precio_m2 = 3_500_000 + (seed % 60) * 100_000;
          n = {
            id, nombre: name, comuna: f.properties?.comuna ?? "—", municipio: "MEDELLÍN",
            estrato: 3, precio_m2, arriendo: Math.round(precio_m2 * 0.0008 * 90),
            yield: y, anos_recupero: Number((100 / y).toFixed(1)),
            dist_metro: 1 + (seed % 30) / 10, dist_parque: 0.3 + (seed % 10) / 10,
            dist_mall: 1 + (seed % 25) / 10, n_venta: 1 + (seed % 8),
            n_arriendo: 1 + (seed % 5), lat, lng,
          };
        }
        map.flyTo({ center: [n.lng, n.lat], zoom: 13.4, speed: 0.8 });
        onSelect(n);
      });

      // Populate source if data already arrived
      if (barriosRef.current.length > 0) {
        (map.getSource("barrios") as mapboxgl.GeoJSONSource).setData(
          barriosToGeoJSON(barriosRef.current, getActivePaletteId()) as unknown as GeoJSON.FeatureCollection
        );
        if (mostrarOportunidades) addOpportunityMarkers(map);
      }
    });

    return () => {
      ro.disconnect();
      mapLoadedRef.current = false;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update map source when GeoJSON data changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current || !geoJsonData) return;
    (map.getSource("barrios") as mapboxgl.GeoJSONSource)?.setData(
      geoJsonData as unknown as GeoJSON.FeatureCollection
    );
    if (mostrarOportunidades) {
      addOpportunityMarkers(map);
    } else {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
    }
  }, [geoJsonData, mostrarOportunidades]);

  // Selection sync
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    map.removeFeatureState({ source: "barrios" });
    if (selectedId != null) {
      map.setFeatureState({ source: "barrios", id: selectedId }, { selected: true });
      const n =
        barriosRef.current.length > 0
          ? barriosRef.current.find((b) => b.barrio_id === selectedId)
          : null;
      if (n) {
        const nb = barrioToNeighborhood(n);
        map.flyTo({ center: [nb.lng, nb.lat], zoom: 13.4, speed: 0.9 });
      } else {
        const fallback = NEIGHBORHOODS.find((x) => x.id === selectedId);
        if (fallback) map.flyTo({ center: [fallback.lng, fallback.lat], zoom: 13.4, speed: 0.9 });
      }
    }
  }, [selectedId]);

  function addOpportunityMarkers(map: MapboxMap) {
    // Remove old markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const barrios = barriosRef.current;
    barrios.forEach((b) => {
      const opp = b.oportunidad;
      if (!opp.detectada) return;
      const nb = barrioToNeighborhood(b);
      const color = OPP_COLORS[opp.tipo as keyof typeof OPP_COLORS] ?? "#FDE8D3";
      const el = document.createElement("div");
      el.className = "opp-pulse-dot";
      el.style.setProperty("--opp-color", color);
      el.title = `${opp.tipo ?? ""} — ${opp.descripcion ?? ""}`;
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        map.flyTo({ center: [nb.lng, nb.lat], zoom: 13.6, speed: 0.8 });
        onSelect(nb);
      });
      const marker = new mapboxgl.Marker({ element: el }).setLngLat([nb.lng, nb.lat]).addTo(map);
      markersRef.current.push(marker);
    });
  }

  if (tokenError) {
    return (
      <div className="absolute inset-0 grid place-items-center bg-background px-6 text-center">
        <div className="max-w-md rounded-xl border border-border bg-surface p-6">
          <h2 className="font-display text-lg font-semibold">Token de Mapbox requerido</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Configura el secreto <code className="rounded bg-background/60 px-1.5 py-0.5 text-xs">MAPBOX_PUBLIC_TOKEN</code> en Lovable Cloud para cargar el mapa de Medellín.
          </p>
        </div>
      </div>
    );
  }

  return <div ref={containerRef} className="absolute inset-0 z-0 min-h-screen" />;
}
