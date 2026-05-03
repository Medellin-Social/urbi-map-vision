import { useEffect, useRef, useState } from "react";
import mapboxgl, { Map as MapboxMap } from "mapbox-gl";
import { getMapboxToken } from "@/server/mapbox.functions";
import { buildNeighborhoodsGeoJSON, NEIGHBORHOODS, type Neighborhood } from "@/data/neighborhoods";

type Props = {
  onSelect: (n: Neighborhood) => void;
  selectedId: number | null;
};

export function MapView({ onSelect, selectedId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState(false);

  useEffect(() => {
    getMapboxToken()
      .then((r) => {
        if (r.token) setToken(r.token);
        else setTokenError(true);
      })
      .catch(() => setTokenError(true));
  }, []);

  useEffect(() => {
    if (!token || !containerRef.current || mapRef.current) return;

    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [-75.5812, 6.2442],
      zoom: 11.5,
      pitch: 35,
      bearing: -10,
      antialias: true,
    });
    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true, showCompass: true }), "bottom-right");

    map.on("load", () => {
      const data = buildNeighborhoodsGeoJSON();
      map.addSource("barrios", { type: "geojson", data });

      // Glow underlayer
      map.addLayer({
        id: "barrios-glow",
        type: "fill",
        source: "barrios",
        paint: {
          "fill-color": [
            "case",
            [">", ["get", "yield"], 10], "#10b981",
            [">=", ["get", "yield"], 7], "#00d4ff",
            [">=", ["get", "yield"], 5], "#f59e0b",
            "#ef4444",
          ],
          "fill-opacity": 0.18,
        },
      });

      // Main fill
      map.addLayer({
        id: "barrios-fill",
        type: "fill",
        source: "barrios",
        paint: {
          "fill-color": [
            "case",
            [">", ["get", "yield"], 10], "#10b981",
            [">=", ["get", "yield"], 7], "#00d4ff",
            [">=", ["get", "yield"], 5], "#f59e0b",
            "#ef4444",
          ],
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "hover"], false], 0.55,
            ["boolean", ["feature-state", "selected"], false], 0.65,
            0.32,
          ],
        },
      });

      // Outline
      map.addLayer({
        id: "barrios-line",
        type: "line",
        source: "barrios",
        paint: {
          "line-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false], "#00d4ff",
            "rgba(0, 212, 255, 0.55)",
          ],
          "line-width": [
            "case",
            ["boolean", ["feature-state", "selected"], false], 2.5,
            ["boolean", ["feature-state", "hover"], false], 1.5,
            0.8,
          ],
          "line-blur": 0.4,
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

      // Hover
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
        popup
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="display:flex;align-items:center;gap:8px;">
              <span style="font-weight:600;letter-spacing:.04em;">${f.properties?.nombre}</span>
              <span style="color:#00d4ff;font-weight:600;">${(f.properties?.yield as number).toFixed(1)}%</span>
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
        const id = e.features[0].properties?.id as number;
        const n = NEIGHBORHOODS.find((x) => x.id === id);
        if (n) {
          map.flyTo({ center: [n.lng, n.lat], zoom: 13.4, speed: 0.8 });
          onSelect(n);
        }
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Selection sync
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    NEIGHBORHOODS.forEach((n) => {
      map.setFeatureState({ source: "barrios", id: n.id }, { selected: n.id === selectedId });
    });
  }, [selectedId]);

  if (tokenInvalid) {
    return (
      <div className="absolute inset-0 grid place-items-center bg-background px-6 text-center">
        <div className="max-w-md rounded-xl border border-border bg-surface p-6">
          <h2 className="font-display text-lg font-semibold">Token de Mapbox requerido</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Pega tu token público de Mapbox (<span className="text-primary">pk.…</span>) en{" "}
            <code className="rounded bg-background/60 px-1.5 py-0.5 text-xs">src/lib/mapboxToken.ts</code> para
            cargar el mapa de Medellín.
          </p>
        </div>
      </div>
    );
  }

  return <div ref={containerRef} className="absolute inset-0" />;
}
