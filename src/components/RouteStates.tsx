import { K } from "@/design/tokens";

export function RoutePending() {
  return (
    <div role="status" aria-live="polite" data-testid="route-pending"
      style={{ minHeight: "60dvh", display: "flex", alignItems: "center", justifyContent: "center", color: K.muted, fontSize: 14 }}>
      Cargando…
    </div>
  );
}

export function RouteError({ error, reset }: { error: unknown; reset?: () => void }) {
  const msg = error instanceof Error ? error.message : "";
  return (
    <div role="alert" data-testid="route-error"
      style={{ minHeight: "60dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: K.paper }}>
      <div style={{ width: "100%", maxWidth: 440, textAlign: "center", background: "#fff", border: `1px solid ${K.line}`, borderRadius: 20, padding: "36px 28px", boxShadow: "0 12px 32px rgba(17,20,24,0.08)" }}>
        <div aria-hidden="true" style={{ width: 52, height: 52, margin: "0 auto 18px", borderRadius: "50%", background: K.tealLight, color: K.tealDeep, display: "grid", placeItems: "center", fontFamily: K.serif, fontWeight: 800, fontSize: 26, lineHeight: 1 }}>
          !
        </div>
        <p style={{ fontFamily: K.serif, fontWeight: 800, fontSize: 22, color: K.ink, margin: 0 }}>Algo salió mal</p>
        <p style={{ fontFamily: K.sans, fontSize: 14, color: K.muted, margin: "8px 0 0" }}>No pudimos cargar esta sección</p>
        {msg ? (
          <p data-i18n-skip style={{ fontFamily: K.sans, fontSize: 12, color: K.tertiary, margin: "14px 0 0", padding: "10px 12px", background: K.surface, border: `1px solid ${K.line}`, borderRadius: 10, maxWidth: "100%", overflowWrap: "anywhere", textAlign: "left" }}>{msg}</p>
        ) : null}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", marginTop: 20 }}>
          <button type="button" onClick={() => (reset ? reset() : window.location.reload())}
            style={{ minHeight: 44, padding: "0 20px", borderRadius: 10, border: "none", background: K.teal, color: "#fff", fontFamily: K.sans, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
            Reintentar
          </button>
          <a href="/"
            style={{ minHeight: 44, padding: "0 20px", borderRadius: 10, border: `1px solid ${K.line}`, background: "#fff", color: K.ink, fontFamily: K.sans, fontWeight: 700, fontSize: 14, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
            Ir al inicio
          </a>
        </div>
      </div>
    </div>
  );
}
