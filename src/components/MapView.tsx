import { useEffect, useMemo, useRef } from "react";
import mapboxgl, { Map as MapboxMap } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAPBOX_TOKEN } from "@/lib/mapboxToken";
import { auth, MAP_STYLES } from "@/lib/auth";
import { barrioToNeighborhood, barriosToGeoJSON, type ApiBarrio, type Neighborhood } from "@/lib/adapters";
import { useTarget } from "@/contexts/TargetContext";
import { useBarriosRaw, useScoreThresholds, useComunasGeoJSON } from "@/hooks/useBarrios";
import type { ApiListing } from "@/lib/adapters";
import {
  OPP_COLORS,
  PALETTE_EVENT,
  THRESHOLDS_EVENT,
  getActivePaletteId,
  setScoreThresholds,
  type ScorePaletteId,
} from "@/config/mapColors";
import { useState } from "react";

type Props = {
  onSelect: (n: Neighborhood) => void;
  selectedId: number | null;
  perfil?: string;
  risk?: string;
  mostrarOportunidades?: boolean;
  budgetRange?: [number, number] | null;
  onViewLevelChange?: (level: "comunas" | "barrios", comunaNombre: string | null) => void;
  returnToComunasRef?: React.MutableRefObject<(() => void) | null>;
  onGoToMLS?: (n: Neighborhood) => void;
  // Vista 2 — MLS
  mapView?: "zonas" | "listings";
  mlsBarrioId?: number | null;
  mlsListings?: ApiListing[];
  highlightedListingId?: number | null;
  flyToListingRef?: React.MutableRefObject<((lat: number, lng: number) => void) | null>;
  onListingClickFromMap?: (id: number, screenX: number, screenY: number) => void;
  onListingDoubleClickFromMap?: (id: number) => void;
  activeBarrioName?: string | null;
  // Draw-to-filter
  drawModeActive?: boolean;
  onDrawPolygon?: (polygon: GeoJSON.Feature) => void;
  onDrawDelete?: () => void;
  clearDrawRef?: React.MutableRefObject<(() => void) | null>;
};

const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

// Municipalities not included in map data
const _HIDDEN_MUNICIPIOS = ["CALDAS", "COPACABANA", "GIRARDOTA", "BARBOSA"];

// Non-Medellín municipalities shown as top-level commune blocks
const COMUNAS_FILES = [
  "/data/comunas_medellin.geojson",
  "/data/comunas_bello.geojson",
  "/data/comunas_envigado.geojson",
  "/data/comunas_itagui.geojson",
  "/data/comunas_sabaneta.geojson",
  "/data/comunas_la_estrella.geojson",
];

const _PERFIL_BADGE_LABEL: Record<string, string> = {
  airbnb: "Renta Corta",
  mediano_plazo: "Renta Media",
  largo_plazo: "Renta Larga",
};

