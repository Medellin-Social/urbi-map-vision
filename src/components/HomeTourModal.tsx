import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, GraduationCap } from "lucide-react";
import { useLang } from "@/lib/i18n";

const LS_KEY = "home_tour_seen";
const PAD = 8; // spotlight ring padding around target rect
const FIND_TIMEOUT_MS = 2500;

type LocStr = { es: string; en: string };
type TourStep = {
  title: LocStr;
  body: LocStr;
  selector?: string; // CSS selector for the real element to spotlight — best-effort
  icon?: string;      // shown when there's no live target to point at
  mobileOnly?: boolean;
  desktopOnly?: boolean;
};

const ALL_STEPS: TourStep[] = [
  {
    title: { es: "Bienvenido a Medellín Social", en: "Welcome to Medellín Social" },
    body: {
      es: "Un recorrido rápido por el sitio: sus páginas, el mapa de inicio y cómo navegar tu barrio.",
      en: "A quick tour of the site: its pages, the home map, and how to navigate your barrio.",
    },
    icon: "🏠",
  },
  {
    title: { es: "Menú de navegación", en: "Navigation menu" },
    body: {
      es: "Desde aquí vas a Eventos, Negocios, Real Estate y Blog de tu barrio.",
      en: "From here you reach Events, Businesses, Real Estate and Blog for your barrio.",
    },
    selector: '[data-tour="nav-links"]',
    desktopOnly: true,
  },
  {
    title: { es: "Menú de navegación", en: "Navigation menu" },
    body: {
      es: "Toca el ☰ para ver Eventos, Negocios, Real Estate y Blog.",
      en: "Tap ☰ to see Events, Businesses, Real Estate and Blog.",
    },
    selector: '[data-tour="nav-hamburger"]',
    mobileOnly: true,
  },
  {
    title: { es: "Elige tu barrio", en: "Choose your barrio" },
    body: {
      es: "Este selector filtra toda la página — noticias, eventos y negocios — por el barrio que elijas.",
      en: "This selector filters the whole page — news, events and businesses — by the barrio you pick.",
    },
    selector: '[data-tour="barrio-select"]',
  },
  {
    title: { es: "El mapa de inicio", en: "The home map" },
    body: {
      es: "Haz click en el mapa para elegir entre ver Barrios (inmuebles) o Comunidad (eventos y negocios) de una zona.",
      en: "Click the map to choose between Barrios (real estate) or Community (events and businesses) for an area.",
    },
    selector: '[data-tour="home-hero-map"]',
  },
  {
    title: { es: "Trending en tu barrio", en: "Trending in your barrio" },
    body: {
      es: "Noticias y eventos destacados del barrio seleccionado, siempre a la vista.",
      en: "Top news and events for the selected barrio, always in view.",
    },
    selector: '[data-tour="home-trending"]',
  },
  {
    title: { es: "Lo último del barrio", en: "Latest from the barrio" },
    body: { es: "Noticias recientes de tu zona.", en: "Recent news from your area." },
    selector: '[data-tour="home-noticias"]',
  },
  {
    title: { es: "Qué hacer esta semana", en: "What to do this week" },
    body: { es: "La agenda de eventos de la semana en tu barrio.", en: "This week's event agenda for your barrio." },
    selector: '[data-tour="home-eventos-semana"]',
  },
  {
    title: { es: "Hotspots & Deals", en: "Hotspots & Deals" },
    body: { es: "Promociones exclusivas de negocios locales.", en: "Exclusive deals from local businesses." },
    selector: '[data-tour="home-deals"]',
  },
  {
    title: { es: "Directorio 5 Estrellas", en: "5-Star Directory" },
    body: { es: "Los negocios mejor calificados por categoría.", en: "The top-rated businesses by category." },
    selector: '[data-tour="home-directorio"]',
  },
  {
    title: { es: "Mapa de inversión", en: "Investment map" },
    body: {
      es: "Aquí entras al mapa completo de inmuebles, con filtros de precio, tipo y más — ese mapa tiene su propio tutorial.",
      en: "Here you enter the full real-estate map, with filters for price, type and more — that map has its own tutorial.",
    },
    selector: '[data-tour="home-realestate"]',
  },
  {
    title: { es: "¿Necesitas repasar esto?", en: "Need to review this?" },
    body: {
      es: "Puedes volver a ver esta guía cuando quieras con este botón.",
      en: "You can replay this guide anytime with this button.",
    },
    selector: '[data-tour="tour-replay-home"]',
  },
];

export function HomeTourModal({ isMobile }: { isMobile: boolean }) {
  const [step, setStep] = useState(0);
  const [show, setShow] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const { lang } = useLang();
  const tr = (o: LocStr) => (lang === "es" ? o.es : o.en);
  const tt = (es: string, en: string) => (lang === "es" ? es : en);

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
        aria-label={tt("Cerrar guía", "Close guide")}
        className="absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-full text-[#6B5B45] transition hover:bg-[#E8E0D0] hover:text-[#1A1208]"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="p-5 pb-4">
        <div className="h-1 w-full overflow-hidden rounded-full" style={{ background: "#E8E0D0" }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%`, background: "#1D9E75" }} />
        </div>

        <h2 data-i18n-skip className="mt-3 font-display text-lg font-semibold leading-tight text-[#1A1208]">{tr(s.title)}</h2>
        <p data-i18n-skip className="mt-1.5 text-sm text-[#6B5B45]">{tr(s.body)}</p>
        {s.icon && <div className="mt-3 text-center text-3xl">{s.icon}</div>}

        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={finish}
            className="text-xs font-medium text-[#6B5B45] transition hover:text-[#1A1208] hover:underline"
          >
            {tt("Saltar recorrido", "Skip tour")}
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep((n) => n - 1)}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-[#6B5B45] transition hover:bg-[#E8E0D0]"
              >
                {tt("Atrás", "Back")}
              </button>
            )}
            <button
              onClick={() => (isLast ? finish() : setStep((n) => n + 1))}
              className="rounded-lg px-4 py-1.5 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ background: "#1D9E75" }}
            >
              {isLast ? tt("Entendido", "Got it") : tt("Siguiente", "Next")}
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
        aria-label={tt("Tutorial del sitio", "Site tutorial")}
        data-tour="tour-replay-home"
        className="fixed z-[45] flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold shadow-md transition hover:opacity-90"
        style={{ bottom: 20, right: 20, background: "#FAF7F2", border: "1px solid #E8E0D0", color: "#1D9E75" }}
      >
        <GraduationCap size={14} />
        {tt("Tutorial del sitio", "Site tutorial")}
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
