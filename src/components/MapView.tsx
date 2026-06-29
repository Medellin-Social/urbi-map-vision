import { useEffect, useRef, useState } from "react";
import mapboxgl, { Map as MapboxMap } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAPBOX_TOKEN } from "@/lib/mapboxToken";
import { auth, MAP_STYLES } from "@/lib/auth";
import { barrioToNeighborhood, type ApiBarrio, type Neighborhood } from "@/lib/adapters";
import { useBarriosRaw, useScoreThresholds, useComunasMetrics, type ComunaMetrics } from "@/hooks/useBarrios";
import type { ApiListing } from "@/lib/adapters";
import { apiFetch } from "@/lib/apiClient";
import { API_ENDPOINTS } from "@/config/api";
import type { MapTab } from "@/components/MapNavbar";

type ViewportResponse = {
  mode: "clusters" | "points";
  zoom: number;
  clusters: { lng: number; lat: number; count: number; precio_promedio: number | null }[];
  listings: ApiListing[];
};
import {
  OPP_COLORS,
  PALETTE_EVENT,
  THRESHOLDS_EVENT,
  getActivePaletteId,
  setScoreThresholds,
  type ScorePaletteId,
} from "@/config/mapColors";
type Props = {
  onSelect: (n: Neighborhood) => void;
  selectedId: number | null;
  perfil?: string;
  risk?: string;
  mostrarOportunidades?: boolean;
  budgetRange?: [number, number] | null;
  onViewLevelChange?: (level: "comunas" | "barrios", comunaNombre: string | null, municipioFilter?: string | null, cdComuna?: number | null) => void;
  returnToComunasRef?: React.MutableRefObject<(() => void) | null>;
  onGoToMLS?: (n: Neighborhood) => void;
  // Vista 2 — MLS
  mapView?: "zonas" | "listings";
  mlsBarrioId?: number | null;
  // Viewport loading (FIX 1): active map filters + callback with the points
  // currently in view (so map.tsx can resolve clicks → mini-popup).
  mlsTipoOp?: "venta" | "arriendo";
  mlsPrecioMin?: number | null;
  mlsPrecioMax?: number | null;
  mlsCdComuna?: number | null;
  mlsMunicipio?: string | null;
  onViewportListingsChange?: (listings: ApiListing[]) => void;
  onAutoSelectBarrio?: (barrioId: number | null) => void;
  onAutoSelectComuna?: (cd: number | null, municipio: string | null, nombre: string | null) => void;
  highlightedListingId?: number | null;
  flyToListingRef?: React.MutableRefObject<((lat: number, lng: number) => void) | null>;
  onListingClickFromMap?: (id: number, screenX: number, screenY: number) => void;
  onListingDoubleClickFromMap?: (id: number) => void;
  activeBarrioName?: string | null;
  activeTab?: MapTab;
};

const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
// Zoom at which the polygon tier flips comuna → barrio (matches cluster→points). Knob.
const POLYGON_TIER_ZOOM = 13;
// Synthetic barrio ids (non-API fallback) live at/above this — excluded from the layer.
const _REAL_ID_MAX = 800_000;

// Municipalities not included in map data
const _HIDDEN_MUNICIPIOS = ["CALDAS", "COPACABANA", "GIRARDOTA", "BARBOSA"];

// Fallback static files for municipio blocks — only fetched when API omits them
const MUNICIPIO_STATIC: Record<number, string> = {
  101: "/data/comunas_bello.geojson",
  102: "/data/comunas_envigado.geojson",
  103: "/data/comunas_itagui.geojson",
  104: "/data/comunas_sabaneta.geojson",
  105: "/data/comunas_la_estrella.geojson",
};

// Calcula los bounds de un feature de Mapbox
function featureBounds(feat: mapboxgl.MapboxGeoJSONFeature): mapboxgl.LngLatBounds {
  const bounds = new mapboxgl.LngLatBounds();
  const geom = feat.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon;
  const rings = geom.type === "Polygon" ? geom.coordinates : geom.coordinates.flat(1);
  for (const ring of rings) {
    for (const [lng, lat] of ring as [number, number][]) {
      bounds.extend([lng, lat]);
    }
  }
  return bounds;
}

// ── Popup HTML for individual listing ───────────────────────────────────────

function _fmtCOP(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  return `$${(n / 1_000_000).toFixed(0)}M`;
}

function _fmtM2(n: number): string {
  return `$${(n / 1_000_000).toFixed(1)}M/m²`;
}

function _scoreLabel(s: number): string {
  if (s >= 70) return "EXCELENTE";
  if (s >= 55) return "BUENO";
  if (s >= 40) return "MODERADO";
  return "BAJO";
}

