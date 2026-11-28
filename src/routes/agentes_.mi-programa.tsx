// Panel del agente en el Programa: estado de la cuenta, pago del registro, plan de
// certificación, anuncios vinculados (cobertura: incluido / $5 / ilimitado) y preferente.
import { seo } from "@/lib/seo";
import { useState } from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";
import { API_ENDPOINTS } from "@/config/api";
import { useLang, useT } from "@/lib/i18n";
import { ComunidadLayout } from "@/components/comunidad/ComunidadLayout";
import { K } from "@/design/tokens";
import { PRECIOS_USD as P, usd, type Representacion } from "@/lib/agentProgram";
import { BotonPago, Paso, fecha, pBtn, pCard, pH2, pInput, useMiEstado } from "@/components/agentes/ProgramaUI";

export const Route = createFileRoute("/agentes_/mi-programa")({
  validateSearch: (s: Record<string, unknown>) => ({ nuevo: s.nuevo ? 1 : undefined }),
  head: () => seo({ title: "Mi programa de agente · Medellín Social", description: "Estado de tu registro, certificación y anuncios.", path: "/agentes/mi-programa" }),
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem("medellin-social.user")) {
      throw redirect({ to: "/login", search: { redirect: "/agentes/mi-programa" } as never });
    }
  },
  component: MiProgramaPage,
});

function MiProgramaPage() {
  const t = useT();
  const { lang } = useLang();
  const { nuevo } = Route.useSearch();
  const { data: e, isLoading, error } = useMiEstado();

  if (isLoading) return <ComunidadLayout><p style={{ padding: 40, textAlign: "center", color: K.muted }}>{t("Cargando…", "Loading…")}</p></ComunidadLayout>;
  if (error || !e) {
    const noAgente = error instanceof Error && /No eres agente/i.test(error.message);
    return (
      <ComunidadLayout>
        <div style={{ maxWidth: 560, margin: "48px auto", padding: "0 16px", textAlign: "center" }}>
          <h1 style={{ fontFamily: K.serif, fontSize: 28, color: K.ink }}>{noAgente ? t("Aún no eres agente", "You're not an agent yet") : t("No pudimos cargar tu estado", "We couldn't load your status")}</h1>
          <p style={{ color: K.muted, fontSize: 14 }}>{noAgente ? t("Regístrate para aparecer junto a los inmuebles que representas.", "Register to appear next to the properties you represent.") : (error instanceof Error ? error.message : "")}</p>
          <Link to={noAgente ? "/agentes/registro" : "/agentes/programa"} style={pBtn()}>{noAgente ? t("Registrarme como agente", "Register as an agent") : t("Ver el programa", "See the program")}</Link>
        </div>
      </ComunidadLayout>
    );
  }

  const activo = e.estado === "activo";
  const cert = e.certificacion;
  const planTxt = e.cert_plan === "ilimitado" ? t("Ilimitado", "Unlimited") : e.cert_plan === "estandar" ? t("Estándar (5 anuncios incluidos)", "Standard (5 listings included)") : null;

  return (
    <ComunidadLayout>
      <div style={{ background: K.paper }}>
        <div style={{ maxWidth: 820, margin: "0 auto", padding: "32px 16px 72px", display: "grid", gap: 18 }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: K.teal, margin: "0 0 6px" }}>{t("Programa de agentes", "Agent program")}</p>
            <h1 style={{ fontFamily: K.serif, fontSize: "clamp(1.6rem,4vw,2.2rem)", fontWeight: 900, color: K.ink, margin: 0 }}>{t("Mi programa", "My program")}</h1>
          </div>
          {nuevo && (
            <div role="status" style={{ ...pCard, background: K.tealLight, border: "none", fontSize: 14, color: K.tealDeep }}>
              {t("Tu cuenta ya quedó activa. Paga tu registro para aparecer en el directorio y vincular tus anuncios.", "Your account is already active. Pay your registration to appear in the directory and link your listings.")}
            </div>
          )}

          {/* Estado general */}
          <section style={pCard} data-testid="mi-estado">
            <h2 style={pH2}>{t("Tu estado", "Your status")}</h2>
            <Paso hecho={!!e.registro_pagado_at} actual={!e.registro_pagado_at}>
              <strong>{t("Registro", "Registration")}</strong> — {e.registro_pagado_at
                ? t(`pagado el ${fecha(e.registro_pagado_at, lang)}`, `paid on ${fecha(e.registro_pagado_at, lang)}`)
                : t(`pendiente de pago (${usd(P.registro)}, único)`, `payment pending (${usd(P.registro)}, one-time)`)}
              {!e.registro_pagado_at && (
                <div style={{ marginTop: 8 }}>
                  <BotonPago producto="registro" estado={e} label={t(`Pagar registro · ${usd(P.registro)}`, `Pay registration · ${usd(P.registro)}`)} testId="pagar-registro" />
                </div>
              )}
            </Paso>
            <Paso hecho={activo} actual={!activo}>
              <strong>{t("Cuenta activa", "Account active")}</strong> — {activo ? t("se activó automáticamente al registrarte", "activated automatically when you registered")
                : e.estado === "pendiente" ? t("verifica tu correo para activarla", "verify your email to activate it")
                : t("cuenta no habilitada; escríbenos a hola@medellin.social", "account not enabled; write to hola@medellin.social")}
            </Paso>
            <Paso hecho={e.registrado}>
              <strong>{t("Agente registrado", "Registered agent")}</strong> — {e.registrado
                ? t("tu perfil aparece en el directorio y en tus anuncios cubiertos", "your profile appears in the directory and on your covered listings")
                : t("se activa al pagar el registro", "activates when you pay the registration")}
            </Paso>
            <Paso hecho={e.certificado} actual={!!cert && !e.certificado}>
              <strong>{t("Agente certificado", "Certified agent")}</strong> — {e.certificado ? t("insignia activa", "badge active")
                : cert ? t("solicitud en curso", "application in progress") : t("opcional", "optional")}
              <div style={{ marginTop: 6 }}>
                <Link to="/agentes/certificacion" style={{ fontSize: 13, fontWeight: 700, color: K.teal }}>
                  {cert ? t("Ver mi certificación →", "View my certification →") : t("Solicitar certificación →", "Apply for certification →")}
                </Link>
              </div>
            </Paso>
            {planTxt && (
              <p style={{ fontSize: 13, color: K.muted, margin: "8px 0 0" }}>
                {t("Plan", "Plan")}: <strong style={{ color: K.ink }}>{planTxt}</strong>
                {e.cert_plan_vence && ` · ${e.plan_vigente ? t("vigente hasta", "active until") : t("venció el", "expired on")} ${fecha(e.cert_plan_vence, lang)}`}
              </p>
            )}
          </section>

          <Anuncios e={e} />

          <section style={pCard}>
            <h2 style={pH2}>{t("Agente preferente", "Preferred agent")}</h2>
            {e.preferente.length > 0 ? (
              <p style={{ fontSize: 14, color: K.ink, margin: "0 0 10px" }}>
                {t(`Tienes ${e.preferente.length} zona(s) preferente(s) activa(s).`, `You have ${e.preferente.length} active preferred area(s).`)}
              </p>
            ) : (
              <p style={{ fontSize: 14, color: K.muted, margin: "0 0 10px" }}>
                {t("Concentra tu presencia en un barrio o una comuna. No requiere certificación.", "Focus your presence on a neighborhood or commune. Certification isn't required.")}
              </p>
            )}
            <Link to="/planes/featured-realtor" style={pBtn(false)}>{t("Explorar zonas preferentes", "Explore preferred areas")}</Link>
          </section>
        </div>
      </div>
    </ComunidadLayout>
  );
}

