import { Wordmark } from "./Wordmark";

/**
 * Branded loading veil — warm paper ground (matches loaded content, avoids a
 * dark/white flash), Medellín Social wordmark + indeterminate teal bar.
 * `label` → "Cargando {label}" (e.g. "eventos", "negocios"). Fades out on !show.
 * Positioned `absolute inset-0` → needs a positioned ancestor; caller sets z via className.
 */
export function LoadingVeil({ label, show, className = "" }: { label?: string; show: boolean; className?: string }) {
  return (
    <div
      aria-hidden={!show}
      className={`pointer-events-none inset-0 flex flex-col items-center justify-center gap-4 ${className}`}
      style={{
        background: "radial-gradient(120% 120% at 50% 32%, #F5F0E6 0%, #E9E1D2 58%, #DED4C1 100%)",
        opacity: show ? 1 : 0,
        transition: "opacity .5s ease",
      }}
    >
      {/* Mismo wordmark que el logo, pero con pin propio: el contexto del veil
          (line-height standalone) lo renderiza más arriba que en los logos. */}
      <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontWeight: 900, fontSize: 30, color: "#14201d", letterSpacing: "-0.02em" }}>
        <Wordmark pinTop="0.34em" />
      </div>
      <div className="load-bar" />
      <div style={{ fontSize: 12, letterSpacing: ".16em", textTransform: "uppercase", color: "#6B5B45", fontWeight: 600 }}>
        {label ? `Cargando ${label}` : "Cargando"}
      </div>
    </div>
  );
}