function buildListingPopupHTML(
  props: Record<string, unknown>,
  barrio: ApiBarrio | undefined,
  _perfil?: string,
): string {
  const precio_cop   = (props.precio_cop   as number | null) ?? null;
  const precio_usd   = (props.precio_usd   as number | null) ?? null;
  const precio_m2    = (props.precio_m2    as number | null) ?? null;
  const mediana      = (props.precio_m2_mediana_barrio as number | null) ?? null;
  const area_m2      = (props.area_m2      as number | null) ?? null;
  const habitaciones = (props.habitaciones as number | null) ?? null;
  const banos        = (props.banos        as number | null) ?? null;
  const tipo_op      = (props.tipo_op      as string) ?? "venta";
  const tipo_inmueble= (props.tipo_inmueble as string) ?? "";
  const barrio_nombre= (props.barrio_nombre as string) ?? "";
  const fuente       = ((props.fuente      as string) ?? "").toLowerCase();
  const url          = (props.url          as string) ?? "";

  const tipoBg    = tipo_op === "arriendo" ? "#E1F5EE" : "#FAECE7";
  const tipoColor = tipo_op === "arriendo" ? "#1D9E75" : "#D85A30";
  const tipoBadge = `<span style="background:${tipoBg};color:${tipoColor};padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;letter-spacing:.05em;">${tipo_op.toUpperCase()}</span>`;
  const inmBadge     = tipo_inmueble
    ? `<span style="background:rgba(26,18,8,.07);color:#6B5B45;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;text-transform:capitalize;">${tipo_inmueble}</span>`
    : "";

  const specs = [
    area_m2      ? `📐 ${area_m2}m²`        : null,
    habitaciones ? `🛏️ ${habitaciones}hab`  : null,
    banos        ? `🚿 ${banos}baños`        : null,
  ].filter(Boolean).join("&nbsp;&nbsp;");

  let badgeHTML = "";
  if (tipo_op === "venta" && precio_m2 && mediana && mediana > 0) {
    const diff = (precio_m2 - mediana) / mediana * 100;
    if (diff < -10)
      badgeHTML = `<div style="margin-top:8px;"><div style="color:#085041;font-weight:700;font-size:12px;">🟢 BUENA OFERTA</div><div style="color:#9B8B75;font-size:11px;">${Math.abs(diff).toFixed(0)}% bajo la mediana del barrio</div></div>`;
    else if (diff > 15)
      badgeHTML = `<div style="margin-top:8px;"><div style="color:#E24B4A;font-weight:700;font-size:12px;">🔴 SOBRE PRECIO</div><div style="color:#9B8B75;font-size:11px;">${diff.toFixed(0)}% sobre la mediana</div></div>`;
    else
      badgeHTML = `<div style="margin-top:8px;"><div style="color:#9B8B75;font-weight:700;font-size:12px;">⚪ PRECIO JUSTO</div><div style="color:#9B8B75;font-size:11px;">Dentro del rango del barrio</div></div>`;
  }

  let yieldHTML = "";
  if (tipo_op === "venta" && precio_cop && barrio?.mercado?.arriendo_p50_cop) {
    const y = barrio.mercado.arriendo_p50_cop * 12 / precio_cop * 100;
    if (y > 0 && y < 30)
      yieldHTML = `<div style="color:#9B8B75;font-size:11px;">Yield estimado: <strong style="color:#1A1208;">${y.toFixed(1)}%</strong></div>`;
  }

  let scoreHTML = "";
  if (barrio?.scores?.score_activo != null) {
    const s = barrio.scores.score_activo;
    scoreHTML = `<div style="color:#9B8B75;font-size:11px;">Score zona: <strong style="color:#1D9E75;">${s}</strong> · ${_scoreLabel(s)}</div>`;
  }

  const sourceMap: Record<string, string> = {
    fincaraiz:      "Ver en Fincaraíz →",
    metrocuadrado:  "Ver en Metrocuadrado →",
    medellinliving: "Ver en MedellinLiving →",
  };
  const sourceLabel = sourceMap[fuente] ?? "Ver listado →";
  const waText  = encodeURIComponent(
    `Hola, estoy interesado en una propiedad en ${barrio_nombre} de ${precio_cop ? _fmtCOP(precio_cop) : "—"} COP. ¿Pueden ayudarme?`
  );
  const waUrl   = `https://wa.me/+573122502394?text=${waText}`;
  const btnBase = `cursor:pointer;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;border:1px solid;`;
  const btnSrc  = url
    ? `<button onclick="window.open('${url.replace(/'/g,"\\'")}','_blank')" style="${btnBase}background:transparent;border-color:#E8E0D0;color:#6B5B45;">${sourceLabel}</button>`
    : "";
  const btnWa   = `<button onclick="window.open('${waUrl}','_blank')" style="${btnBase}background:#1D9E75;border-color:#1D9E75;color:#E1F5EE;">Agente 💬</button>`;

  return `
<div style="font-family:system-ui,sans-serif;min-width:220px;max-width:290px;color:#1A1208;">
  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px;">${tipoBadge}${inmBadge}</div>
  <div style="color:#9B8B75;font-size:11px;margin-bottom:8px;">${barrio_nombre}</div>
  ${precio_cop  ? `<div style="font-size:18px;font-weight:700;color:#1A1208;">${_fmtCOP(precio_cop)} COP</div>` : ""}
  ${precio_usd  ? `<div style="color:#9B8B75;font-size:11px;margin-bottom:6px;">~$${(precio_usd/1000).toFixed(0)}k USD</div>` : ""}
  ${specs       ? `<div style="font-size:12px;color:#6B5B45;margin:6px 0;">${specs}</div>` : ""}
  ${precio_m2   ? `<div style="font-size:11px;color:#9B8B75;">Precio/m²: <strong style="color:#1A1208;">${_fmtM2(precio_m2)}</strong></div>` : ""}
  ${mediana && tipo_op === "venta" ? `<div style="font-size:11px;color:#9B8B75;">Mediana zona: <strong style="color:#1A1208;">${_fmtM2(mediana)}</strong></div>` : ""}
  ${badgeHTML}
  ${yieldHTML || scoreHTML ? `<div style="margin-top:6px;">${yieldHTML}${scoreHTML}</div>` : ""}
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">${btnSrc}${btnWa}</div>
</div>`;
}

