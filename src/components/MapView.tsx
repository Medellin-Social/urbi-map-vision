import { useEffect, useRef } from "react";
import mapboxgl, { Map as MapboxMap } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAPBOX_TOKEN } from "@/lib/mapboxToken";
import { buildNeighborhoodsGeoJSON, NEIGHBORHOODS, type Neighborhood } from "@/data/neighborhoods";
import { OPPORTUNITIES } from "@/data/marketActivity";
import { auth, MAP_STYLES } from "@/lib/auth";

type Props = {
  onSelect: (n: Neighborhood) => void;
  selectedId: number | null;
};

export function MapView({ onSelect, selectedId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const tokenError = !MAPBOX_TOKEN || MAPBOX_TOKEN.includes("REPLACE_ME");

  useEffect(() => {
    if (tokenError || !containerRef.current || mapRef.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;
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

    // Force resize once the container has its real size (fixes blank canvas on first paint)
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);
    requestAnimationFrame(() => map.resize());

    map.on("load", async () => {
      map.resize();
      let data: any = buildNeighborhoodsGeoJSON();
      try {
        const res = await fetch("/data/barrios_medellin.geojson");
        if (res.ok) {
          const raw = await res.json();
          // Assign numeric id + synthetic yield (matched to NEIGHBORHOODS by name when possible)
          raw.features = raw.features.map((f: any, i: number) => {
            const name = (f.properties?.nombre ?? "").toUpperCase();
            const match = NEIGHBORHOODS.find((n) => n.nombre.toUpperCase() === name);
            const seed = name.split("").reduce((a: number, c: string) => a + c.charCodeAt(0), 0);
            const y = match ? match.yield : 4 + (seed % 90) / 10; // 4.0 - 13.0
            return {
              ...f,
              id: i + 1,
              properties: {
                ...f.properties,
                id: i + 1,
                yield: Number(y.toFixed(2)),
              },
            };
          });
          data = raw;
        }
      } catch (e) {
        console.warn("Failed to load barrios geojson, using fallback", e);
      }
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
        const f = e.features[0];
        const id = f.properties?.id as number;
        const name = (f.properties?.nombre ?? "").toString();
        let n = NEIGHBORHOODS.find((x) => x.id === id || x.nombre.toUpperCase() === name.toUpperCase());
        if (!n) {
          // Build a synthetic neighborhood from feature centroid
          const seed = name.split("").reduce((a: number, c: string) => a + c.charCodeAt(0), 0);
          const y = Number((f.properties?.yield ?? 6).toString());
          const [lng, lat] = (e.lngLat ? [e.lngLat.lng, e.lngLat.lat] : [-75.58, 6.24]);
          const precio_m2 = 3_500_000 + (seed % 60) * 100_000;
          n = {
            id, nombre: name, comuna: f.properties?.comuna ?? "—", municipio: f.properties?.municipio ?? "MEDELLÍN",
            estrato: 3, precio_m2, arriendo: Math.round(precio_m2 * 0.0008 * 90),
            yield: y, anos_recupero: Number((100 / y).toFixed(1)),
            dist_metro: 1 + (seed % 30) / 10, dist_parque: 0.3 + (seed % 10) / 10, dist_mall: 1 + (seed % 25) / 10,
            n_venta: 1 + (seed % 8), n_arriendo: 1 + (seed % 5), lat, lng,
          };
        }
        map.flyTo({ center: [n.lng, n.lat], zoom: 13.4, speed: 0.8 });
        onSelect(n);
      });

      // Opportunity pulse markers (centroid-ish)
      data.features.forEach((f: any) => {
        const name = (f.properties?.nombre ?? "").toUpperCase();
        const opp = OPPORTUNITIES.find((o) => o.barrio === name);
        if (!opp) return;
        const n = NEIGHBORHOODS.find((x) => x.nombre.toUpperCase() === name);
        if (!n) return;
        const el = document.createElement("div");
        el.className = "opp-pulse-dot";
        el.style.setProperty("--opp-color", opp.color);
        el.title = `${opp.emoji} ${opp.tipo} — ${opp.descripcion}`;
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          map.flyTo({ center: [n.lng, n.lat], zoom: 13.6, speed: 0.8 });
          onSelect(n);
        });
        new mapboxgl.Marker({ element: el }).setLngLat([n.lng, n.lat]).addTo(map);
      });
    });

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Selection sync + flyTo
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    NEIGHBORHOODS.forEach((n) => {
      map.setFeatureState({ source: "barrios", id: n.id }, { selected: n.id === selectedId });
    });
    if (selectedId != null) {
      const n = NEIGHBORHOODS.find((x) => x.id === selectedId);
      if (n) map.flyTo({ center: [n.lng, n.lat], zoom: 13.4, speed: 0.9 });
    }
  }, [selectedId]);

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
