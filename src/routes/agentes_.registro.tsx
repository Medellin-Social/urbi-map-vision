// Registro de agente — paso 1 del Programa de agentes (docs/Medellin-Social-Programa-
// Inmobiliario-ES.md §Cómo inscribirte): perfil profesional + agencia. Luego el agente
// sigue en /agentes/mi-programa: pago del registro ($25 USD), vinculación de anuncios
// y certificación. El equipo aprueba la cuenta (panel admin).
import { seo } from "@/lib/seo";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { apiFetch } from "@/lib/apiClient";
import { API_ENDPOINTS } from "@/config/api";
import { useT } from "@/lib/i18n";
import { ComunidadLayout } from "@/components/comunidad/ComunidadLayout";
import { K } from "@/design/tokens";
import { PRECIOS_USD as P, usd } from "@/lib/agentProgram";

export const Route = createFileRoute("/agentes_/registro")({
  head: () => seo({ title: "Registro de agentes · Medellín Social", description: "Regístrate como agente inmobiliario en Medellín Social.", path: "/agentes/registro" }),
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem("medellin-social.user")) {
      throw redirect({ to: "/login", search: { redirect: "/agentes/registro" } as never });
    }
  },
  component: AgenteRegistroPage,
});

type AgenteRegistroOut = { id: string; estado: "pendiente" | "activo" | "rechazado" | "inactivo" };

const input: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "11px 12px", border: `1px solid ${K.line}`, borderRadius: 10,
  fontSize: 14, fontFamily: "inherit", background: "#fff", color: K.ink,
};
const label: React.CSSProperties = { display: "grid", gap: 6, fontSize: 13, fontWeight: 700, color: K.ink };