const _RISK_BADGE_LABEL: Record<string, string> = {
  conservador: "Conservador",
  moderado: "Moderado",
  agresivo: "Agresivo",
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
  mlsListings,
  highlightedListingId,
  flyToListingRef,
  onListingClickFromMap,
  onListingDoubleClickFromMap,
  activeBarrioName,
  drawModeActive = false,
  onDrawPolygon,
  onDrawDelete,
  clearDrawRef,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const mapLoadedRef = useRef(false);
  const barriosRef = useRef<ApiBarrio[]>([]);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const mlsLastFlyToRef = useRef<number | null>(null);
  const tokenError = !MAPBOX_TOKEN || MAPBOX_TOKEN.includes("REPLACE_ME");
  const isMobileRef = useRef(typeof window !== "undefined" && window.innerWidth < 768);

  // Nivel de vista actual — ref para acceso dentro de closures de Mapbox
  const viewLevelRef = useRef<"comunas" | "barrios">("comunas");
  const activeComunaRef = useRef<{ cd: number; nombre: string; municipioFilter?: string | null } | null>(null);

  // Refs estables para callbacks (evita stale closures)
  const onViewLevelChangeRef = useRef(onViewLevelChange);
  useEffect(() => { onViewLevelChangeRef.current = onViewLevelChange; }, [onViewLevelChange]);

  const onDrawPolygonRef = useRef(onDrawPolygon);
  useEffect(() => { onDrawPolygonRef.current = onDrawPolygon; }, [onDrawPolygon]);

  const onDrawDeleteRef = useRef(onDrawDelete);
  useEffect(() => { onDrawDeleteRef.current = onDrawDelete; }, [onDrawDelete]);

  const onGoToMLSRef = useRef(onGoToMLS);
  useEffect(() => { onGoToMLSRef.current = onGoToMLS; }, [onGoToMLS]);

  const onListingClickFromMapRef = useRef(onListingClickFromMap);
  useEffect(() => { onListingClickFromMapRef.current = onListingClickFromMap; }, [onListingClickFromMap]);
  const onListingDoubleClickFromMapRef = useRef(onListingDoubleClickFromMap);
  useEffect(() => { onListingDoubleClickFromMapRef.current = onListingDoubleClickFromMap; }, [onListingDoubleClickFromMap]);


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
  const { target } = useTarget();
  const targetRef = useRef(target);
  useEffect(() => { targetRef.current = target; }, [target]);

  const geoJsonData = useMemo(() => {
    if (!barriosRaw?.length) return null;
    barriosRef.current = barriosRaw;
    return barriosToGeoJSON(barriosRaw, scorePalette, perfil, budgetRange, risk, target);
  }, [barriosRaw, scorePalette, perfil, budgetRange, risk, thresholdVersion, target]);

  const { data: comunasGeoJSON } = useComunasGeoJSON(perfil, target ?? "investor");

  // ── Helpers de navegación ────────────────────────────────────────────────────

  function switchToComunas(map: MapboxMap) {
    // Mostrar comunas (todos los municipios)
    map.setLayoutProperty("comunas-fill",  "visibility", "visible");
    map.setLayoutProperty("comunas-line",  "visibility", "visible");
    map.setLayoutProperty("comunas-label", "visibility", "visible");
    // Ocultar barrios — sólo se muestran al hacer drill-down en una comuna
    map.setLayoutProperty("barrios-fill",  "visibility", "none");
    map.setLayoutProperty("barrios-line",  "visibility", "none");
    map.setLayoutProperty("barrios-label", "visibility", "none");
    // Volver a vista Valle de Aburrá
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
    // municipioFilter set → whole-municipality drill-down (Bello, Envigado, etc.)
    // otherwise → Medellín commune drill-down by cd_comuna
    const filter: mapboxgl.FilterSpecification = municipioFilter
      ? ["==", ["get", "municipio"], municipioFilter]
      : ["==", ["get", "cd_comuna"], cd];
    map.setFilter("barrios-fill",  filter);
    map.setFilter("barrios-line",  filter);
    map.setFilter("barrios-label", filter);
    map.setLayoutProperty("barrios-fill",  "visibility", "visible");
    map.setLayoutProperty("barrios-line",  "visibility", "visible");
    map.setLayoutProperty("barrios-label", "visibility", "visible");
    // Ocultar comunas
    map.setLayoutProperty("comunas-fill",  "visibility", "none");
    map.setLayoutProperty("comunas-line",  "visibility", "none");
    map.setLayoutProperty("comunas-label", "visibility", "none");
    // Ajustar cámara a los límites de la comuna
    map.fitBounds(bounds, { padding: 60, maxZoom: 14, speed: 0.85 });
    viewLevelRef.current = "barrios";
    activeComunaRef.current = { cd, nombre, municipioFilter };
    onViewLevelChangeRef.current?.("barrios", nombre);
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
    const styleId = auth.get()?.mapStyle ?? "light";
    const isMobile = window.innerWidth < 768;
    isMobileRef.current = isMobile;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_STYLES[styleId]?.url ?? "mapbox://styles/mapbox/light-v11",
      center: [-75.5812, 6.2442],
      zoom: 11.5,
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

      // ── CAPA 1: Comunas (vista inicial) ───────────────────────────────────
      map.addSource("comunas", { type: "geojson", data: EMPTY_FC });

      map.addLayer({
        id: "comunas-fill",
        type: "fill",
        source: "comunas",
        paint: {
          "fill-color": ["coalesce", ["get", "color_hex"], "#1e3a5f"],
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "hover"], false], 0.78,
            ["==", ["get", "has_data"], true], 0.55,
            0.38,
          ],
        },
      });

      map.addLayer({
        id: "comunas-line",
        type: "line",
        source: "comunas",
        paint: {
          "line-color": "#1D9E75",
          "line-opacity": 0.85,
          "line-width": [
            "case",
            ["boolean", ["feature-state", "hover"], false], 2.5,
            1.2,
          ],
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
          "text-halo-color": "rgba(250,247,242,0.9)",
          "text-halo-width": 1.5,
        },
      });

      // ── CAPA 2: Barrios ───────────────────────────────────────────────────
      // Non-Medellín barrios are visible at all zoom levels.
      // Medellín barrios only appear after drilling into a commune.
      map.addSource("barrios", { type: "geojson", data: EMPTY_FC });

      map.addLayer({
        id: "barrios-fill",
        type: "fill",
        source: "barrios",
        layout: { visibility: "none" },
        paint: {
          "fill-color": ["get", "color_hex"],
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false], 0.88,
            ["boolean", ["feature-state", "hover"], false], 0.78,
            ["==", ["get", "in_budget"], false], 0.07,
            ["==", ["get", "color_hex"], "#00d4ff"], 0.2,
            0.6,
          ],
        },
      });

      map.addLayer({
        id: "barrios-line",
        type: "line",
        source: "barrios",
        layout: { visibility: "none" },
        paint: {
          "line-color": "#1A1208",
          "line-opacity": 0.5,
          "line-width": [
            "case",
            ["boolean", ["feature-state", "selected"], false], 2.5,
            ["boolean", ["feature-state", "hover"], false], 1.5,
            0.8,
          ],
        },
      });

      map.addLayer({
        id: "barrios-label",
        type: "symbol",
        source: "barrios",
        minzoom: 12,
        layout: {
          visibility: "none",
          "text-field": ["get", "nombre"],
          "text-size": 11,
          "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
          "text-letter-spacing": 0.08,
          "text-transform": "uppercase",
        },
        paint: {
          "text-color": "#FAF7F2",
          "text-halo-color": "rgba(14,10,6,0.88)",
          "text-halo-width": 1.6,
        },
      });

      // ── Hover: Comunas ─────────────────────────────────────────────────────
      let hoverComunaId: number | null = null;
      const comunaPopup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });

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
        const t = targetRef.current;
        const fmtM = (n: number) => `$${(n / 1_000_000).toFixed(1)}M/m²`;
        const fmtCOP = (n: number) => `$${(n / 1_000_000).toFixed(0)}M`;
        let metricHtml = "";
        const hasData = f.properties?.has_data === true;
        if (hasData) {
          if (t === "buyer") {
            const pm2 = f.properties?.precio_m2_cop as number | null;
            metricHtml = pm2 ? `<span style="color:#639922;font-weight:700;">${fmtM(pm2)}</span>` : "";
          } else if (t === "seller") {
            const liq = f.properties?.liquidez_score as number | null;
            metricHtml = liq != null ? `<span style="color:#1D9E75;font-weight:700;">Liquidez ${liq}</span>` : "";
          } else if (t === "landlord") {
            const y = f.properties?.yield_promedio as number | null;
            metricHtml = y ? `<span style="color:#1D9E75;font-weight:700;">${y.toFixed(1)}% yield</span>` : "";
          } else if (t === "renter") {
            const arr = f.properties?.arriendo_cop as number | null;
            metricHtml = arr ? `<span style="color:#BA7517;font-weight:700;">${fmtCOP(arr)}/mes</span>` : "";
          } else {
            const sc = f.properties?.score_promedio as number | null;
            metricHtml = sc != null ? `<span style="color:#1D9E75;font-weight:700;">Score ${sc}</span>` : "";
          }
        }
        comunaPopup
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="font-weight:600;letter-spacing:.05em;font-size:13px;">${nombre}</div>
             ${metricHtml ? `<div style="font-size:11px;margin-top:3px;">${metricHtml}</div>` : ""}
             <div style="color:#9ca3af;font-size:11px;margin-top:2px;">Click para ver barrios</div>`
          )
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
        const bounds = featureBounds(f);
        const isMunicipio = f.properties?.is_municipio === true;
        switchToBarrios(map, cd, nombre, bounds, isMunicipio ? nombre : null);
      });

      // ── Hover: Barrios ─────────────────────────────────────────────────────
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
        const excluido = f.properties?.excluir_inversion === true;
        const t = targetRef.current;

        const fmtCOP = (n: number) =>
          n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(0)}M` : `$${n.toLocaleString()}`;

        let metricHtml = "";
        if (excluido) {
          metricHtml = `<span style="color:#9ca3af;font-size:11px;">No disponible</span>`;
        } else if (t === "buyer") {
          const pm2 = f.properties?.precio_m2_cop as number | null;
          metricHtml = pm2
            ? `<span style="color:#639922;font-weight:700;">${fmtCOP(pm2)}/m²</span>`
            : `<span style="color:#9ca3af;font-size:11px;">Sin datos</span>`;
        } else if (t === "seller") {
          const liq = f.properties?.liquidez_tiempo as string | null;
          metricHtml = liq
            ? `<span style="color:#1D9E75;font-size:11px;">${liq}</span>`
            : `<span style="color:#9ca3af;font-size:11px;">Sin datos</span>`;
        } else if (t === "landlord") {
          const y = f.properties?.yield_bruto_pct as number | null;
          metricHtml = y
            ? `<span style="color:#1D9E75;font-weight:700;">${y.toFixed(1)}% yield</span>`
            : `<span style="color:#9ca3af;font-size:11px;">Sin datos</span>`;
        } else if (t === "renter") {
          const canon = f.properties?.arriendo_p50_cop as number | null;
          metricHtml = canon
            ? `<span style="color:#BA7517;font-weight:700;">${fmtCOP(canon)}/mes</span>`
            : `<span style="color:#9ca3af;font-size:11px;">Sin datos</span>`;
        } else {
          // investor
          const score = f.properties?.score_activo as number | null;
          const cat = f.properties?.cat_activo ?? "—";
          metricHtml = (score === null || score < 20)
            ? `<span style="color:#9ca3af;font-size:11px;">${cat}</span>`
            : `<span style="color:#1D9E75;font-weight:700;">${score}</span><span style="color:#9B8B75;font-size:11px;"> ${cat}</span>`;
        }

        popup
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="display:flex;align-items:center;gap:8px;">
              <span style="font-weight:600;letter-spacing:.04em;">${nombre}</span>
              ${metricHtml}
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
        // Skip when clicking on a listing point or cluster
        if (map.queryRenderedFeatures(e.point, { layers: ["listings-mls-unclustered", "listings-mls-clusters"] }).length > 0) return;
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
            id, nombre: name, comuna: f.properties?.nombre_comuna ?? activeComunaRef.current?.nombre ?? "—",
            municipio: "MEDELLÍN", estrato: 3, precio_m2,
            arriendo: Math.round(precio_m2 * 0.0008 * 90),
            yield: y, anos_recupero: Number((100 / y).toFixed(1)),
            dist_metro: 1 + (seed % 30) / 10, dist_parque: 0.3 + (seed % 10) / 10,
            dist_mall: 1 + (seed % 25) / 10, n_venta: 1 + (seed % 8),
            n_arriendo: 1 + (seed % 5), lat, lng,
          };
        }

        map.flyTo({ center: [n.lng, n.lat], zoom: 14.5, speed: 0.8 });
        onSelect(n);
      });

      // ── CAPA MLS: listings del barrio seleccionado (Vista 2) ─────────────────
      map.addSource("listings-mls", {
        type: "geojson",
        data: EMPTY_FC,
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      });

      map.addLayer({
        id: "listings-mls-clusters",
        type: "circle",
        source: "listings-mls",
        filter: ["has", "point_count"],
        layout: { visibility: "none" },
        paint: {
          "circle-color": ["step", ["get", "point_count"], "#5DCAA5", 10, "#1D9E75", 50, "#085041"],
          "circle-radius": ["step", ["get", "point_count"], 20, 10, 30, 50, 40],
          "circle-opacity": 0.88,
          "circle-stroke-width": 2,
          "circle-stroke-color": "rgba(29,158,117,0.3)",
        },
      });

      map.addLayer({
        id: "listings-mls-cluster-count",
        type: "symbol",
        source: "listings-mls",
        filter: ["has", "point_count"],
        layout: {
          visibility: "none",
          "text-field": "{point_count_abbreviated}",
          "text-size": 12,
          "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
        },
        paint: { "text-color": "#ffffff" },
      });

      map.addLayer({
        id: "listings-mls-unclustered",
        type: "circle",
        source: "listings-mls",
        filter: ["!", ["has", "point_count"]],
        layout: { visibility: "none" },
        paint: {
          "circle-radius": [
            "case",
            ["boolean", ["feature-state", "highlighted"], false], 12,
            8,
          ],
          "circle-color": [
            "case",
            ["==", ["get", "buena_oferta"], true], "#10b981",
            ["==", ["get", "tipo_op"], "arriendo"], "#5DCAA5",
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

      // Click en cluster MLS → zoom in
      map.on("click", "listings-mls-clusters", (e) => {
        if (!e.features?.length) return;
        const clusterId = e.features[0].properties!.cluster_id as number;
        const center = (e.features[0].geometry as GeoJSON.Point).coordinates as [number, number];
        (map.getSource("listings-mls") as mapboxgl.GeoJSONSource).getClusterExpansionZoom(
          clusterId,
          (err, zoom) => { if (!err && zoom != null) map.easeTo({ center, zoom }); },
        );
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

      // ── Cargar datos iniciales ─────────────────────────────────────────────
      // Comunas GeoJSON: Medellín + municipality blocks for all other municipios
      Promise.all(
        COMUNAS_FILES.map((f) =>
          fetch(f)
            .then((r) => r.json())
            .catch(() => ({ type: "FeatureCollection", features: [] }))
        )
      ).then((results: { features: unknown[] }[]) => {
        if (!mapLoadedRef.current) return;
        const allFeatures = results.flatMap((fc) => fc.features ?? []);
        (map.getSource("comunas") as mapboxgl.GeoJSONSource)?.setData({
          type: "FeatureCollection",
          features: allFeatures,
        } as GeoJSON.FeatureCollection);
      });

      // Barrios (si ya cargaron antes de que el mapa estuviera listo)
      if (barriosRef.current.length > 0) {
        (map.getSource("barrios") as mapboxgl.GeoJSONSource).setData(
          barriosToGeoJSON(barriosRef.current, getActivePaletteId(riskRef.current), perfil, budgetRange, riskRef.current) as unknown as GeoJSON.FeatureCollection
        );
        if (mostrarOportunidades) addOpportunityMarkers(map);
      }

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

  // ── Actualizar datos de barrios cuando cambian ───────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current || !geoJsonData) return;
    (map.getSource("barrios") as mapboxgl.GeoJSONSource)?.setData(
      geoJsonData as unknown as GeoJSON.FeatureCollection
    );
    if (mostrarOportunidades && viewLevelRef.current === "barrios") {
      addOpportunityMarkers(map);
    } else {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
    }
  }, [geoJsonData, mostrarOportunidades]);

  // ── Actualizar capa comunas con datos de API (Medellín coloreado) ────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current || !comunasGeoJSON) return;
    const source = map.getSource("comunas") as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;
    // Fetch non-Medellín static files and merge with API Medellín features
    Promise.all(
      COMUNAS_FILES.filter((f) => !f.includes("medellin")).map((f) =>
        fetch(f)
          .then((r) => r.json())
          .catch(() => ({ type: "FeatureCollection", features: [] }))
      )
    ).then((results: { features: unknown[] }[]) => {
      const staticFeatures = results.flatMap((fc) => fc.features ?? []);
      source.setData({
        type: "FeatureCollection",
        features: [...comunasGeoJSON.features, ...staticFeatures],
      } as GeoJSON.FeatureCollection);
    });
  }, [comunasGeoJSON]);

  // ── Sync selección de barrio ─────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    map.removeFeatureState({ source: "barrios" });
    if (selectedId != null) {
      map.setFeatureState({ source: "barrios", id: selectedId }, { selected: true });
      const n = barriosRef.current.find((b) => b.barrio_id === selectedId);
      if (n) {
        const nb = barrioToNeighborhood(n);
        map.flyTo({ center: [nb.lng, nb.lat], zoom: 14.5, speed: 0.9 });
      }
    }
  }, [selectedId]);

  // ── Vista 1 ↔ Vista 2: toggle capas (solo depende de mapView) ──────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    const mlsLayers = ["listings-mls-clusters", "listings-mls-cluster-count", "listings-mls-unclustered"] as const;

    if (mapView === "listings") {
      for (const id of ["barrios-fill", "barrios-line", "barrios-label"] as const) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
      }
      for (const id of mlsLayers) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "visible");
      }
      map.setTerrain(null);
      map.easeTo({ pitch: 0, duration: 500 });

    } else {
      // Vista 1: ocultar MLS layers
      mlsLastFlyToRef.current = null;
      for (const id of mlsLayers) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
      }
      (map.getSource("listings-mls") as mapboxgl.GeoJSONSource)?.setData(EMPTY_FC);
      if (map.getSource("mapbox-dem")) {
        map.setTerrain({ source: "mapbox-dem", exaggeration: 1.5 });
      }
      // If we were in barrios view before entering MLS, restore it; otherwise go to comunas
      if (viewLevelRef.current === "barrios" && activeComunaRef.current) {
        const { cd, nombre, municipioFilter } = activeComunaRef.current;
        const filter: mapboxgl.FilterSpecification = municipioFilter
          ? ["==", ["get", "municipio"], municipioFilter]
          : ["==", ["get", "cd_comuna"], cd];
        map.setFilter("barrios-fill",  filter);
        map.setFilter("barrios-line",  filter);
        map.setFilter("barrios-label", filter);
        for (const id of ["barrios-fill", "barrios-line", "barrios-label"] as const) {
          if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "visible");
        }
        for (const id of ["comunas-fill", "comunas-line", "comunas-label"] as const) {
          if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
        }
        // Smooth zoom-out so the whole commune is visible
        map.easeTo({
          zoom: Math.max(map.getZoom() - 1.8, 11),
          pitch: 0,
          duration: 750,
          easing: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
        });
        onViewLevelChangeRef.current?.("barrios", nombre);
      } else {
        switchToComunas(map);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapView]);

  // ── Draw mode: custom polygon drawing (native mapbox-gl v3) ─────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current || !drawModeActive) return;

    const SRC   = "urbi-draw-preview";
    const FILL  = "urbi-draw-fill";
    const LINE  = "urbi-draw-line";
    const DOTS  = "urbi-draw-dots";

    const vertices: [number, number][] = [];

    if (!map.getSource(SRC)) {
      map.addSource(SRC, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: FILL, type: "fill",   source: SRC, filter: ["==", "$type", "Polygon"],    paint: { "fill-color": "#1D9E75", "fill-opacity": 0.15 } });
      map.addLayer({ id: LINE, type: "line",   source: SRC, filter: ["==", "$type", "LineString"], paint: { "line-color": "#1D9E75", "line-width": 2, "line-dasharray": [3, 2] } });
      map.addLayer({ id: DOTS, type: "circle", source: SRC, filter: ["==", "$type", "Point"],      paint: { "circle-radius": 5, "circle-color": "#1D9E75", "circle-stroke-width": 2, "circle-stroke-color": "#fff" } });
    }

    const setPreview = (mouse?: [number, number]) => {
      const src = map.getSource(SRC) as mapboxgl.GeoJSONSource;
      if (!src) return;
      const pts = mouse ? [...vertices, mouse] : vertices;
      const features: GeoJSON.Feature[] = vertices.map(v => ({ type: "Feature", geometry: { type: "Point", coordinates: v }, properties: {} }));
      if (pts.length >= 3) features.push({ type: "Feature", geometry: { type: "Polygon",    coordinates: [[...pts, pts[0]]] }, properties: {} });
      else if (pts.length === 2) features.push({ type: "Feature", geometry: { type: "LineString", coordinates: pts }, properties: {} });
      src.setData({ type: "FeatureCollection", features });
    };

    map.dragPan.disable();
    map.doubleClickZoom.disable();
    map.getCanvas().style.cursor = "crosshair";

    const onClick = (e: mapboxgl.MapMouseEvent) => {
      vertices.push([e.lngLat.lng, e.lngLat.lat]);
      setPreview();
    };
    const onDblClick = (e: mapboxgl.MapMouseEvent) => {
      e.preventDefault();
      vertices.pop(); // remove duplicate vertex from 2nd click of dblclick
      if (vertices.length < 3) return;
      onDrawPolygonRef.current?.({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [[...vertices, vertices[0]]] },
        properties: {},
      });
    };
    const onMouseMove = (e: mapboxgl.MapMouseEvent) => {
      if (vertices.length > 0) setPreview([e.lngLat.lng, e.lngLat.lat]);
    };

    map.on("click",     onClick);
    map.on("dblclick",  onDblClick);
    map.on("mousemove", onMouseMove);

    if (clearDrawRef) clearDrawRef.current = () => {
      (map.getSource(SRC) as mapboxgl.GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: [] });
    };

    return () => {
      map.off("click",     onClick);
      map.off("dblclick",  onDblClick);
      map.off("mousemove", onMouseMove);
      map.dragPan.enable();
      map.doubleClickZoom.enable();
      map.getCanvas().style.cursor = "";
      try {
        if (map.getLayer(FILL)) map.removeLayer(FILL);
        if (map.getLayer(LINE)) map.removeLayer(LINE);
        if (map.getLayer(DOTS)) map.removeLayer(DOTS);
        if (map.getSource(SRC)) map.removeSource(SRC);
      } catch { /* ignore if map already torn down */ }
      if (clearDrawRef) clearDrawRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawModeActive]);

  // ── Vista 2: actualizar datos GeoJSON cuando llegan listings ────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current || mapView !== "listings") return;

    const src = map.getSource("listings-mls") as mapboxgl.GeoJSONSource | undefined;
    if (src) {
      if (!mlsListings?.length) {
        src.setData(EMPTY_FC);
      } else {
        const features = mlsListings
          .filter((l) => l.lat != null && l.lon != null)
          .map((l) => ({
            type: "Feature" as const,
            id: l.id,
            geometry: { type: "Point" as const, coordinates: [l.lon!, l.lat!] },
            properties: {
              id: l.id,
              buena_oferta: l.buena_oferta ?? false,
              tipo_op: l.tipo_operacion ?? "venta",
              tipo_inmueble: l.tipo_inmueble ?? "",
              precio_cop: l.precio_cop ?? null,
              precio_usd: l.precio_usd ?? null,
              precio_m2: l.precio_m2 ?? null,
              precio_m2_mediana_barrio: l.precio_m2_mediana_barrio ?? null,
              area_m2: l.area_m2 ?? null,
              habitaciones: l.habitaciones ?? null,
              banos: l.banos ?? null,
              url: l.url ?? null,
              fuente: l.fuente ?? "",
              barrio_nombre: l.barrio_nombre ?? "",
              barrio_id: l.barrio_id ?? null,
              pct_bajo_mediana: l.pct_bajo_mediana ?? null,
            },
          }));
        src.setData({ type: "FeatureCollection", features } as unknown as GeoJSON.FeatureCollection);
      }
    }
    // FlyTo centroide del barrio solo la primera vez por barrio seleccionado
    if (mlsBarrioId != null && mlsLastFlyToRef.current !== mlsBarrioId) {
      mlsLastFlyToRef.current = mlsBarrioId;
      const barrio = barriosRef.current.find((b) => b.barrio_id === mlsBarrioId);
      if (barrio) {
        const nb = barrioToNeighborhood(barrio);
        map.flyTo({ center: [nb.lng, nb.lat], zoom: 14, pitch: 0, speed: 0.8 });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapView, mlsBarrioId, mlsListings]);

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

  return (
    <>
      <div ref={containerRef} className="absolute inset-0 z-0 min-h-screen" />
      <div className={`absolute bottom-10 left-4 z-10 flex items-center gap-1.5 rounded-full border border-white/10 bg-background/80 px-2.5 py-1 text-[10px] text-muted-foreground backdrop-blur-sm${perfil ? "" : " hidden"}`}>
        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
        <span>
          Personalizado para:{" "}
          <strong className="text-foreground">{_PERFIL_BADGE_LABEL[perfil ?? ""] ?? perfil}</strong>
          {risk && (
            <>
              <span className="mx-1 opacity-40">·</span>
              <strong className="text-foreground">{_RISK_BADGE_LABEL[risk] ?? risk}</strong>
            </>
          )}
        </span>
      </div>
    </>
  );
}
