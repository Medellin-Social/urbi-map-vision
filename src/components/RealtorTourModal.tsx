import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "@/lib/icons";
import { useLang } from "@/lib/i18n";

const LS_KEY = "realtor_tour_seen";
const PAD = 8; // spotlight ring padding around target rect
const FIND_TIMEOUT_MS = 2500;

type LocStr = { es: string; en: string };
type TourStep = { title: LocStr; body: LocStr; selector?: string; icon?: string };

// Recorrido corto a propósito: el panel aún está en construcción. Orienta por las
// 5 secciones del nav y el botón de repetir — sin entrar al detalle de cada dato.
const STEPS: TourStep[] = [
  {
    title: { es: "Tu centro de agente", en: "Your agent hub" },
    body: {
      es: "Un vistazo rápido al panel. Aquí viven tus leads, zonas, listings y la inteligencia de mercado.",
      en: "A quick look at the panel. Your leads, zones, listings and market intel all live here.",
    },
    icon: "📊",
  },
  {
    title: { es: "Las 5 secciones", en: "The 5 sections" },
    body: {
      es: "Inicio (resumen), Mis listings (tus inmuebles), Bandeja y agenda (leads y visitas), Mercado (precios e inteligencia) y Herramientas. Toca cada una para explorar.",
      en: "Home (overview), My listings (your properties), Inbox & calendar (leads and visits), Market (prices and intel) and Tools. Tap each to explore.",
    },
    selector: '[data-tour="realtor-sections"]',
  },
  {
    title: { es: "¿Repasar después?", en: "Review later?" },
    body: {
      es: "Con este botón vuelves a ver esta guía cuando quieras.",
      en: "This button replays this guide whenever you want.",
    },
    selector: '[data-tour="realtor-tour-replay"]',
  },
];

export function RealtorTourModal() {
  const [step, setStep] = useState(0);
  const [show, setShow] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const { lang } = useLang();
  const tr = (o: LocStr) => (lang === "es" ? o.es : o.en);
  const tt = (es: string, en: string) => (lang === "es" ? es : en);

  useEffect(() => {
    if (localStorage.getItem(LS_KEY) === "true") return;
    const t = setTimeout(() => setShow(true), 600);
    return () => clearTimeout(t);
  }, []);

  // El botón de replay vive en el header del panel — escucha su evento.
  useEffect(() => {
    const h = () => { setStep(0); setRect(null); setShow(true); };
    window.addEventListener("replay-tour", h);
    return () => window.removeEventListener("replay-tour", h);
  }, []);

  // Best-effort spotlight: poll for the target, scroll it into view, keep tracking.
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
          el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
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
    try { localStorage.setItem(LS_KEY, "true"); } catch { /* storage blocked */ }
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
      style={{ background: "#FAF8F3", border: "1px solid #E5E0D5" }}
    >
      <button
        onClick={finish}
        aria-label={tt("Cerrar guía", "Close guide")}
        className="absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-full text-[#5B5F5C] transition hover:bg-[#E5E0D5] hover:text-[#111418]"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="p-5 pb-4">
        <div className="h-1 w-full overflow-hidden rounded-full" style={{ background: "#E5E0D5" }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%`, background: "#0F8A4F" }} />
        </div>

        <h2 data-i18n-skip className="mt-3 font-display text-lg font-semibold leading-tight text-[#111418]">{tr(s.title)}</h2>
        <p data-i18n-skip className="mt-1.5 text-sm text-[#5B5F5C]">{tr(s.body)}</p>
        {s.icon && <div className="mt-3 text-center text-3xl">{s.icon}</div>}

        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={finish}
            className="text-xs font-medium text-[#5B5F5C] transition hover:text-[#111418] hover:underline"
          >
            {tt("Saltar recorrido", "Skip tour")}
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep((n) => n - 1)}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-[#5B5F5C] transition hover:bg-[#E5E0D5]"
              >
                {tt("Atrás", "Back")}
              </button>
            )}
            <button
              onClick={() => (isLast ? finish() : setStep((n) => n + 1))}
              className="rounded-lg px-4 py-1.5 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ background: "#0F8A4F" }}
            >
              {isLast ? tt("Entendido", "Got it") : tt("Siguiente", "Next")}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );

  return (
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
  );
}
