import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "@/lib/icons";
import { useLang } from "@/lib/i18n";

// Motor genérico de tour con spotlight. Lo usan RealtorTourModal (dashboard) y
// AgentesTourModal (directorio público). Cada paso resalta un elemento y explica
// qué es; la página se mueve sola. Nada específico de una página vive aquí.
const PAD = 8; // padding del anillo del spotlight alrededor del rect objetivo
const FIND_TIMEOUT_MS = 2500;

export type LocStr = { es: string; en: string };
// selector      = elemento que ilumina el spotlight.
// clickSelector = elemento que el tour clickea al entrar (p.ej. una sub-pestaña,
//                 para cambiar el contenido que luego ilumina `selector`). Puede
//                 ser el mismo que `selector` o distinto.
// section       = (opcional) se pasa a onSection al entrar al paso (cambia de
//                 sección antes de buscar el selector).
export type TourStep = { title: LocStr; body: LocStr; selector?: string; icon?: string; section?: string; clickSelector?: string };

export function SpotlightTour({
  steps,
  storageKey,
  onSection,
  replayEvent = "replay-tour",
}: {
  steps: TourStep[];
  storageKey: string;
  onSection?: (s: string) => void;
  replayEvent?: string;
}) {
  const [step, setStep] = useState(0);
  const [show, setShow] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const onSectionRef = useRef(onSection);
  onSectionRef.current = onSection;
  const { lang } = useLang();
  const tr = (o: LocStr) => (lang === "es" ? o.es : o.en);
  const tt = (es: string, en: string) => (lang === "es" ? es : en);

  useEffect(() => {
    if (localStorage.getItem(storageKey) === "true") return;
    const t = setTimeout(() => setShow(true), 600);
    return () => clearTimeout(t);
  }, [storageKey]);

  // Botón "Tutorial" del navbar — escucha su evento para repetir la guía.
  useEffect(() => {
    const h = () => { setStep(0); setRect(null); setShow(true); };
    window.addEventListener(replayEvent, h);
    return () => window.removeEventListener(replayEvent, h);
  }, [replayEvent]);

  // Best-effort spotlight: poll for the target, scroll it into view, keep tracking.
  useEffect(() => {
    if (!show) return;
    const stepDef = steps[step];
    // Cambia de sección (si aplica). El poll primero clickea `clickSelector` (si
    // hay) para cambiar el contenido, y luego ilumina `selector`.
    if (stepDef?.section) onSectionRef.current?.(stepDef.section);
    const clickSel = stepDef?.clickSelector;
    const spotSel = stepDef?.selector;
    if (!spotSel && !clickSel) { setRect(null); return; }
    let raf = 0;
    let cancelled = false;
    let scrolled = false;
    let clicked = !clickSel;  // sin clickSelector → nada que clickear
    const start = performance.now();
    const tick = () => {
      if (cancelled) return;
      // 1) Clic (una vez) para cambiar el contenido debajo.
      if (!clicked) {
        const c = document.querySelector(clickSel!);
        if (c) { (c as HTMLElement).click(); clicked = true; }
      }
      // 2) Ilumina el objetivo, ya con el contenido correcto montado.
      if (clicked) {
        if (!spotSel) { setRect(null); return; }
        const el = document.querySelector(spotSel);
        if (el) {
          if (!scrolled) { el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" }); scrolled = true; }
          setRect(el.getBoundingClientRect());
          raf = requestAnimationFrame(tick);
          return;
        }
      }
      if (performance.now() - start < FIND_TIMEOUT_MS) raf = requestAnimationFrame(tick);
      else setRect(null); // se rindió — tooltip centrado
    };
    tick();
    return () => { cancelled = true; cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, show]);

  const finish = () => {
    setShow(false);
    setRect(null);
    try { localStorage.setItem(storageKey, "true"); } catch { /* storage blocked */ }
  };

  const s = steps[step];
  const isLast = step === steps.length - 1;

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
          <div className="h-full rounded-full transition-all" style={{ width: `${((step + 1) / steps.length) * 100}%`, background: "#0F8A4F" }} />
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
