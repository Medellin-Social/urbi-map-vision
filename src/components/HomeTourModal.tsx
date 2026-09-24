import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, GraduationCap } from "lucide-react";

const LS_KEY = "home_tour_seen";
const PAD = 8; // spotlight ring padding around target rect
const FIND_TIMEOUT_MS = 2500;

type TourStep = {
  title: string;
  body: string;
  selector?: string; // CSS selector for the real element to spotlight — best-effort
  icon?: string;      // shown when there's no live target to point at
  mobileOnly?: boolean;
  desktopOnly?: boolean;
};

const ALL_STEPS: TourStep[] = [
  {
    title: "Bienvenido a Medellín Social",
    body: "Un recorrido rápido por el sitio: sus páginas, el mapa de inicio y cómo navegar tu barrio.",
    icon: "🏠",
  },
  {
    title: "Menú de navegación",
    body: "Desde aquí vas a Eventos, Negocios, Real Estate y Blog de tu barrio.",
    selector: '[data-tour="nav-links"]',
    desktopOnly: true,
  },
  {
    title: "Menú de navegación",
    body: "Toca el ☰ para ver Eventos, Negocios, Real Estate y Blog.",
    selector: '[data-tour="nav-hamburger"]',
    mobileOnly: true,
  },
  {
    title: "Elige tu barrio",
    body: "Este selector filtra toda la página — noticias, eventos y negocios — por el barrio que elijas.",
    selector: '[data-tour="barrio-select"]',
  },
  {
    title: "El mapa de inicio",
    body: "Haz click en el mapa para elegir entre ver Barrios (inmuebles) o Comunidad (eventos y negocios) de una zona.",
    selector: '[data-tour="home-hero-map"]',
  },
  {
    title: "Trending en tu barrio",
    body: "Noticias y eventos destacados del barrio seleccionado, siempre a la vista.",
    selector: '[data-tour="home-trending"]',
  },
  {
    title: "Lo último del barrio",
    body: "Noticias recientes de tu zona.",
    selector: '[data-tour="home-noticias"]',
  },
  {
    title: "Qué hacer esta semana",
    body: "La agenda de eventos de la semana en tu barrio.",
    selector: '[data-tour="home-eventos-semana"]',
  },
  {
    title: "Hotspots & Deals",
    body: "Promociones exclusivas de negocios locales.",
    selector: '[data-tour="home-deals"]',
  },
  {
    title: "Directorio 5 Estrellas",
    body: "Los negocios mejor calificados por categoría.",
    selector: '[data-tour="home-directorio"]',
  },
  {
    title: "Mapa de inversión",
    body: "Aquí entras al mapa completo de inmuebles, con filtros de precio, tipo y más — ese mapa tiene su propio tutorial.",
    selector: '[data-tour="home-realestate"]',
  },
  {
    title: "¿Necesitas repasar esto?",
    body: "Puedes volver a ver esta guía cuando quieras con este botón.",
    selector: '[data-tour="tour-replay-home"]',
  },
];

export function HomeTourModal({ isMobile }: { isMobile: boolean }) {
  const [step, setStep] = useState(0);
  const [show, setShow] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const STEPS = ALL_STEPS.filter((s) => (!s.mobileOnly || isMobile) && (!s.desktopOnly || !isMobile));

  useEffect(() => {
    if (localStorage.getItem(LS_KEY) === "true") return;
    const t = setTimeout(() => setShow(true), 600);
    return () => clearTimeout(t);
  }, []);

  // Best-effort spotlight: poll for the target, scroll it into view once found,
  // then keep tracking its rect (it moves while the page scrolls).
  useEffect(() => {
    if (!show) return;
    const selector = STEPS[step]?.selector;
    if (!selector) { setRect(null); return; }
    let raf = 0;
    let cancelled = false;
    let scrolled = false;
    const start = performance.now();
    const tick = () => {
      if (cancelled) return;
      const el = document.querySelector(selector);
      if (el) {
        if (!scrolled) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          scrolled = true;
        }
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
      style={{ background: "#FAF7F2", border: "1px solid #E8E0D0" }}
    >
      <button
        onClick={finish}
        aria-label="Cerrar guía"
        className="absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-full text-[#6B5B45] transition hover:bg-[#E8E0D0] hover:text-[#1A1208]"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="p-5 pb-4">
        <div className="h-1 w-full overflow-hidden rounded-full" style={{ background: "#E8E0D0" }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%`, background: "#1D9E75" }} />
        </div>

        <h2 className="mt-3 font-display text-lg font-semibold leading-tight text-[#1A1208]">{s.title}</h2>
        <p className="mt-1.5 text-sm text-[#6B5B45]">{s.body}</p>
        {s.icon && <div className="mt-3 text-center text-3xl">{s.icon}</div>}

        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={finish}
            className="text-xs font-medium text-[#6B5B45] transition hover:text-[#1A1208] hover:underline"
          >
            Saltar recorrido
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep((n) => n - 1)}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-[#6B5B45] transition hover:bg-[#E8E0D0]"
              >
                Atrás
              </button>
            )}
            <button
              onClick={() => (isLast ? finish() : setStep((n) => n + 1))}
              className="rounded-lg px-4 py-1.5 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ background: "#1D9E75" }}
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
        aria-label="Tutorial del sitio"
        data-tour="tour-replay-home"
        className="fixed z-[45] flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold shadow-md transition hover:opacity-90"
        style={{ bottom: 20, right: 20, background: "#FAF7F2", border: "1px solid #E8E0D0", color: "#1D9E75" }}
      >
        <GraduationCap size={14} />
        Tutorial del sitio
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
                  borderColor: "#1D9E75",
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