function coberturaLabel(r: Representacion, t: (es: string, en: string) => string) {
  switch (r.cobertura) {
    case "incluido": return t("Incluido en tu plan", "Included in your plan");
    case "pago": return t(`Pagado (${usd(P.anuncio)})`, `Paid (${usd(P.anuncio)})`);
    case "ilimitado": return t("Plan ilimitado", "Unlimited plan");
    default: return t("Sin cobertura", "Not covered");
  }
}

function Anuncios({ e }: { e: NonNullable<ReturnType<typeof useMiEstado>["data"]> }) {
  const t = useT();
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  const [relacion, setRelacion] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const puede = e.estado === "activo" && !!e.registro_pagado_at;

  async function vincular(ev: React.FormEvent) {
    ev.preventDefault();
    setMsg(null);
    const v = url.trim();
    if (!v || relacion.trim().length < 3) { setMsg({ ok: false, text: t("Pega el enlace del anuncio y explica tu relación con el inmueble.", "Paste the listing link and explain your relationship to the property.") }); return; }
    const mapId = v.match(/[?&]listing=(-?\d+)/)?.[1] ?? (/^-?\d+$/.test(v) ? v : null);
    setBusy(true);
    try {
      await apiFetch(API_ENDPOINTS.agentProgramRepresentacion, {
        method: "POST",
        body: JSON.stringify(mapId ? { listing_id: Number(mapId), relacion: relacion.trim() } : { listing_url: v, relacion: relacion.trim() }),
      });
      setUrl(""); setRelacion("");
      setMsg({ ok: true, text: t("Solicitud enviada. El equipo verifica tu relación con el inmueble antes de mostrarte como representante.", "Request sent. Our team verifies your relationship to the property before showing you as the representative.") });
      await qc.invalidateQueries({ queryKey: ["agent-program"] });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : t("No pudimos vincular el anuncio.", "We couldn't link the listing.") });
    } finally { setBusy(false); }
  }

  async function retirar(id: string) {
    await apiFetch(API_ENDPOINTS.agentProgramRepresentacionItem(id), { method: "DELETE" });
    await qc.invalidateQueries({ queryKey: ["agent-program"] });
  }

  const EST: Record<Representacion["estado"], string> = {
    solicitado: t("En verificación", "Being verified"), aprobado: t("Aprobado", "Approved"), rechazado: t("Rechazado", "Rejected"),
  };

  return (
    <section style={pCard} data-testid="mis-anuncios">
      <h2 style={pH2}>{t("Mis anuncios", "My listings")}</h2>
      <p style={{ fontSize: 13, color: K.muted, margin: "0 0 12px" }}>
        {e.cert_plan && e.plan_vigente
          ? e.cert_plan === "ilimitado"
            ? t("Tu plan ilimitado cubre todos tus anuncios.", "Your unlimited plan covers all your listings.")
            : t(`Usas ${e.cupos_usados} de ${e.cupos_incluidos} anuncios incluidos. Cada anuncio adicional cuesta ${usd(P.anuncio)} (único).`, `You're using ${e.cupos_usados} of ${e.cupos_incluidos} included listings. Each additional listing costs ${usd(P.anuncio)} (one-time).`)
          : t(`Cada anuncio que representes cuesta ${usd(P.anuncio)} (único). Con la certificación, tu plan incluye ${P.cupos_incluidos}.`, `Each listing you represent costs ${usd(P.anuncio)} (one-time). With certification, your plan includes ${P.cupos_incluidos}.`)}
      </p>

      {puede ? (
        <form onSubmit={vincular} style={{ display: "grid", gap: 8, marginBottom: 14 }}>
          <input style={pInput} value={url} onChange={(ev) => setUrl(ev.target.value)} maxLength={1000}
            placeholder={t("Enlace del anuncio (Medellín Social o portal original)", "Listing link (Medellín Social or original portal)")} aria-label={t("Enlace del anuncio", "Listing link")} />
          <input style={pInput} value={relacion} onChange={(ev) => setRelacion(ev.target.value)} maxLength={500}
            placeholder={t("Tu relación con el inmueble (ej. exclusiva de venta firmada)", "Your relationship to the property (e.g. signed exclusive listing)")} aria-label={t("Relación con el inmueble", "Relationship to the property")} />
          <div><button type="submit" disabled={busy} style={pBtn(true, busy)} data-testid="vincular-anuncio">{busy ? t("Enviando…", "Sending…") : t("Solicitar vinculación", "Request link")}</button></div>
          {msg && <p role="status" style={{ fontSize: 12, color: msg.ok ? K.teal : K.rojo, margin: 0 }}>{msg.text}</p>}
        </form>
      ) : (
        <p style={{ fontSize: 13, color: K.ink, background: K.surface, borderRadius: 10, padding: 10 }}>
          {t("Podrás vincular anuncios cuando tu registro esté pagado y tu cuenta aprobada.", "You'll be able to link listings once your registration is paid and your account approved.")}
        </p>
      )}

      {e.representaciones.length === 0 ? (
        <p style={{ fontSize: 13, color: K.muted, margin: 0 }}>{t("Aún no has vinculado anuncios.", "You haven't linked any listings yet.")}</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {e.representaciones.map((r) => (
            <div key={r.id} style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between", border: `1px solid ${K.line}`, borderRadius: 10, padding: 10 }}>
              <div style={{ minWidth: 0, flex: "1 1 240px" }}>
                <a href={r.listing_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: K.tealDeep, wordBreak: "break-all" }}>{r.listing_url}</a>
                <div style={{ fontSize: 12, color: K.muted, marginTop: 2 }}>
                  {EST[r.estado]} · {coberturaLabel(r, t)}{r.motivo ? ` · ${r.motivo}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {r.cobertura === "ninguna" && r.estado !== "rechazado" && (
                  <BotonPago producto="anuncio" listingUrl={r.listing_url} estado={e} label={t(`Pagar ${usd(P.anuncio)}`, `Pay ${usd(P.anuncio)}`)} testId="pagar-anuncio" />
                )}
                {r.estado !== "rechazado" && (
                  <button type="button" onClick={() => retirar(r.id)} style={{ ...pBtn(false), borderColor: K.line, color: K.muted }}>{t("Retirar", "Remove")}</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