function AgenteRegistroPage() {
  const t = useT();
  const navigate = useNavigate();
  const [paso, setPaso] = useState(0);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [bio, setBio] = useState("");
  const [anios, setAnios] = useState("");
  const [zonas, setZonas] = useState("");
  const [agenciaTipo, setAgenciaTipo] = useState<"independiente" | "agencia">("independiente");
  const [agenciaNombre, setAgenciaNombre] = useState("");
  const [agenciaNit, setAgenciaNit] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const PASOS = [t("Perfil", "Profile"), t("Agencia", "Agency"), t("Confirmar", "Confirm")];

  function siguiente() {
    setError("");
    if (paso === 0) {
      if (!nombre.trim() || !telefono.trim()) { setError(t("Nombre y teléfono son obligatorios.", "Name and phone are required.")); return; }
      if (anios && (Number(anios) < 0 || Number(anios) > 80)) { setError(t("Años de experiencia inválidos.", "Invalid years of experience.")); return; }
    }
    if (paso === 1 && agenciaTipo === "agencia" && !agenciaNombre.trim()) {
      setError(t("Indica el nombre de tu agencia.", "Enter your agency's name.")); return;
    }
    setPaso((p) => p + 1);
  }

  async function enviar() {
    setError(""); setLoading(true);
    try {
      await apiFetch<AgenteRegistroOut>(API_ENDPOINTS.agenteRegistro, {
        method: "POST",
        body: JSON.stringify({
          nombre: nombre.trim(), telefono: telefono.trim(), bio: bio.trim() || null,
          anios_experiencia: anios ? Number(anios) : null,
          zonas_servicio: zonas.split(",").map((z) => z.trim()).filter(Boolean).slice(0, 20),
          agencia_tipo: agenciaTipo,
          agencia_nombre: agenciaTipo === "agencia" ? agenciaNombre.trim() : null,
          agencia_nit: agenciaTipo === "agencia" ? agenciaNit.trim() || null : null,
        }),
      });
      navigate({ to: "/agentes/mi-programa", search: { nuevo: 1 } as never });
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("Error. Intenta de nuevo.", "Error. Please try again."));
    } finally { setLoading(false); }
  }

  return (
    <ComunidadLayout>
      <div style={{ background: K.paper, minHeight: "70vh" }}>
        <div style={{ maxWidth: 620, margin: "0 auto", padding: "36px 16px 72px" }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: K.teal, margin: "0 0 8px" }}>
            {t("Programa de agentes", "Agent program")}
          </p>
          <h1 style={{ fontFamily: K.serif, fontSize: "clamp(1.7rem,4vw,2.3rem)", fontWeight: 900, color: K.ink, margin: "0 0 6px" }}>
            {t("Regístrate como agente", "Register as an agent")}
          </h1>
          <p style={{ fontSize: 14, color: K.muted, margin: "0 0 20px" }}>
            {t(`Tarifa única de registro ${usd(P.registro)} · ${usd(P.anuncio)} por anuncio que representes. Pagas después de enviar tu perfil.`,
               `One-time registration fee ${usd(P.registro)} · ${usd(P.anuncio)} per listing you represent. You pay after submitting your profile.`)}
          </p>

          <ol aria-label={t("Pasos", "Steps")} style={{ display: "flex", gap: 8, listStyle: "none", padding: 0, margin: "0 0 20px" }}>
            {PASOS.map((s, i) => (
              <li key={s} aria-current={i === paso ? "step" : undefined}
                style={{ flex: 1, textAlign: "center", fontSize: 12, fontWeight: 700, padding: "8px 4px", borderRadius: 999,
                  background: i <= paso ? K.teal : "#fff", color: i <= paso ? "#fff" : K.muted, border: `1px solid ${i <= paso ? K.teal : K.line}` }}>
                {i + 1}. {s}
              </li>
            ))}
          </ol>

          <div style={{ background: "#fff", border: `1px solid ${K.line}`, borderRadius: 14, padding: 20, display: "grid", gap: 14 }}>
            {paso === 0 && (
              <>
                <label style={label}>{t("Nombre completo", "Full name")}
                  <input style={input} value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" maxLength={120} />
                </label>
                <label style={label}>{t("Teléfono (WhatsApp)", "Phone (WhatsApp)")}
                  <input style={input} type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} autoComplete="tel" maxLength={40} />
                </label>
                <label style={label}>{t("Años de experiencia (opcional)", "Years of experience (optional)")}
                  <input style={input} type="number" min={0} max={80} value={anios} onChange={(e) => setAnios(e.target.value)} />
                </label>
                <label style={label}>{t("Zonas donde trabajas (separadas por coma)", "Areas where you work (comma-separated)")}
                  <input style={input} value={zonas} onChange={(e) => setZonas(e.target.value)} maxLength={600} />
                </label>
                <label style={label}>{t("Sobre ti (opcional)", "About you (optional)")}
                  <textarea style={{ ...input, minHeight: 90, resize: "vertical" }} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={2000} />
                </label>
              </>
            )}

            {paso === 1 && (
              <fieldset style={{ border: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
                <legend style={{ fontWeight: 800, color: K.ink, fontSize: 14, marginBottom: 6 }}>{t("¿Debo pertenecer a una agencia?", "Do I need to belong to an agency?")}</legend>
                <p style={{ fontSize: 13, color: K.muted, margin: 0 }}>
                  {t("Proporciona los datos de tu agencia si perteneces a una. Los agentes independientes pueden presentar su propia información profesional.",
                     "Provide your agency's details if you belong to one. Independent agents can submit their own professional information.")}
                </p>
                {(["independiente", "agencia"] as const).map((v) => (
                  <label key={v} style={{ display: "flex", gap: 10, alignItems: "center", padding: 12, borderRadius: 10, cursor: "pointer",
                    border: `${agenciaTipo === v ? 2 : 1}px solid ${agenciaTipo === v ? K.teal : K.line}` }}>
                    <input type="radio" name="agencia" checked={agenciaTipo === v} onChange={() => setAgenciaTipo(v)} style={{ accentColor: K.teal }} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: K.ink }}>
                      {v === "independiente" ? t("Soy agente independiente", "I'm an independent agent") : t("Pertenezco a una agencia", "I belong to an agency")}
                    </span>
                  </label>
                ))}
                {agenciaTipo === "agencia" && (
                  <>
                    <label style={label}>{t("Nombre de la agencia", "Agency name")}
                      <input style={input} value={agenciaNombre} onChange={(e) => setAgenciaNombre(e.target.value)} maxLength={160} />
                    </label>
                    <label style={label}>{t("NIT (opcional)", "Tax ID / NIT (optional)")}
                      <input style={input} value={agenciaNit} onChange={(e) => setAgenciaNit(e.target.value)} maxLength={40} />
                    </label>
                    <p style={{ fontSize: 12, color: K.muted, margin: 0 }}>{t("El equipo verifica la agencia antes de mostrarla como verificada.", "Our team verifies the agency before showing it as verified.")}</p>
                  </>
                )}
              </fieldset>
            )}

            {paso === 2 && (
              <div style={{ display: "grid", gap: 10, fontSize: 14, color: K.ink }}>
                <p style={{ margin: 0 }}><strong>{nombre}</strong> · {telefono}</p>
                {anios && <p style={{ margin: 0 }}>{t("Experiencia", "Experience")}: {anios} {t("años", "years")}</p>}
                {zonas && <p style={{ margin: 0 }}>{t("Zonas", "Areas")}: {zonas}</p>}
                <p style={{ margin: 0 }}>{agenciaTipo === "agencia" ? `${t("Agencia", "Agency")}: ${agenciaNombre}` : t("Agente independiente", "Independent agent")}</p>
                <div style={{ background: K.tealLight, borderRadius: 10, padding: 12, fontSize: 13, lineHeight: 1.6 }}>
                  <strong>{t("Cargos confirmados", "Confirmed fees")}</strong><br />
                  {t("Registro", "Registration")}: {usd(P.registro)} ({t("único", "one-time")})<br />
                  {t("Representación en anuncios", "Listing representation")}: {usd(P.anuncio)} {t("por anuncio, al vincularlo", "per listing, when linked")}<br />
                  <span style={{ color: K.muted }}>{t("El pago se hace en el siguiente paso, en tu panel del programa.", "You'll pay in the next step, in your program panel.")}</span>
                </div>
              </div>
            )}

            {error && <p role="alert" style={{ color: K.rojo, fontSize: 13, margin: 0 }}>{error}</p>}

            <div style={{ display: "flex", gap: 10, justifyContent: "space-between" }}>
              {paso > 0 ? (
                <button type="button" onClick={() => setPaso((p) => p - 1)} style={{ background: "#fff", color: K.ink, border: `1px solid ${K.line}`, borderRadius: 999, padding: "12px 20px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  {t("Atrás", "Back")}
                </button>
              ) : <span />}
              <button type="button" onClick={paso < 2 ? siguiente : enviar} disabled={loading} data-testid="registro-siguiente"
                style={{ background: K.teal, color: "#fff", border: "none", borderRadius: 999, padding: "12px 24px", fontWeight: 800, cursor: loading ? "wait" : "pointer", fontFamily: "inherit" }}>
                {loading ? t("Enviando…", "Sending…") : paso < 2 ? t("Continuar", "Continue") : t("Enviar y continuar al pago", "Submit and continue to payment")}
              </button>
            </div>
          </div>
          <p style={{ fontSize: 12, color: K.muted, marginTop: 14, textAlign: "center" }}>
            <Link to="/agentes/programa" style={{ color: K.teal }}>{t("Ver el programa de agentes y tarifas", "See the agent program and fees")}</Link>
          </p>
        </div>
      </div>
    </ComunidadLayout>
  );
}
