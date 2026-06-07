import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Link } from "@tanstack/react-router";
import { MAPBOX_TOKEN } from "@/lib/mapboxToken";
import { ArrowDown, X } from "lucide-react";
import { BarrioChoiceModal } from "@/components/BarrioChoiceModal";

// Urbi palette thresholds [70, 50, 30] — mirrors mapColors.ts
function scoreToColor(score: number | null | undefined): string {
  if (score == null) return "#1D9E75";
  if (score >= 70) return "#10b981";
  if (score >= 50) return "#2BBAA5";
  if (score >= 30) return "#f59e0b";
  return "#ef4444";
}

type BarrioStat = {
  nombre: string;
  municipio: string;
  score_corto: number | null;
};

type ClickedBarrio = { nombre: string; municipio: string };

export function LandingMapHeader({
  flyToRef,
  hideOverlay = false,
}: {
  flyToRef?: React.MutableRefObject<((lat: number, lon: number, zoom?: number) => void) | null>
  hideOverlay?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const hoveredIdRef = useRef<number | string | undefined>(undefined);

  const [clicked, setClicked] = useState<ClickedBarrio | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [tooltip, setTooltip] = useState<{ nombre: string; municipio: string; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [-75.5812, 6.2442],
      zoom: 12,
      pitch: 55,
      bearing: -30,
      interactive: true,
      attributionControl: false,
    });

    mapRef.current = map;

    // ── Cinematic rotation ──────────────────────────────────────────────────
    let bearing = -30;
    let animationId = 0;
    let lastTs = 0;
    let resumeTimeout: ReturnType<typeof setTimeout> | undefined;
    const DEG_PER_SEC = 4.5; // full rotation in ~80 s

    function rotateMap(ts: number) {
      if (map.isEasing()) {
        // flyTo / easeTo in progress — skip bearing update, check next frame
        lastTs = 0;
        animationId = requestAnimationFrame(rotateMap);
        return;
      }
      if (lastTs) {
        bearing += ((ts - lastTs) / 1000) * DEG_PER_SEC;
        map.setBearing(bearing);
      }
      lastTs = ts;
      animationId = requestAnimationFrame(rotateMap);
    }

    function stopRotation() {
      cancelAnimationFrame(animationId);
      lastTs = 0;
      clearTimeout(resumeTimeout);
    }

    function scheduleResume() {
      clearTimeout(resumeTimeout);
      resumeTimeout = setTimeout(() => requestAnimationFrame(rotateMap), 3000);
    }

    // Stop when user scrolls away
    const onScroll = () => stopRotation();
    window.addEventListener("scroll", onScroll, { passive: true });

    // Pause on any map interaction, resume 3 s after release
    map.on("mousedown", stopRotation);
    map.on("touchstart", stopRotation);
    map.on("mouseup", scheduleResume);
    map.on("touchend", scheduleResume);
    // ───────────────────────────────────────────────────────────────────────

    map.on("load", async () => {
      // Terrain DEM for 3D mountain relief
      map.addSource("mapbox-dem", {
        type: "raster-dem",
        url: "mapbox://mapbox.mapbox-terrain-dem-v1",
        tileSize: 512,
        maxzoom: 14,
      });
      map.setTerrain({ source: "mapbox-dem", exaggeration: 0.8 });

      try {
        const [valleRes, medellinRes, statsRes] = await Promise.all([
          fetch("/data/barrios_valle_aburra.geojson"),
          fetch("/data/barrios_medellin.geojson"),
          fetch("/data/barrios_stats.json"),
        ]);

        const [valleFC, medellinFC, stats]: [
          GeoJSON.FeatureCollection,
          GeoJSON.FeatureCollection,
          BarrioStat[],
        ] = await Promise.all([valleRes.json(), medellinRes.json(), statsRes.json()]);

        // Lookup: "NOMBRE__MUNICIPIO" → color_hex
        const colorMap = new Map<string, string>();
        for (const s of stats) {
          colorMap.set(
            `${s.nombre.toUpperCase()}__${s.municipio.toUpperCase()}`,
            scoreToColor(s.score_corto),
          );
        }

        // Merge both GeoJSONs, deduplicate by nombre+municipio
        const seen = new Set<string>();
        const features: GeoJSON.Feature[] = [];

        for (const f of [...(valleFC.features ?? []), ...(medellinFC.features ?? [])]) {
          const nombre = (f.properties?.nombre ?? "").toString().toUpperCase();
          const municipio = (f.properties?.municipio ?? "").toString().toUpperCase();
          const dedupeKey = `${nombre}__${municipio}`;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);

          const color = colorMap.get(dedupeKey) ?? "#1D9E75";
          const hasData = colorMap.has(dedupeKey) ? 1 : 0;

          features.push({
            ...f,
            properties: { ...f.properties, color_hex: color, has_data: hasData },
          });
        }

        const geojson: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };

        map.addSource("barrios-landing", {
          type: "geojson",
          data: geojson,
          generateId: true,
        });

        // Fill
        map.addLayer({
          id: "barrios-landing-fill",
          type: "fill",
          source: "barrios-landing",
          paint: {
            "fill-color": ["get", "color_hex"],
            "fill-opacity": [
              "case",
              ["boolean", ["feature-state", "hover"], false], 0.88,
              ["==", ["get", "has_data"], 1], 0.62,
              0.15,
            ],
          },
        });

        // Outline
        map.addLayer({
          id: "barrios-landing-outline",
          type: "line",
          source: "barrios-landing",
          paint: {
            "line-color": [
              "case",
              ["boolean", ["feature-state", "hover"], false], "#ffffff",
              "#000000",
            ],
            "line-width": [
              "case",
              ["boolean", ["feature-state", "hover"], false], 1.5,
              0.3,
            ],
            "line-opacity": [
              "case",
              ["boolean", ["feature-state", "hover"], false], 0.9,
              0.45,
            ],
          },
        });

        // Start rotation once barrios are fully rendered
        map.once("idle", () => requestAnimationFrame(rotateMap));
      } catch (err) {
        console.error("[LandingMapHeader] failed to load data", err);
      }
    });

    // Hover
    map.on("mousemove", "barrios-landing-fill", (e) => {
      if (!e.features?.length) return;
      const f = e.features[0];

      if (hoveredIdRef.current !== undefined) {
        map.setFeatureState(
          { source: "barrios-landing", id: hoveredIdRef.current },
          { hover: false },
        );
      }
      hoveredIdRef.current = f.id as number | string;
      map.setFeatureState(
        { source: "barrios-landing", id: hoveredIdRef.current },
        { hover: true },
      );

      const rect = containerRef.current?.getBoundingClientRect();
      const x = e.point.x;
      const y = e.point.y;
      const tooltipW = 160;
      const clampedX = Math.min(x + 12, (rect?.width ?? 9999) - tooltipW - 8);

      setTooltip({
        nombre: f.properties?.nombre ?? "",
        municipio: f.properties?.municipio ?? "",
        x: clampedX,
        y: Math.max(8, y - 52),
      });
      map.getCanvas().style.cursor = "pointer";
    });

    map.on("mouseleave", "barrios-landing-fill", () => {
      if (hoveredIdRef.current !== undefined) {
        map.setFeatureState(
          { source: "barrios-landing", id: hoveredIdRef.current },
          { hover: false },
        );
      }
      hoveredIdRef.current = undefined;
      setTooltip(null);
      map.getCanvas().style.cursor = "";
    });

    map.on("click", "barrios-landing-fill", (e) => {
      if (!e.features?.length) return;
      const f = e.features[0];
      setClicked({
        nombre: f.properties?.nombre ?? "este barrio",
        municipio: f.properties?.municipio ?? "",
      });
    });

    if (flyToRef) {
      flyToRef.current = (lat, lon, zoom = 13) => {
        stopRotation();
        map.stop();
        map.flyTo({ center: [lon, lat], zoom, pitch: 50, duration: 1800, essential: true });
        map.once('moveend', scheduleResume);
      };
    }

    return () => {
      if (flyToRef) flyToRef.current = null;
      stopRotation();
      window.removeEventListener("scroll", onScroll);
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* Map wrapper — 40vh on mobile, 55vh on sm+ */}
      <div
        className="landing-map-wrapper relative w-full overflow-hidden"
        style={{ height: "60vh", minHeight: "320px" }}
      >
        {/* Mapbox container */}
        <div ref={containerRef} className="absolute inset-0" />

        {/* Bottom fade into page background */}
        {!hideOverlay && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-10"
            style={{
              height: "130px",
              background: "linear-gradient(to bottom, transparent, #0a0e1a)",
            }}
          />
        )}

        {/* Text overlay — top center */}
        <div className={`pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col items-center pt-10 text-center${hideOverlay ? ' hidden' : ''}`}>
          <h1
            className="font-display text-2xl font-bold text-white sm:text-4xl lg:text-5xl xl:text-6xl"
            style={{
              textShadow: "0 2px 28px rgba(0,0,0,0.9), 0 0 80px rgba(0,0,0,0.7)",
            }}
          >
            Bienvenido al Valle de Aburrá
          </h1>
          <p
            className="mt-2 text-sm font-medium text-white/75 sm:text-base lg:text-lg"
            style={{ textShadow: "0 2px 14px rgba(0,0,0,0.95)" }}
          >
            Medellín y comunidades cercanas
          </p>
        </div>

        {/* Legend — bottom right */}
        {!hideOverlay && <div className="absolute bottom-[54px] right-3 z-20 hidden rounded-lg border border-white/15 bg-black/65 px-3 py-2 text-[11px] text-white backdrop-blur-sm sm:block">
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#10b981]" />
              Alto potencial
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#2BBAA5]" />
              Bueno
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#f59e0b]" />
              Moderado
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#ef4444]" />
              Bajo
            </span>
          </div>
        </div>}

        {/* Badge — bottom left */}
        {!hideOverlay && (
          <div className="absolute bottom-[54px] left-3 z-20 hidden rounded-full border border-white/15 bg-black/65 px-3 py-1.5 text-[11px] font-medium text-white/80 backdrop-blur-sm sm:flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            488 barrios analizados · Datos en vivo
          </div>
        )}

        {/* Scroll indicator — bottom center */}
        {!hideOverlay && (
          <div className="pointer-events-none absolute bottom-6 inset-x-0 z-20 flex flex-col items-center gap-0.5">
            <span
              className="text-[10px] font-semibold uppercase tracking-widest text-white/45"
              style={{ textShadow: "0 1px 6px rgba(0,0,0,0.9)" }}
            >
              Desplaza para explorar
            </span>
            <ArrowDown className="h-3.5 w-3.5 animate-bounce text-white/40" />
          </div>
        )}

        {/* Hover tooltip */}
        {tooltip && (
          <div
            className="pointer-events-none absolute z-30 rounded-lg border border-white/20 bg-black/85 px-3 py-1.5 text-xs text-white shadow-xl backdrop-blur-sm"
            style={{ left: tooltip.x, top: tooltip.y, minWidth: "120px" }}
          >
            <div className="font-semibold leading-tight">{tooltip.nombre}</div>
            <div className="mt-0.5 text-white/55">{tooltip.municipio}</div>
          </div>
        )}

        {/* Choice modal */}
        {!hideOverlay && clicked && !showPaywall && (
          <BarrioChoiceModal
            barrio={clicked}
            onClose={() => setClicked(null)}
            onComunidad={() => {
              const slug = clicked.nombre
                .toLowerCase()
                .normalize("NFD")
                .replace(/[̀-ͯ]/g, "")
                .replace(/\s+/g, "-");
              window.location.href = `/${slug}`;
            }}
            onInversiones={() => setShowPaywall(true)}
          />
        )}

        {/* Paywall modal */}
        {!hideOverlay && clicked && showPaywall && (
          <div
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => { setClicked(null); setShowPaywall(false); }}
          >
            <div
              className="relative mx-4 w-full max-w-sm rounded-2xl border border-white/20 bg-[#0d1117] p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="absolute right-3 top-3 rounded-md p-1 text-white/40 transition hover:text-white"
                onClick={() => { setClicked(null); setShowPaywall(false); }}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="text-[10px] font-bold uppercase tracking-widest text-primary">
                {clicked.municipio}
              </div>
              <h3 className="mt-1 font-display text-xl font-bold text-white">
                {clicked.nombre
                  .toLowerCase()
                  .split(" ")
                  .map((w) => w[0]?.toUpperCase() + w.slice(1))
                  .join(" ")}
              </h3>
              <p className="mt-1 text-sm text-white/50">Datos de inversión completos</p>

              <div className="mt-4 space-y-2">
                {[
                  "Precio/m² y arriendo real",
                  "Yield Airbnb con datos reales",
                  "Score de inversión personalizado",
                  "Conexión con agentes certificados",
                  "Simulador de retorno",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2 text-sm text-white/80">
                    <span className="text-[#1D9E75]">✅</span>
                    {item}
                  </div>
                ))}
              </div>

              <div className="mt-5 flex flex-col gap-2">
                <Link
                  to="/register"
                  className="flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 glow-cyan"
                  onClick={() => { setClicked(null); setShowPaywall(false); }}
                >
                  Crear cuenta — Gratis →
                </Link>
                <Link
                  to="/login"
                  className="flex items-center justify-center rounded-lg border border-white/20 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/5"
                  onClick={() => { setClicked(null); setShowPaywall(false); }}
                >
                  Ya tengo cuenta — Iniciar sesión
                </Link>
              </div>

              <p className="mt-4 text-center text-[11px] text-white/30">
                Acceso gratuito incluye perfil básico. Datos premium desde $5 USD/mes
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
