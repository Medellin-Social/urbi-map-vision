// "Más información": un visitante necesita un realtor de la casa, un property manager
// o alguien que le administre el inmueble. POST /leads/servicio → tabla leads_servicio,
// email al equipo y contacto/oportunidad en GHL (best-effort).
import { seo } from "@/lib/seo";
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { apiFetch } from "@/lib/apiClient";
import { API_ENDPOINTS } from "@/config/api";
import { useT } from "@/lib/i18n";
import { ComunidadLayout } from "@/components/comunidad/ComunidadLayout";
import { K } from "@/design/tokens";
import { TIPOS_LEAD, type TipoLead } from "@/lib/agentProgram";

type Search = { tipo?: TipoLead; barrio?: string; listing?: string };

export const Route = createFileRoute("/mas-informacion")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    tipo: (TIPOS_LEAD as readonly string[]).includes(s.tipo as string) ? (s.tipo as TipoLead) : undefined,
    barrio: typeof s.barrio === "string" ? s.barrio.slice(0, 120) : undefined,
    listing: typeof s.listing === "string" && /^https?:\/\//.test(s.listing) ? s.listing.slice(0, 1000) : undefined,
  }),
  head: () => seo({
    title: "Más información · Realtor de la casa, property manager y administración · Medellín Social",
    description: "¿Necesitas un realtor de la casa, un property manager o alguien que administre tu inmueble en Medellín? Déjanos tus datos y te contactamos.",
    path: "/mas-informacion",
  }),
  component: MasInformacionPage,
});

const input: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "11px 12px", border: `1px solid ${K.line}`, borderRadius: 10,
  fontSize: 14, fontFamily: "inherit", background: "#fff", color: K.ink,
};

