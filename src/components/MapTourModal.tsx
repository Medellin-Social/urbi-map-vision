import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, GraduationCap } from "@/lib/icons";
import { SCORE_PALETTES } from "@/config/mapColors";

const LS_KEY = "map_tour_seen";
const PAD = 8; // spotlight ring padding around target rect
const FIND_TIMEOUT_MS = 2500;

type TourStep = {
  title: string;
  body: string;
  selector?: string; // CSS selector for the real element to spotlight — best-effort
  autoClickSelector?: string | string[]; // clicked once when found (in order), to drive the app into the state `selector` spotlights
  icon?: string;      // shown when there's no live target to point at
  onEnter?: () => void;
  mobileOnly?: boolean; // step only makes sense with the mobile map/list toggle
};

const palette = SCORE_PALETTES.urbi;

type Props = {
  isMobile: boolean;
  dataReady: boolean;
  activeComunaName: string | null;
  onSelectLaureles: () => void;
  onShowMobileList: () => void;
  onShowMobileMap: () => void;
  onDemoZoom: () => void;
  onZoomToBarrio: () => void;
  onCloseListingDetail: () => void;
  onBackToComunas: () => void;
  onCancelBackToComunas: () => void;
};

export function MapTourModal({ isMobile, dataReady, activeComunaName, onSelectLaureles, onShowMobileList, onShowMobileMap, onDemoZoom, onZoomToBarrio, onCloseListingDetail, onBackToComunas, onCancelBackToComunas }: Props) {
  const [step, setStep] = useState(0);
  const [show, setShow] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const ALL_STEPS: TourStep[] = [
    {
      title: "Así funciona el mapa",
      body: "Un recorrido rápido para que conozcas cada parte del mapa.",
      icon: "🗺️",
    },
    {
      title: "Comunas y barrios",
      body: "Mira: puedes hacer zoom en cualquier parte del mapa para ver el detalle por barrio, y alejarlo para volver a la vista general por comunas.",
      onEnter: onDemoZoom,
    },
    {
      title: "Elige una zona",
      body: `Seleccionamos ${activeComunaName ?? "una comuna"} como ejemplo. Puedes hacer click en cualquier comuna del mapa para explorarla.`,
      onEnter: onSelectLaureles,
    },
    {
      title: "Filtra tu búsqueda",
      body: "Usa la barra de filtros para precio, habitaciones, tipo de inmueble y más.",
      selector: '[data-tour="filters"]',
    },
    {
      title: "Comprar o arrendar",
      body: "Cambia entre estas dos pestañas según lo que estés buscando.",
      selector: '[data-tour="tabs-comprar-arrendar"]',
    },
    {
      title: "Inmuebles en el mapa",
      body: "Aquí aparecen los inmuebles disponibles según los filtros que apliques.",
      selector: '[data-tour="map-canvas"]',
    },
    {
      title: "Ver la lista",
      body: "Toca este botón para ver todos los inmuebles en una lista.",
      selector: '[data-tour="mobile-toggle-view"]',
      // Por si se vuelve aquí desde el paso siguiente, que ya la dejó en modo lista.
      onEnter: onShowMobileMap,
      mobileOnly: true,
    },
    {
      title: "Lista de inmuebles",
      body: isMobile
        ? "Aquí puedes ver todos los inmuebles disponibles. Se filtran igual que en el mapa."
        : "En esta lista ves todos los inmuebles disponibles — también se filtra igual que el mapa.",
      selector: '[data-tour="listing-panel"]',
      onEnter: () => { if (isMobile) onShowMobileList(); },
    },
    {
      title: "Volver al mapa",
      body: "Toca aquí para volver al mapa.",
      selector: '[data-tour="mobile-toggle-view"]',
      // Por si se vuelve aquí desde un paso posterior, reabre la lista para
      // que el botón muestre de nuevo el estado "Mapa".
      onEnter: onShowMobileList,
      mobileOnly: true,
    },
    {
      title: "Acércate a un barrio",
      body: "Al hacer zoom dentro de una comuna, aparecen los inmuebles individuales en el mapa.",
      selector: '[data-tour="map-canvas"]',
      // El paso anterior solo mostraba el botón — el click real (volver al
      // mapa) ocurre acá, igual que el patrón de "volver a comunas".
      onEnter: () => { onShowMobileMap(); onZoomToBarrio(); },
    },
    {
      title: "Colores por tipo de inmueble",
      body: "Este recuadro muestra qué representa cada color. Dale click para ver el detalle.",
      selector: '[data-tour="legend"]',
    },
    {
      title: "Resumen rápido",
      body: "Si te genera curiosidad un inmueble, dale click y verás un resumen con lo esencial.",
      // Vuelve del paso siguiente (drawer abierto) al cerrarlo, y en móvil
      // reabre la lista (el paso "Acércate a un barrio" la había cerrado)
      // así el autoClick de abajo tiene el card visible para reabrir el popup.
      onEnter: () => { onShowMobileList(); onCloseListingDetail(); },
      autoClickSelector: '[data-tour="listing-card"]',
      selector: '[data-tour="listing-popup"]',
    },
    {
      title: "Toda la información",
      body: "Al expandir el resumen se abre esta ventana con todos los detalles del inmueble.",
      // Encadenado: reabre el popup (por si se volvió aquí desde un paso
      // posterior que lo cerró) y luego expande al drawer.
      autoClickSelector: ['[data-tour="listing-card"]', '[data-tour="listing-popup-viewmore"]'],
      selector: '[data-tour="listing-drawer"]',
    },
    {
      title: "Volver a comunas",
      body: "Este botón, junto a la lista, te regresa a la vista general de comunas.",
      selector: '[data-tour="breadcrumb-back"]',
      // Repone la comuna + lista (en móvil este botón vive en el panel de
      // lista) + cierra el drawer, por si se volvió aquí desde el paso
      // siguiente (que ya limpió todo el mapa).
      onEnter: () => { onSelectLaureles(); onShowMobileList(); onCloseListingDetail(); },
    },
    {
      title: "Buscar en todo el Valle",
      body: "Si aplicas filtros sin elegir una zona antes, este botón busca en todo el Valle de Aburrá.",
      icon: "🔎",
      // Simula el click del paso anterior: zoom-out lento y mapa limpio, como al empezar.
      onEnter: onBackToComunas,
    },
    {
      title: "¿Necesitas repasar esto?",
      body: "Puedes volver a ver esta guía cuando quieras con este botón.",
      selector: '[data-tour="tour-replay"]',
    },
  ];

  const STEPS = ALL_STEPS.filter((s) => !s.mobileOnly || isMobile);

  // First-time gate: wait for real data (barrios) instead of a blind timer,
  // so step 2's auto-select doesn't fire against an empty dataset.
  useEffect(() => {
    if (localStorage.getItem(LS_KEY) === "true") return;
    if (!dataReady) return;
    const t = setTimeout(() => setShow(true), 400);
    return () => clearTimeout(t);
  }, [dataReady]);

  // Drive the app state each step expects (e.g. select Laureles, open mobile list).
  // Cancela primero cualquier reset diferido (el de "volver a comunas") — si
  // el usuario ya navegó a otro paso, ese timer quedaría huérfano y pisaría
  // el estado que este paso está por armar.
  useEffect(() => {
    if (!show) return;
    onCancelBackToComunas();
    STEPS[step]?.onEnter?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, show]);

  // Drive the app into the state this step wants to show — click the element
  // once it mounts (e.g. open a listing card's popup, then its "ver más").
  useEffect(() => {
    if (!show) return;
    const raw = STEPS[step]?.autoClickSelector;
    if (!raw) return;
    const selectors = Array.isArray(raw) ? raw : [raw];
    let raf = 0;
    let cancelled = false;
    const tick = (i: number, start: number) => {
      if (cancelled || i >= selectors.length) return;
      const el = document.querySelector<HTMLElement>(selectors[i]);
      if (el) {
        el.click();
        if (i + 1 < selectors.length) raf = requestAnimationFrame(() => tick(i + 1, performance.now()));
        return;
      }
      if (performance.now() - start < FIND_TIMEOUT_MS) raf = requestAnimationFrame(() => tick(i, start));
    };
    tick(0, performance.now());
    return () => { cancelled = true; cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, show]);

  // Best-effort spotlight: poll for the target (it mounts a render or two after
  // onEnter, sometimes after an async fetch) and keep tracking it while animating.
  useEffect(() => {
    if (!show) return;
    const selector = STEPS[step]?.selector;
    if (!selector) { setRect(null); return; }
    let raf = 0;
    let cancelled = false;
    const start = performance.now();
    const tick = () => {
      if (cancelled) return;
      const el = document.querySelector(selector);
      if (el) {
        setRect(el.getBoundingClientRect());
        raf = requestAnimationFrame(tick);
      } else if (performance.now() - start < FIND_TIMEOUT_MS) {
        raf = requestAnimationFrame(tick);
      } else {
        setRect(null); // gave up — fall back to a centered tooltip
      }
    };
    tick();
    return () => { cancelled = true; cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, show]);

  const finish = () => {
    setShow(false);
    setRect(null);
    localStorage.setItem(LS_KEY, "true");
  };

  const replay = () => {
    setStep(0);
    setRect(null);
    setShow(true);
  };

  const s = STEPS[step];
  const isLast = step === STEPS.length - 1;

  // Wrapper positions the tooltip (plain div, no transform) so Framer Motion's
  // own scale/opacity transform on the card never collides with a centering one.
  const wrapperStyle: React.CSSProperties = rect
    ? {
        position: "fixed",
        left: Math.min(Math.max(rect.left, 16), window.innerWidth - 336),
        top: rect.bottom + PAD * 2 + 12 < window.innerHeight - 160
          ? rect.bottom + PAD * 2 + 12
          : Math.max(rect.top - 12 - 220, 16),
      }
    : {
        position: "fixed", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
      };

  const card = (
    <motion.div
      ref={tooltipRef}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="pointer-events-auto w-[320px] max-w-[92vw] rounded-2xl shadow-2xl"
      style={{ background: "#FAF8F3", border: "1px solid #E5E0D5" }}
    >
      <button
        onClick={finish}
        aria-label="Cerrar guía"
        className="absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-full text-[#5B5F5C] transition hover:bg-[#E5E0D5] hover:text-[#111418]"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="p-5 pb-4">
        <div className="h-1 w-full overflow-hidden rounded-full" style={{ background: "#E5E0D5" }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%`, background: palette.alto }} />
        </div>

        <h2 className="mt-3 font-display text-lg font-semibold leading-tight text-[#111418]">{s.title}</h2>
        <p className="mt-1.5 text-sm text-[#5B5F5C]">{s.body}</p>
        {s.icon && <div className="mt-3 text-center text-3xl">{s.icon}</div>}

        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={finish}
            className="text-xs font-medium text-[#5B5F5C] transition hover:text-[#111418] hover:underline"
          >
            Saltar recorrido
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep((n) => n - 1)}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-[#5B5F5C] transition hover:bg-[#E5E0D5]"
              >
                Atrás
              </button>
            )}
            <button
              onClick={() => (isLast ? finish() : setStep((n) => n + 1))}
              className="rounded-lg px-4 py-1.5 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ background: "#0F8A4F" }}
            >
              {isLast ? "Entendido" : "Siguiente"}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );

  return (
    <>
      <button
        onClick={replay}
        aria-label="Tutorial de la página"
        data-tour="tour-replay"
        className="fixed z-[45] flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold shadow-md transition hover:opacity-90"
        // En móvil left:16 choca con el botón "volver a comunas" (mismo lugar) — a la derecha en móvil.
        style={isMobile
          ? { top: "calc(var(--map-header-h, 53px) + 56px)", right: 16, background: "#FAF8F3", border: "1px solid #E5E0D5", color: "#0F8A4F" }
          : { top: "calc(var(--map-header-h, 53px) + 56px)", left: 16, background: "#FAF8F3", border: "1px solid #E5E0D5", color: "#0F8A4F" }}
      >
        <GraduationCap size={14} />
        Tutorial de la página
      </button>

      <AnimatePresence>
        {show && (
          <>
            {rect ? (
              <div
                className="pointer-events-none fixed z-[9998] rounded-xl border-2"
                style={{
                  left: rect.left - PAD, top: rect.top - PAD,
                  width: rect.width + PAD * 2, height: rect.height + PAD * 2,
                  borderColor: "#0F8A4F",
                  boxShadow: "0 0 0 9999px rgba(20,18,8,0.55)",
                  transition: "left .2s ease, top .2s ease, width .2s ease, height .2s ease",
                }}
              />
            ) : (
              <div className="pointer-events-none fixed inset-0 z-[9998]" style={{ background: "rgba(20,18,8,0.45)" }} />
            )}

            <div className="pointer-events-none fixed z-[9999]" style={wrapperStyle}>
              {card}
            </div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
