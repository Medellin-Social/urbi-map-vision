// Piezas compartidas de las páginas del agente en el Programa (mi-programa, certificación).
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";
import { API_ENDPOINTS } from "@/config/api";
import { K } from "@/design/tokens";
import { useT } from "@/lib/i18n";
import { pagarProducto, type MiEstado, type Producto } from "@/lib/agentProgram";

export const pCard: React.CSSProperties = { background: "#fff", border: `1px solid ${K.line}`, borderRadius: 14, padding: 20 };
export const pH2: React.CSSProperties = { fontFamily: K.serif, fontSize: "1.2rem", fontWeight: 800, color: K.ink, margin: "0 0 10px" };
export const pInput: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "10px 12px", border: `1px solid ${K.line}`, borderRadius: 10,
  fontSize: 14, fontFamily: "inherit", background: "#fff", color: K.ink,
};
export const pBtn = (primary = true, disabled = false): React.CSSProperties => ({
  background: primary ? K.teal : "#fff", color: primary ? "#fff" : K.teal, border: `1.5px solid ${K.teal}`, borderRadius: 999,
  padding: "10px 18px", fontWeight: 800, fontSize: 13, cursor: disabled ? "wait" : "pointer", fontFamily: "inherit",
  opacity: disabled ? 0.7 : 1, textDecoration: "none", display: "inline-block",
});

export function useMiEstado() {
  return useQuery<MiEstado>({
    queryKey: ["agent-program", "mi-estado"],
    queryFn: () => apiFetch<MiEstado>(API_ENDPOINTS.agentProgramMiEstado),
    retry: false,
  });
}

export function Paso({ hecho, actual, children }: { hecho: boolean; actual?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0" }}>
      <span aria-hidden style={{ flexShrink: 0, width: 22, height: 22, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 900, background: hecho ? K.teal : actual ? K.dorado : K.surface, color: hecho ? "#fff" : K.ink }}>
        {hecho ? "✓" : actual ? "•" : ""}
      </span>
      <div style={{ fontSize: 14, color: K.ink, lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}

/** Botón de pago de un producto: redirige a GHL o, en DEV con pagos simulados, aplica al instante. */
export function BotonPago({ producto, listingUrl, label, estado, primary = true, testId }: {
  producto: Producto; listingUrl?: string; label: string; estado: MiEstado; primary?: boolean; testId?: string;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function pagar() {
    setBusy(true); setMsg(null);
    try {
      const r = await pagarProducto(producto, listingUrl, estado.pagos_simulados);
      if (r.tipo === "simulado_aplicado") {
        setMsg({ ok: true, text: t("Pago simulado aplicado (entorno de pruebas).", "Simulated payment applied (test environment).") });
        await qc.invalidateQueries({ queryKey: ["agent-program"] });
      } else if (r.tipo === "pendiente") {
        setMsg({ ok: true, text: t("El pago en línea abre muy pronto. Te avisamos por correo; también puedes escribir a hola@medellin.social.", "Online payment opens very soon. We'll email you; you can also write to hola@medellin.social.") });
      }
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error && e.message ? e.message : t("No pudimos iniciar el pago.", "We couldn't start the payment.") });
    } finally { setBusy(false); }
  }
  return (
    <span style={{ display: "inline-grid", gap: 6 }}>
      <button type="button" onClick={pagar} disabled={busy} style={pBtn(primary, busy)} data-testid={testId}>
        {busy ? t("Un momento…", "One moment…") : label}
      </button>
      {msg && <span role="status" style={{ fontSize: 12, color: msg.ok ? K.teal : K.rojo }}>{msg.text}</span>}
    </span>
  );
}

export function fecha(s: string | null | undefined, lang: string): string {
  if (!s) return "";
  try { return new Date(s).toLocaleDateString(lang === "en" ? "en-US" : "es-CO", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return s; }
}