function MasInformacionPage() {
  const t = useT();
  const search = Route.useSearch();
  const [tipo, setTipo] = useState<TipoLead>(search.tipo ?? "realtor_casa");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [barrio, setBarrio] = useState(search.barrio ?? "");
  const [mensaje, setMensaje] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);

  const OPCIONES: { id: TipoLead; titulo: string; desc: string }[] = [
    { id: "realtor_casa", titulo: t("Realtor de la casa", "House realtor"),
      desc: t("Un agente del equipo Medellín Social te acompaña a comprar, vender o arrendar.", "A Medellín Social team agent helps you buy, sell or rent.") },
    { id: "property_manager", titulo: t("Property manager", "Property manager"),
      desc: t("Alguien que gestione tu inmueble: arrendatarios, cobros, mantenimiento y reportes.", "Someone to run your property: tenants, rent collection, maintenance and reports.") },
    { id: "administracion", titulo: t("Administración del inmueble", "Property administration"),
      desc: t("Administración de tu propiedad o arriendo, ideal si vives fuera de Medellín.", "Management of your property or rental, ideal if you live outside Medellín.") },
  ];

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (nombre.trim().length < 2) { setError(t("Escribe tu nombre.", "Enter your name.")); return; }
    if (!email.trim() && !telefono.trim()) { setError(t("Déjanos un email o un teléfono para contactarte.", "Leave an email or phone number so we can reach you.")); return; }
    if (!consent) { setError(t("Debes aceptar el tratamiento de datos.", "You must accept the data processing terms.")); return; }
    setBusy(true);
    try {
      await apiFetch(API_ENDPOINTS.leadServicio, {
        method: "POST", skipAuth: true,
        body: JSON.stringify({
          tipo, nombre: nombre.trim(), email: email.trim() || null, telefono: telefono.trim() || null,
          barrio: barrio.trim() || null, listing_url: search.listing ?? null, mensaje: mensaje.trim() || null,
          consentimiento: consent,
        }),
      });
      setOk(true);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("No pudimos enviar tu solicitud. Intenta de nuevo.", "We couldn't send your request. Please try again."));
    } finally { setBusy(false); }
  }

  return (
    <ComunidadLayout>
      <div style={{ background: `linear-gradient(135deg, ${K.tealDeep} 0%, ${K.tealMid} 50%, ${K.teal} 100%)`, padding: "48px 20px 40px", textAlign: "center" }}>
        <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 12 }}>
          {t("Más información", "Get more information")}
        </p>
        <h1 style={{ fontFamily: K.serif, fontSize: "clamp(1.8rem,4.5vw,2.6rem)", fontWeight: 900, color: "#fff", margin: "0 0 12px", lineHeight: 1.15 }}>
          {t("¿Necesitas un realtor, un manager o alguien que administre tu inmueble?", "Need a realtor, a manager or someone to manage your property?")}
        </h1>
        <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 15, maxWidth: 560, margin: "0 auto", lineHeight: 1.6 }}>
          {t("Cuéntanos qué buscas y nuestro equipo te contacta.", "Tell us what you need and our team will reach out.")}
        </p>
      </div>

      <div style={{ background: K.paper }}>
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "32px 16px 72px" }}>
          {ok ? (
            <div role="status" data-testid="lead-ok" style={{ background: "#fff", border: `1px solid ${K.line}`, borderRadius: 14, padding: 28, textAlign: "center" }}>
              <p style={{ fontFamily: K.serif, fontWeight: 800, fontSize: 22, color: K.tealDeep, margin: "0 0 8px" }}>{t("¡Gracias!", "Thank you!")}</p>
              <p style={{ fontSize: 14, color: K.ink, margin: "0 0 18px" }}>{t("Nuestro equipo te contactará pronto para ayudarte.", "Our team will contact you soon to help.")}</p>
              <Link to="/agentes" style={{ color: K.teal, fontWeight: 700, fontSize: 14 }}>{t("Mientras tanto, explora el directorio de agentes →", "Meanwhile, explore the agent directory →")}</Link>
            </div>
          ) : (
            <form onSubmit={enviar} noValidate style={{ display: "grid", gap: 16 }}>
              <fieldset style={{ border: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
                <legend style={{ fontWeight: 800, color: K.ink, fontSize: 15, marginBottom: 8 }}>{t("¿Qué necesitas?", "What do you need?")}</legend>
                {OPCIONES.map((o) => (
                  <label key={o.id} data-testid={`lead-tipo-${o.id}`}
                    style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: 14, borderRadius: 12, cursor: "pointer",
                      background: "#fff", border: `${tipo === o.id ? 2 : 1}px solid ${tipo === o.id ? K.teal : K.line}` }}>
                    <input type="radio" name="tipo" checked={tipo === o.id} onChange={() => setTipo(o.id)} style={{ marginTop: 3, accentColor: K.teal }} />
                    <span>
                      <span style={{ display: "block", fontWeight: 800, color: K.ink, fontSize: 14 }}>{o.titulo}</span>
                      <span style={{ display: "block", fontSize: 13, color: K.muted, marginTop: 2 }}>{o.desc}</span>
                    </span>
                  </label>
                ))}
              </fieldset>

              <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700, color: K.ink }}>
                {t("Nombre", "Name")}
                <input style={input} value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" maxLength={120} />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
                <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700, color: K.ink }}>
                  {t("Email", "Email")}
                  <input style={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={200} />
                </label>
                <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700, color: K.ink }}>
                  {t("Teléfono / WhatsApp", "Phone / WhatsApp")}
                  <input style={input} type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} autoComplete="tel" maxLength={40} />
                </label>
              </div>
              <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700, color: K.ink }}>
                {t("Barrio o zona del inmueble (opcional)", "Neighborhood or area of the property (optional)")}
                <input style={input} value={barrio} onChange={(e) => setBarrio(e.target.value)} maxLength={120} />
              </label>
              <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700, color: K.ink }}>
                {t("Cuéntanos más (opcional)", "Tell us more (optional)")}
                <textarea style={{ ...input, minHeight: 96, resize: "vertical" }} value={mensaje} onChange={(e) => setMensaje(e.target.value)} maxLength={2000} />
              </label>
              {search.listing && (
                <p style={{ fontSize: 12, color: K.muted, margin: 0 }}>{t("Incluiremos el inmueble que estabas viendo.", "We'll include the property you were viewing.")}</p>
              )}
              <label style={{ display: "flex", gap: 10, fontSize: 12, color: K.muted, alignItems: "flex-start" }}>
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 2, accentColor: K.teal }} />
                <span>
                  {t("Acepto que Medellín Social use mis datos para contactarme sobre esta solicitud, según la", "I agree that Medellín Social may use my data to contact me about this request, under the")}{" "}
                  <Link to="/politica-privacidad" style={{ color: K.teal }}>{t("política de privacidad", "privacy policy")}</Link>.
                </span>
              </label>
              {error && <p role="alert" style={{ color: K.rojo, fontSize: 13, margin: 0 }}>{error}</p>}
              <button type="submit" disabled={busy}
                style={{ background: K.teal, color: "#fff", border: "none", borderRadius: 999, padding: "14px 24px", fontWeight: 800, fontSize: 15, cursor: busy ? "wait" : "pointer", fontFamily: "inherit" }}>
                {busy ? t("Enviando…", "Sending…") : t("Pedir más información", "Request more information")}
              </button>
            </form>
          )}
        </div>
      </div>
    </ComunidadLayout>
  );
}