export function MapView({
  onSelect,
  selectedId,
  perfil,
  risk,
  mostrarOportunidades = false,
  budgetRange,
  onViewLevelChange,
  returnToComunasRef,
  onGoToMLS,
  mapView = "zonas",
  mlsBarrioId,
  mlsTipoOp,
  mlsPrecioMin,
  mlsPrecioMax,
  mlsCdComuna,
  mlsMunicipio,
  onViewportListingsChange,
  onAutoSelectBarrio,
  onAutoSelectComuna,
  highlightedListingId,
  flyToListingRef,
  onListingClickFromMap,
  onListingDoubleClickFromMap,
  activeBarrioName,
  activeTab,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const mapLoadedRef = useRef(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const staticFeaturesRef = useRef<GeoJSON.Feature[] | null>(null);
  const barriosRef = useRef<ApiBarrio[]>([]);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const mlsLastFlyToRef = useRef<number | null>(null);
  const zoneFlyRef = useRef<string | null>(null);  // last comuna/municipio flown-to
  const lastAutoBarrioRef = useRef<number | null>(null);  // camera-auto-selected barrio
  const lastAutoComunaRef = useRef<string | null>(null);  // camera-auto-selected comuna/muni key
  const tokenError = !MAPBOX_TOKEN || MAPBOX_TOKEN.includes("REPLACE_ME");
  const isMobileRef = useRef(typeof window !== "undefined" && window.innerWidth < 768);

  // Nivel de vista actual — ref para acceso dentro de closures de Mapbox
  const viewLevelRef = useRef<"comunas" | "barrios">("comunas");
  const activeComunaRef = useRef<{ cd: number; nombre: string; municipioFilter?: string | null } | null>(null);

  // Refs estables para callbacks (evita stale closures)
  const onViewLevelChangeRef = useRef(onViewLevelChange);
  useEffect(() => { onViewLevelChangeRef.current = onViewLevelChange; }, [onViewLevelChange]);

  const onGoToMLSRef = useRef(onGoToMLS);
  useEffect(() => { onGoToMLSRef.current = onGoToMLS; }, [onGoToMLS]);

  const onListingClickFromMapRef = useRef(onListingClickFromMap);
  useEffect(() => { onListingClickFromMapRef.current = onListingClickFromMap; }, [onListingClickFromMap]);
  const onListingDoubleClickFromMapRef = useRef(onListingDoubleClickFromMap);
  useEffect(() => { onListingDoubleClickFromMapRef.current = onListingDoubleClickFromMap; }, [onListingDoubleClickFromMap]);
  const onViewportListingsChangeRef = useRef(onViewportListingsChange);
  useEffect(() => { onViewportListingsChangeRef.current = onViewportListingsChange; }, [onViewportListingsChange]);
  const onAutoSelectBarrioRef = useRef(onAutoSelectBarrio);
  useEffect(() => { onAutoSelectBarrioRef.current = onAutoSelectBarrio; }, [onAutoSelectBarrio]);
  const onAutoSelectComunaRef = useRef(onAutoSelectComuna);
  useEffect(() => { onAutoSelectComunaRef.current = onAutoSelectComuna; }, [onAutoSelectComuna]);


  const riskRef = useRef(risk);
  const [scorePalette, setScorePalette] = useState<ScorePaletteId>(() => getActivePaletteId(risk));
  const [thresholdVersion, setThresholdVersion] = useState(0);

  useEffect(() => {
    const onPalette = () => setScorePalette(getActivePaletteId(riskRef.current));
    const onThresholds = () => setThresholdVersion((v) => v + 1);
    window.addEventListener(PALETTE_EVENT, onPalette);
    window.addEventListener(THRESHOLDS_EVENT, onThresholds);
    return () => {
      window.removeEventListener(PALETTE_EVENT, onPalette);
      window.removeEventListener(THRESHOLDS_EVENT, onThresholds);
    };
  }, []);

  const { data: thresholdsData } = useScoreThresholds();
  useEffect(() => {
    if (thresholdsData) setScoreThresholds(thresholdsData);
  }, [thresholdsData]);

  const { data: barriosRaw } = useBarriosRaw(perfil);

  useEffect(() => {
    if (barriosRaw?.length) barriosRef.current = barriosRaw;
  }, [barriosRaw]);

  const { data: comunasMetrics } = useComunasMetrics(perfil);

  // ── Helpers de navegación ────────────────────────────────────────────────────

  function switchToComunas(map: MapboxMap) {
    map.setLayoutProperty("comunas-fill",  "visibility", "visible");
    map.setLayoutProperty("comunas-line",  "visibility", "visible");
    map.setLayoutProperty("comunas-label", "visibility", "visible");
    map.flyTo({ center: [-75.5812, 6.2442], zoom: 11.5, pitch: isMobileRef.current ? 0 : 35, bearing: isMobileRef.current ? 0 : -10, speed: 0.9 });
    viewLevelRef.current = "comunas";
    activeComunaRef.current = null;
    onViewLevelChangeRef.current?.("comunas", null);
  }

  function switchToBarrios(
    map: MapboxMap,
    cd: number,
    nombre: string,
    bounds: mapboxgl.LngLatBounds,
    municipioFilter?: string | null,
  ) {
    // Fit the WHOLE zone in cluster tier (maxZoom < POLYGON_TIER_ZOOM) so the camera
    // derives the comuna/municipio (not a single barrio) and shows it all.
    // pitch/bearing 0 in the SAME move: the initial view is 3D-tilted and the first
    // click would otherwise race the listings flatten-easeTo → off-center.
    map.setTerrain(null);
    map.fitBounds(bounds, { padding: 40, maxZoom: POLYGON_TIER_ZOOM - 1, pitch: 0, bearing: 0, speed: 0.85 });
    viewLevelRef.current = "barrios";
    activeComunaRef.current = { cd, nombre, municipioFilter };
    onViewLevelChangeRef.current?.("barrios", nombre, municipioFilter ?? null, municipioFilter ? null : cd);
  }

  // Exponer goToComunas al padre via ref
  useEffect(() => {
    if (!returnToComunasRef) return;
    returnToComunasRef.current = () => {
      const map = mapRef.current;
      if (map && mapLoadedRef.current) switchToComunas(map);
    };
  });

  // ── Inicialización del mapa ──────────────────────────────────────────────────

  useEffect(() => {
    if (tokenError || !containerRef.current || mapRef.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;
    const styleId = auth.get()?.mapStyle ?? "monochrome";
    const isMobile = window.innerWidth < 768;
    isMobileRef.current = isMobile;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_STYLES[styleId]?.url ?? "mapbox://styles/mapbox/streets-v12",
      center: [-75.5812, 6.2442],
      zoom: 10,
      minZoom: 11,
      maxBounds: [[-75.72, 6.05], [-75.42, 6.45]],
      pitch: isMobile ? 0 : 35,
      bearing: isMobile ? 0 : -10,
      antialias: true,
    });
    mapRef.current = map;

    if (isMobile) {
      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();
    }

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true, showCompass: true }), "bottom-right");

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current!);
    requestAnimationFrame(() => map.resize());

    map.on("load", () => {
      map.resize();
      mapLoadedRef.current = true;
      setMapLoaded(true);

      // ── Limpiar POIs del mapa base ────────────────────────────────────────
      const baseStyle = map.getStyle();
      if (baseStyle?.layers) {
        for (const layer of baseStyle.layers) {
          const srcLayer = (layer as Record<string, unknown>)["source-layer"] as string | undefined;
          if (layer.type === "symbol") {
            const layout = (layer as mapboxgl.SymbolLayer).layout;
            const lid = layer.id.toLowerCase();
            const hide =
              (layout && "icon-image" in layout) ||
              lid.includes("road") ||
              lid.includes("street") ||
              lid.includes("transit") ||
              lid.includes("poi") ||
              lid.includes("airport") ||
              lid.includes("ferry") ||
              lid.includes("neighborhood") ||
              lid.includes("suburb") ||
              lid.includes("district") ||
              lid.includes("quarter");
            if (hide) map.setLayoutProperty(layer.id, "visibility", "none");
          }
          if (layer.type === "background") {
            map.setPaintProperty(layer.id, "background-color", "#FAF7F2");
          }
          if (layer.type === "fill" && srcLayer === "water") {
            map.setPaintProperty(layer.id, "fill-color", "#C8DFE8");
          }
          if (layer.type === "line" && srcLayer === "waterway") {
            map.setPaintProperty(layer.id, "line-color", "#C8DFE8");
          }
          if (layer.type === "fill" && srcLayer === "building") {
            map.setPaintProperty(layer.id, "fill-color", "#EDE8E0");
            map.setPaintProperty(layer.id, "fill-opacity", 0.45);
          }
        }
      }

      // ── CAPA 1: Comunas (vista inicial) ───────────────────────────────────
      map.addSource("comunas", { type: "geojson", data: EMPTY_FC });

      map.addLayer({
        id: "comunas-fill",
        type: "fill",
        source: "comunas",
        paint: {
          "fill-color": "#DAB33C",
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "hover"], false], 0.45,
            0.25,
          ],
        },
      });

      map.addLayer({
        id: "comunas-line",
        type: "line",
        source: "comunas",
        paint: {
          "line-color": "#002776",
          "line-opacity": 0.6,
          "line-width": 2,
        },
      });

      map.addLayer({
        id: "comunas-label",
        type: "symbol",
        source: "comunas",
        layout: {
          "text-field": ["get", "nombre"],
          "text-size": 13,
          "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
          "text-letter-spacing": 0.08,
          "text-transform": "uppercase",
        },
        paint: {
          "text-color": "#1A1208",
          "text-halo-color": "#FAF7F2",
          "text-halo-width": 2,
        },
      });

      // ── Hover: Comunas ─────────────────────────────────────────────────────
      let hoverComunaId: number | null = null;
      const comunaPopup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 8, className: "urbi-dark-tip" });

      map.on("mousemove", "comunas-fill", (e) => {
        if (!e.features?.length) return;
        const f = e.features[0];
        const id = f.id as number;
        if (hoverComunaId !== null && hoverComunaId !== id) {
          map.setFeatureState({ source: "comunas", id: hoverComunaId }, { hover: false });
        }
        hoverComunaId = id;
        map.setFeatureState({ source: "comunas", id }, { hover: true });
        map.getCanvas().style.cursor = "pointer";
        const nombre = f.properties?.nombre ?? "";
        comunaPopup
          .setLngLat(e.lngLat)
          .setHTML(`<span>${nombre}</span>`)
          .addTo(map);
      });

      map.on("mouseleave", "comunas-fill", () => {
        if (hoverComunaId !== null) {
          map.setFeatureState({ source: "comunas", id: hoverComunaId }, { hover: false });
        }
        hoverComunaId = null;
        map.getCanvas().style.cursor = "";
        comunaPopup.remove();
      });

      map.on("click", "comunas-fill", (e) => {
        if (!e.features?.length) return;
        const f = e.features[0];
        const cd = f.properties?.cd_comuna as number;
        const nombre = (f.properties?.nombre ?? "").toString();
        const isMunicipio = f.properties?.is_municipio === true;
        // queryRenderedFeatures clips geometry to the tile under the cursor → use the
        // full source feature (by nombre) so we fit the WHOLE zone, not a fragment.
        const full = staticFeaturesRef.current?.find((sf) => (sf.properties?.nombre ?? "") === nombre);
        const bounds = featureBounds((full ?? f) as mapboxgl.MapboxGeoJSONFeature);
        switchToBarrios(map, cd, nombre, bounds, isMunicipio ? nombre : null);
      });

      // ── CAPA BARRIOS (FIX 1c): polígonos de barrio, tier alto (zoom >= 13) ───
      map.addSource("barrios-mls", { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: "barrios-mls-fill",
        type: "fill",
        source: "barrios-mls",
        layout: { visibility: "none" },
        paint: {
          // CAMBIO 3: barrio sin relleno (fill-opacity 0, queryable para hit-test);
          // barrio activo = relleno muy tenue. knobs.
          "fill-color": "#002776",
          "fill-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 0.10, 0],
        },
      });
      map.addLayer({
        id: "barrios-mls-line",
        type: "line",
        source: "barrios-mls",
        layout: { visibility: "none" },
        paint: {
          // borde fino y suave; activo algo más marcado. knobs.
          "line-color": "#002776",
          "line-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 0.7, 0.4],
          "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 2.5, 1],
        },
      });
      // Etiqueta con el nombre del barrio sobre el polígono (tier alto).
      map.addLayer({
        id: "barrios-mls-label",
        type: "symbol",
        source: "barrios-mls",
        layout: {
          visibility: "none",
          "text-field": ["get", "nombre"],
          "text-size": 11,
          "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
          "text-transform": "uppercase",
          "text-letter-spacing": 0.05,
        },
        paint: {
          "text-color": "#1A1208",
          "text-halo-color": "#FAF7F2",
          "text-halo-width": 1.5,
        },
      });
      let hoverBarrioId: number | null = null;
      map.on("mousemove", "barrios-mls-fill", (e) => {
        if (!e.features?.length) return;
        map.getCanvas().style.cursor = "pointer";
        const id = e.features[0].id as number;
        if (hoverBarrioId !== null && hoverBarrioId !== id) {
          map.setFeatureState({ source: "barrios-mls", id: hoverBarrioId }, { hover: false });
        }
        hoverBarrioId = id;
        map.setFeatureState({ source: "barrios-mls", id }, { hover: true });
      });
      map.on("mouseleave", "barrios-mls-fill", () => {
        map.getCanvas().style.cursor = "";
        if (hoverBarrioId !== null) map.setFeatureState({ source: "barrios-mls", id: hoverBarrioId }, { hover: false });
        hoverBarrioId = null;
      });
      // Click en barrio → dirigir el mapa allí (la derivación por cámara lo selecciona).
      map.on("click", "barrios-mls-fill", (e) => {
        if (!e.features?.length) return;
        map.fitBounds(featureBounds(e.features[0]), { padding: 60, maxZoom: 15, duration: 600 });
      });

      // ── CAPA MLS: listings del barrio seleccionado (Vista 2) ─────────────────
      // Server-side clustering (FIX 1): cluster:false — clusters/points come
      // pre-aggregated from /listings/viewport. Cluster features carry a `count`.
      map.addSource("listings-mls", {
        type: "geojson",
        data: EMPTY_FC,
      });

      map.addLayer({
        id: "listings-mls-clusters",
        type: "circle",
        source: "listings-mls",
        filter: ["has", "count"],
        layout: { visibility: "none" },
        paint: {
          "circle-color": ["step", ["get", "count"], "#1D9E75", 10, "#085041", 50, "#1A1208"],
          "circle-radius": ["step", ["get", "count"], 20, 10, 30, 50, 40],
          "circle-opacity": 0.88,
          "circle-stroke-width": 2,
          "circle-stroke-color": "rgba(29,158,117,0.3)",
        },
      });

      map.addLayer({
        id: "listings-mls-cluster-count",
        type: "symbol",
        source: "listings-mls",
        filter: ["has", "count"],
        layout: {
          visibility: "none",
          "text-field": ["get", "count"],
          "text-size": 12,
          "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
        },
        paint: { "text-color": "#ffffff" },
      });

      map.addLayer({
        id: "listings-mls-unclustered",
        type: "circle",
        source: "listings-mls",
        filter: ["!", ["has", "count"]],
        layout: { visibility: "none" },
        paint: {
          "circle-radius": [
            "case",
            ["boolean", ["feature-state", "highlighted"], false], 12,
            8,
          ],
          "circle-color": [
            "case",
            // Agente verificado → amarillo
            ["==", ["get", "fuente_display"], "agente_verificado"], "#ffc928",
            // Propietario Pro → morado
            ["==", ["get", "fuente_display"], "propio_pro"],        "#7F77DD",
            // Propietario Free → gris cálido
            ["==", ["get", "fuente_display"], "propio"],            "#9B8B75",
            // FC/MC → color por tipo de inmueble
            ["==", ["get", "tipo_inmueble"], "apartamento"],        "#1D9E75",
            ["==", ["get", "tipo_inmueble"], "casa"],               "#D85A30",
            ["==", ["get", "tipo_inmueble"], "casa_lote"],          "#D85A30",
            ["==", ["get", "tipo_inmueble"], "finca"],              "#D85A30",
            ["==", ["get", "tipo_inmueble"], "apartaestudio"],      "#5DCAA5",
            ["==", ["get", "tipo_inmueble"], "lote"],               "#BA7517",
            ["==", ["get", "tipo_inmueble"], "local"],              "#7F77DD",
            ["==", ["get", "tipo_inmueble"], "oficina"],            "#378ADD",
            ["==", ["get", "tipo_inmueble"], "bodega"],             "#9B8B75",
            ["==", ["get", "tipo_inmueble"], "consultorio"],        "#9B8B75",
            "#1D9E75",
          ],
          "circle-stroke-width": [
            "case",
            ["boolean", ["feature-state", "highlighted"], false], 3,
            2,
          ],
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.9,
        },
      });

      // Click en cluster → seleccionar la comuna/municipio bajo el punto y fitearla
      // entera (las burbujas tapan los polígonos, así que el click cae aquí). Si no
      // hay comuna bajo el punto, fallback: acercar hacia el cluster.
      map.on("click", "listings-mls-clusters", (e) => {
        if (!e.features?.length) return;
        const cf = map.queryRenderedFeatures(e.point, { layers: ["comunas-fill"] });
        if (cf.length) {
          const props = cf[0].properties;
          const nombre = (props?.nombre ?? "").toString();
          const cd = props?.cd_comuna as number;
          const isMunicipio = props?.is_municipio === true;
          const full = staticFeaturesRef.current?.find((sf) => (sf.properties?.nombre ?? "") === nombre);
          const bounds = featureBounds((full ?? cf[0]) as mapboxgl.MapboxGeoJSONFeature);
          switchToBarrios(map, cd, nombre, bounds, isMunicipio ? nombre : null);
          return;
        }
        const center = (e.features[0].geometry as GeoJSON.Point).coordinates as [number, number];
        map.easeTo({ center, zoom: Math.min(map.getZoom() + 2, 16) });
      });

      // Click en punto individual → mini popup (debounced to distinguish dblclick)
      let _pendingClick: ReturnType<typeof setTimeout> | null = null;
      map.on("click", "listings-mls-unclustered", (e) => {
        if (!e.features?.length) return;
        const props = e.features[0].properties as Record<string, unknown>;
        const coords = (e.features[0].geometry as GeoJSON.Point).coordinates as [number, number];
        while (Math.abs(e.lngLat.lng - coords[0]) > 180) {
          coords[0] += e.lngLat.lng > coords[0] ? 360 : -360;
        }
        const point = map.project(coords);
        if (_pendingClick !== null) return;
        _pendingClick = setTimeout(() => {
          _pendingClick = null;
          onListingClickFromMapRef.current?.(props.id as number, point.x, point.y);
        }, 220);
      });

      // Doble click en punto → abrir drawer directo
      map.on("dblclick", "listings-mls-unclustered", (e) => {
        e.preventDefault();
        if (_pendingClick !== null) { clearTimeout(_pendingClick); _pendingClick = null; }
        if (!e.features?.length) return;
        const props = e.features[0].properties as Record<string, unknown>;
        onListingDoubleClickFromMapRef.current?.(props.id as number);
      });

      map.on("mouseenter", "listings-mls-clusters",    () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "listings-mls-clusters",    () => { map.getCanvas().style.cursor = ""; });
      map.on("mouseenter", "listings-mls-unclustered", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "listings-mls-unclustered", () => { map.getCanvas().style.cursor = ""; });

      // Source starts empty — useEffect([comunasMetrics]) loads static GeoJSON + enriches with API metrics.

      // ── Terreno 3D ────────────────────────────────────────────────────────────
      map.addSource("mapbox-dem", {
        type: "raster-dem",
        url: "mapbox://mapbox.mapbox-terrain-dem-v1",
        tileSize: 512,
        maxzoom: 14,
      });
      map.setTerrain({ source: "mapbox-dem", exaggeration: 1.5 });
      map.setFog({
        color: "#FAF7F2",
        "high-color": "#d4c9b8",
        "horizon-blend": 0.08,
        "space-color": "#FAF7F2",
        "star-intensity": 0,
      });
    });

    return () => {
      ro.disconnect();
      mapLoadedRef.current = false;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Poblar capa comunas: geometría oficial estática + métricas de la API ──────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    const source = map.getSource("comunas") as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;

    const enrichAndRender = (features: GeoJSON.Feature[]) => {
      const enriched = features.map((feat) => {
        const cd = feat.properties?.cd_comuna as number | null;
        const m: ComunaMetrics | undefined = cd != null ? comunasMetrics?.[String(cd)] : undefined;
        return {
          ...feat,
          id: cd ?? feat.id,
          properties: m
            ? { ...feat.properties, ...m }
            : { ...feat.properties, has_data: false },
        };
      });
      source.setData({ type: "FeatureCollection", features: enriched } as GeoJSON.FeatureCollection);
    };

    if (staticFeaturesRef.current) {
      enrichAndRender(staticFeaturesRef.current);
      return;
    }

    // Primera carga — fetch archivos GeoJSON estáticos oficiales
    const staticFiles = [
      "/data/comunas_medellin.geojson",
      ...Object.values(MUNICIPIO_STATIC),
    ];
    Promise.all(
      staticFiles.map((f) =>
        fetch(f).then((r) => r.json()).catch(() => ({ type: "FeatureCollection", features: [] }))
      )
    ).then((results: { features: GeoJSON.Feature[] }[]) => {
      const features = results.flatMap((fc) => (fc.features ?? []) as GeoJSON.Feature[]);
      staticFeaturesRef.current = features;
      enrichAndRender(features);
    });
  }, [comunasMetrics, mapLoaded]);

  // ── Vista 1 ↔ Vista 2: toggle capas (solo depende de mapView) ──────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    const mlsLayers = ["listings-mls-clusters", "listings-mls-cluster-count", "listings-mls-unclustered"] as const;

    if (mapView === "listings") {
      // Polygons stay as context — the polygon-tier effect (FIX 1c) toggles
      // comuna vs barrio by zoom. Just show the listing dots here.
      for (const id of mlsLayers) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "visible");
      }
      map.setTerrain(null);
      map.easeTo({ pitch: 0, duration: 500 });
    } else {
      // Vista 1: ocultar MLS layers + barrio polygons, volver a comunas
      mlsLastFlyToRef.current = null;
      for (const id of [...mlsLayers, "barrios-mls-fill", "barrios-mls-line", "barrios-mls-label"]) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
      }
      (map.getSource("listings-mls") as mapboxgl.GeoJSONSource)?.setData(EMPTY_FC);
      // restore comuna line (tier may have made it tenue)
      if (map.getLayer("comunas-line")) {
        map.setPaintProperty("comunas-line", "line-width", 2);
        map.setPaintProperty("comunas-line", "line-opacity", 0.6);
      }
      if (map.getSource("mapbox-dem")) {
        map.setTerrain({ source: "mapbox-dem", exaggeration: 1.5 });
      }
      switchToComunas(map);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapView]);

  // ── Vista 2: actualizar datos GeoJSON cuando llegan listings ────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current || mapView !== "listings") return;

    let cancelled = false;
    let debounce: ReturnType<typeof setTimeout> | null = null;

    const loadViewport = async () => {
      const b = map.getBounds();
      if (!b) return;
      const params = new URLSearchParams({
        min_lng: String(b.getWest()),
        min_lat: String(b.getSouth()),
        max_lng: String(b.getEast()),
        max_lat: String(b.getNorth()),
        zoom: String(Math.round(map.getZoom())),
      });
      if (mlsTipoOp) params.set("tipo_operacion", mlsTipoOp);
      if (mlsPrecioMin != null) params.set("precio_min", String(mlsPrecioMin));
      if (mlsPrecioMax != null) params.set("precio_max", String(mlsPrecioMax));
      // Geographic selection — backend ignores bbox when a zone is active.
      if (mlsBarrioId != null) params.set("barrio_id", String(mlsBarrioId));
      if (mlsCdComuna != null) params.set("cd_comuna", String(mlsCdComuna));
      if (mlsMunicipio) params.set("municipio", mlsMunicipio);
      try {
        const res = await apiFetch<ViewportResponse>(`${API_ENDPOINTS.allListings}/viewport?${params}`);
        if (cancelled) return;
        const src = map.getSource("listings-mls") as mapboxgl.GeoJSONSource | undefined;
        if (!src) return;
        if (res.mode === "clusters") {
          // CAMBIO 4A: clusters mode also returns a capped panel list → feed the panel.
          onViewportListingsChangeRef.current?.(res.listings ?? []);
          src.setData({
            type: "FeatureCollection",
            features: res.clusters.map((c) => ({
              type: "Feature" as const,
              geometry: { type: "Point" as const, coordinates: [c.lng, c.lat] },
              properties: { count: c.count, precio_promedio: c.precio_promedio },
            })),
          } as GeoJSON.FeatureCollection);
        } else {
          const pts = res.listings.filter((l) => l.lat != null && l.lon != null);
          onViewportListingsChangeRef.current?.(pts);
          src.setData({
            type: "FeatureCollection",
            features: pts.map((l) => ({
              type: "Feature" as const,
              id: l.id,
              geometry: { type: "Point" as const, coordinates: [l.lon!, l.lat!] },
              properties: {
                id: l.id,
                tipo_op: l.tipo_operacion ?? "venta",
                tipo_inmueble: l.tipo_inmueble ?? "",
                fuente_display: l.fuente_display ?? l.fuente ?? "",
                tier: l.tier ?? "",
              },
            })),
          } as unknown as GeoJSON.FeatureCollection);
        }
      } catch { /* transient fetch error — keep current dots */ }
    };

    const onMove = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(loadViewport, 300);
    };

    map.on("moveend", onMove);
    map.on("zoomend", onMove);
    loadViewport();

    return () => {
      cancelled = true;
      if (debounce) clearTimeout(debounce);
      map.off("moveend", onMove);
      map.off("zoomend", onMove);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapView, mlsBarrioId, mlsCdComuna, mlsMunicipio, mlsTipoOp, mlsPrecioMin, mlsPrecioMax]);

  // ── FIX 1c: polígono tier (comuna↔barrio por zoom) + auto-select por cámara ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current || mapView !== "listings") return;

    // Poblar polígonos de barrio desde barriosRaw (ids reales 1-945, con geometry).
    const src = map.getSource("barrios-mls") as mapboxgl.GeoJSONSource | undefined;
    if (src) {
      const feats = (barriosRaw ?? [])
        .filter((b) => b.geometry && b.barrio_id < _REAL_ID_MAX)
        .map((b) => ({
          type: "Feature" as const,
          id: b.barrio_id,
          geometry: b.geometry as GeoJSON.Geometry,
          properties: { barrio_id: b.barrio_id, nombre: b.nombre ?? "", cd_comuna: b.cd_comuna ?? null },
        }));
      src.setData({ type: "FeatureCollection", features: feats } as GeoJSON.FeatureCollection);
    }

    const setVis = (id: string, v: "visible" | "none") => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", v);
    };
    const applyTier = () => {
      const hi = map.getZoom() >= POLYGON_TIER_ZOOM;
      setVis("comunas-fill",  hi ? "none" : "visible");
      setVis("comunas-label", hi ? "none" : "visible");
      setVis("comunas-line",  "visible");
      if (map.getLayer("comunas-line")) {
        map.setPaintProperty("comunas-line", "line-width",   hi ? 0.8 : 2);
        map.setPaintProperty("comunas-line", "line-opacity", hi ? 0.35 : 0.6);
      }
      setVis("barrios-mls-fill",  hi ? "visible" : "none");
      setVis("barrios-mls-line",  hi ? "visible" : "none");
      setVis("barrios-mls-label", hi ? "visible" : "none");
    };

    // FIX 1d — free navigation: zone derived from the camera on every move (no
    // lock). zoom<TIER → comuna under center; zoom>=TIER → barrio under center.
    const clearBarrioSel = () => {
      if (lastAutoBarrioRef.current != null) {
        map.setFeatureState({ source: "barrios-mls", id: lastAutoBarrioRef.current }, { selected: false });
        lastAutoBarrioRef.current = null;
      }
    };
    const autoSelect = () => {
      const c = map.project(map.getCenter());
      if (map.getZoom() < POLYGON_TIER_ZOOM) {
        if (lastAutoBarrioRef.current != null) { clearBarrioSel(); onAutoSelectBarrioRef.current?.(null); }
        const cfeats = map.queryRenderedFeatures([c.x, c.y], { layers: ["comunas-fill"] });
        const f = cfeats.length ? cfeats[0].properties : undefined;
        const isMuni = f?.is_municipio === true;
        const cd = isMuni ? null : ((f?.cd_comuna as number) ?? null);
        const muni = isMuni ? ((f?.nombre as string) ?? null) : null;
        const nombre = (f?.nombre as string) ?? null;
        const key = isMuni ? `m:${muni}` : cd != null ? `c:${cd}` : null;
        if (key !== lastAutoComunaRef.current) {
          lastAutoComunaRef.current = key;
          onAutoSelectComunaRef.current?.(cd, muni, nombre);
        }
        return;
      }
      // barrio under center (zoom >= TIER)
      lastAutoComunaRef.current = null;
      const feats = map.queryRenderedFeatures([c.x, c.y], { layers: ["barrios-mls-fill"] });
      const bid = feats.length ? (feats[0].id as number) : null;
      if (bid != null && bid !== lastAutoBarrioRef.current) {
        clearBarrioSel();
        map.setFeatureState({ source: "barrios-mls", id: bid }, { selected: true });
        lastAutoBarrioRef.current = bid;
        onAutoSelectBarrioRef.current?.(bid);
      }
    };

    let debounce: ReturnType<typeof setTimeout> | null = null;
    const onMove = () => {
      applyTier();                       // tier visual is immediate
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(autoSelect, 300);   // derive on every move (gesture or fly-to)
    };

    applyTier();
    map.on("moveend", onMove);
    map.on("zoomend", onMove);
    return () => {
      if (debounce) clearTimeout(debounce);
      map.off("moveend", onMove);
      map.off("zoomend", onMove);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapView, barriosRaw]);

  // ── Highlight listing seleccionado ───────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !map.getSource("listings-mls")) return;
    map.removeFeatureState({ source: "listings-mls" });
    if (highlightedListingId != null) {
      map.setFeatureState(
        { source: "listings-mls", id: highlightedListingId },
        { highlighted: true },
      );
    }
  }, [highlightedListingId]);

  // ── Opacidad diferenciada por barrio activo ──────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current || !map.getLayer("listings-mls-unclustered")) return;
    if (activeBarrioName) {
      map.setPaintProperty("listings-mls-unclustered", "circle-opacity", [
        "case",
        ["==", ["get", "barrio_nombre"], activeBarrioName], 0.9,
        0.2,
      ]);
      map.setPaintProperty("listings-mls-clusters", "circle-opacity", 0.3);
    } else {
      map.setPaintProperty("listings-mls-unclustered", "circle-opacity", 0.9);
      map.setPaintProperty("listings-mls-clusters", "circle-opacity", 0.88);
    }
  }, [activeBarrioName]);

  // ── Exponer flyTo al padre ───────────────────────────────────────────────────
  useEffect(() => {
    if (!flyToListingRef) return;
    flyToListingRef.current = (lat: number, lng: number) => {
      const map = mapRef.current;
      if (map && mapLoadedRef.current) map.flyTo({ center: [lng, lat], zoom: 16, speed: 0.9 });
    };
  });


  // ── Markers de oportunidades ─────────────────────────────────────────────────
  function addOpportunityMarkers(map: MapboxMap) {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    barriosRef.current.forEach((b) => {
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
        map.flyTo({ center: [nb.lng, nb.lat], zoom: 14.5, speed: 0.8 });
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
            Configura el secreto{" "}
            <code className="rounded bg-background/60 px-1.5 py-0.5 text-xs">MAPBOX_PUBLIC_TOKEN</code>{" "}
            en Lovable Cloud para cargar el mapa de Medellín.
          </p>
        </div>
      </div>
    );
  }

  const LEGEND_ITEMS = [
    { color: "#1D9E75", label: "Apto" },
    { color: "#D85A30", label: "Casa" },
    { color: "#5DCAA5", label: "Aptaestudio" },
    { color: "#BA7517", label: "Lote" },
    { color: "#7F77DD", label: "Local" },
    { color: "#378ADD", label: "Oficina" },
    { color: "#9B8B75", label: "Bodega" },
  ];

  return (
    <>
      <div ref={containerRef} className="absolute inset-0 z-0 min-h-screen" />

      {/* Leyenda tipos de inmueble — solo en vista de listings */}
      {mapView === "listings" && (
        <div style={{
          position: "absolute", bottom: 40, left: 16, zIndex: 10,
          background: "rgba(250,247,242,0.95)", border: "1px solid #E8E0D0",
          borderRadius: 8, padding: "8px 12px",
          display: "flex", flexWrap: "wrap", gap: "5px 10px", maxWidth: 260,
        }}>
          {LEGEND_ITEMS.map(({ color, label }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#1A1208" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />
              {label}
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#1A1208" }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#ffc928", lineHeight: 1 }}>★</span>
            Premium
          </div>
        </div>
      )}

    </>
  );
}
