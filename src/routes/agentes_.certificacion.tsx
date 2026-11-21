// Solicitud de certificación (Programa de agentes): trayectoria → examen EASE (externo,
// el agente sube su evidencia) → revisión del equipo → pagos ($99 único + plan mensual).
// La insignia se activa solo con TODO aprobado y pagado; el pago no concede la certificación.
import { seo } from "@/lib/seo";
import { useState } from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";
import { API_ENDPOINTS } from "@/config/api";
import { useLang, useT } from "@/lib/i18n";
import { ComunidadLayout } from "@/components/comunidad/ComunidadLayout";
import { K } from "@/design/tokens";
import { PRECIOS_USD as P, usd, type EstadoEval, type MiEstado } from "@/lib/agentProgram";
import { BotonPago, Paso, fecha, pBtn, pCard, pH2, pInput, useMiEstado } from "@/components/agentes/ProgramaUI";

export const Route = createFileRoute("/agentes_/certificacion")({
  head: () => seo({
    title: "Certificación de agentes · Medellín Social",
    description: "Solicita la certificación de Medellín Social: trayectoria, examen EASE y revisión del equipo.",
    path: "/agentes/certificacion",
  }),
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem("medellin-social.user")) {
      throw redirect({ to: "/login", search: { redirect: "/agentes/certificacion" } as never });
    }
  },
  component: CertificacionPage,
});

const ACUSE = {
  es: "Solicitud recibida. Tu estado de Agente certificado aparecerá después de la aprobación y del cumplimiento de los requisitos aplicables.",
  en: "Application received. Your Certified agent status will appear after approval and once the applicable requirements are met.",
};

function CertificacionPage() {
  const t = useT();
  const { data: e, isLoading, error } = useMiEstado();

  if (isLoading) return <ComunidadLayout><p style={{ padding: 40, textAlign: "center", color: K.muted }}>{t("Cargando…", "Loading…")}</p></ComunidadLayout>;
  if (error || !e) {
    return (
      <ComunidadLayout>
        <div style={{ maxWidth: 560, margin: "48px auto", padding: "0 16px", textAlign: "center" }}>
          <h1 style={{ fontFamily: K.serif, fontSize: 28, color: K.ink }}>{t("Primero regístrate como agente", "Register as an agent first")}</h1>
          <p style={{ color: K.muted, fontSize: 14 }}>{t("La certificación requiere un perfil de Agente registrado aprobado.", "Certification requires an approved Registered agent profile.")}</p>
          <Link to="/agentes/registro" style={pBtn()}>{t("Registrarme como agente", "Register as an agent")}</Link>
        </div>
      </ComunidadLayout>
    );
  }

  return (
    <ComunidadLayout>
      <div style={{ background: K.paper }}>
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 16px 72px", display: "grid", gap: 18 }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: K.teal, margin: "0 0 6px" }}>{t("Programa de agentes", "Agent program")}</p>
            <h1 style={{ fontFamily: K.serif, fontSize: "clamp(1.6rem,4vw,2.2rem)", fontWeight: 900, color: K.ink, margin: "0 0 6px" }}>{t("Certificación", "Certification")}</h1>
            <p style={{ fontSize: 14, color: K.muted, margin: 0 }}>
              {t(`Tarifa única ${usd(P.cert_cuota)} + plan mensual ${usd(P.cert_mensual)} (${P.cupos_incluidos} anuncios incluidos) o ilimitado ${usd(P.cert_ilimitado)}/mes. Se suma al registro.`,
                 `One-time fee ${usd(P.cert_cuota)} + monthly plan ${usd(P.cert_mensual)} (${P.cupos_incluidos} listings included) or unlimited ${usd(P.cert_ilimitado)}/mo. In addition to registration.`)}
            </p>
          </div>
          {e.estado !== "activo" ? (
            <div style={pCard}>
              <p style={{ fontSize: 14, color: K.ink, margin: "0 0 12px" }}>
                {t("Tu cuenta de agente debe estar aprobada antes de solicitar la certificación.", "Your agent account must be approved before applying for certification.")}
              </p>
              <Link to="/agentes/mi-programa" style={pBtn()}>{t("Ver mi programa", "View my program")}</Link>
            </div>
          ) : !e.certificacion || e.certificacion.examen_estado === "no_aprobado" || e.certificacion.revision_estado === "no_aprobado" ? (
            <>
              {e.certificacion && (
                <div role="alert" style={{ ...pCard, borderColor: K.rojo }}>
                  <p style={{ fontSize: 14, color: K.ink, margin: 0 }}>
                    <strong>{t("Tu solicitud anterior no fue aprobada.", "Your previous application wasn't approved.")}</strong>{" "}
                    {e.certificacion.motivo && <>{t("Motivo", "Reason")}: {e.certificacion.motivo}. </>}
                    {t("Puedes enviar una nueva.", "You can submit a new one.")}
                  </p>
                </div>
              )}
              <FormSolicitud />
            </>
          ) : (
            <Avance e={e} />
          )}
          <Planes e={e} />
        </div>
      </div>
    </ComunidadLayout>
  );
}

function FormSolicitud() {
  const t = useT();
  const qc = useQueryClient();
  const [anios, setAnios] = useState("");
  const [trans, setTrans] = useState("");
  const [desc, setDesc] = useState("");
  const [docs, setDocs] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function enviar(ev: React.FormEvent) {
    ev.preventDefault();
    setErr("");
    if (anios === "" || trans === "") { setErr(t("Indica tus años de experiencia y el número de transacciones.", "Enter your years of experience and number of transactions.")); return; }
    const documentos = docs.split(/\s+/).map((d) => d.trim()).filter(Boolean);
    if (documentos.some((d) => !/^https?:\/\//i.test(d))) { setErr(t("Los documentos deben ser enlaces (https://…).", "Documents must be links (https://…).")); return; }
    setBusy(true);
    try {
      await apiFetch(API_ENDPOINTS.agentProgramCertificacion, {
        method: "POST",
        body: JSON.stringify({ anios_experiencia: Number(anios), n_transacciones: Number(trans), descripcion: desc.trim() || null, documentos }),
      });
      await qc.invalidateQueries({ queryKey: ["agent-program"] });
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : t("No pudimos enviar la solicitud.", "We couldn't submit the application."));
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={enviar} style={{ ...pCard, display: "grid", gap: 12 }} data-testid="form-certificacion">
      <h2 style={pH2}>{t("Tu trayectoria profesional", "Your professional track record")}</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
        <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700, color: K.ink }}>{t("Años de experiencia inmobiliaria", "Years of real estate experience")}
          <input style={pInput} type="number" min={0} max={80} value={anios} onChange={(ev) => setAnios(ev.target.value)} required />
        </label>
        <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700, color: K.ink }}>{t("Transacciones realizadas", "Transactions closed")}
          <input style={pInput} type="number" min={0} max={100000} value={trans} onChange={(ev) => setTrans(ev.target.value)} required />
        </label>
      </div>
      <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700, color: K.ink }}>{t("Describe tu experiencia (opcional)", "Describe your experience (optional)")}
        <textarea style={{ ...pInput, minHeight: 90, resize: "vertical" }} value={desc} onChange={(ev) => setDesc(ev.target.value)} maxLength={3000} />
      </label>
      <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700, color: K.ink }}>{t("Documentos de respaldo (enlaces, uno por línea)", "Supporting documents (links, one per line)")}
        <textarea style={{ ...pInput, minHeight: 70, resize: "vertical" }} value={docs} onChange={(ev) => setDocs(ev.target.value)} maxLength={6000}
          placeholder="https://drive.google.com/…" />
        <span style={{ fontSize: 12, fontWeight: 400, color: K.muted }}>{t("Comparte enlaces privados (Drive, Dropbox). Solo el equipo revisor los ve; nunca se publican.", "Share private links (Drive, Dropbox). Only the review team sees them; they are never published.")}</span>
      </label>
      {err && <p role="alert" style={{ color: K.rojo, fontSize: 13, margin: 0 }}>{err}</p>}
      <div><button type="submit" disabled={busy} style={pBtn(true, busy)}>{busy ? t("Enviando…", "Sending…") : t("Enviar solicitud de certificación", "Submit certification application")}</button></div>
    </form>
  );
}

function etiquetaEval(s: EstadoEval, t: (es: string, en: string) => string) {
  return { pendiente: t("pendiente", "pending"), enviado: t("enviado, en revisión", "submitted, under review"),
    aprobado: t("aprobado", "approved"), no_aprobado: t("no aprobado", "not approved") }[s];
}

function Avance({ e }: { e: MiEstado }) {
  const t = useT();
  const { lang } = useLang();
  const qc = useQueryClient();
  const c = e.certificacion!;
  const [evid, setEvid] = useState(c.examen_evidencia_url ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const aprobada = c.examen_estado === "aprobado" && c.revision_estado === "aprobado";

  async function subirEvidencia(ev: React.FormEvent) {
    ev.preventDefault(); setErr("");
    if (!/^https?:\/\//i.test(evid.trim())) { setErr(t("Pega el enlace a tu resultado (https://…).", "Paste the link to your result (https://…).")); return; }
    setBusy(true);
    try {
      await apiFetch(API_ENDPOINTS.agentProgramEvidenciaExamen, { method: "PATCH", body: JSON.stringify({ examen_evidencia_url: evid.trim() }) });
      await qc.invalidateQueries({ queryKey: ["agent-program"] });
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : ""); } finally { setBusy(false); }
  }

  return (
    <section style={pCard} data-testid="avance-certificacion">
      <h2 style={pH2}>{t("Avance de tu solicitud", "Your application progress")}</h2>
      <p role="status" style={{ fontSize: 13, color: K.tealDeep, background: K.tealLight, borderRadius: 10, padding: 10, margin: "0 0 10px" }}>
        {lang === "en" ? ACUSE.en : ACUSE.es}
      </p>
      <Paso hecho>
        <strong>{t("Solicitud enviada", "Application submitted")}</strong> — {fecha(c.created_at, lang)} · {c.anios_experiencia} {t("años", "years")} · {c.n_transacciones} {t("transacciones", "transactions")}
      </Paso>
      <Paso hecho={c.examen_estado === "aprobado"} actual={c.examen_estado !== "aprobado"}>
        <strong>{t("Examen EASE", "EASE exam")}</strong> — {etiquetaEval(c.examen_estado, t)}
        {(c.examen_estado === "pendiente" || c.examen_estado === "enviado") && (
          <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
            {e.ease_exam_url
              ? <a href={e.ease_exam_url} target="_blank" rel="noopener noreferrer" style={pBtn(false)}>{t("Presentar el examen en EASE ↗", "Take the exam on EASE ↗")}</a>
              : <span style={{ fontSize: 12, color: K.muted }}>{t("El equipo te enviará el enlace al examen EASE por correo.", "Our team will email you the EASE exam link.")}</span>}
            <form onSubmit={subirEvidencia} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input style={{ ...pInput, flex: "1 1 260px" }} value={evid} onChange={(ev) => setEvid(ev.target.value)} maxLength={600}
                placeholder={t("Enlace a tu resultado o certificado del examen", "Link to your exam result or certificate")} aria-label={t("Evidencia del examen", "Exam evidence")} />
              <button type="submit" disabled={busy} style={pBtn(true, busy)}>{c.examen_evidencia_url ? t("Actualizar", "Update") : t("Enviar resultado", "Submit result")}</button>
            </form>
            {err && <span role="alert" style={{ color: K.rojo, fontSize: 12 }}>{err}</span>}
          </div>
        )}
      </Paso>
      <Paso hecho={c.revision_estado === "aprobado"} actual={c.revision_estado !== "aprobado"}>
        <strong>{t("Revisión de trayectoria", "Track-record review")}</strong> — {etiquetaEval(c.revision_estado, t)}
      </Paso>
      <Paso hecho={!!e.cert_cuota_pagada_at} actual={aprobada && !e.cert_cuota_pagada_at}>
        <strong>{t("Tarifa de certificación", "Certification fee")}</strong> — {e.cert_cuota_pagada_at ? t("pagada", "paid") : `${usd(P.cert_cuota)} ${t("único", "one-time")}`}
        {!e.cert_cuota_pagada_at && (
          <div style={{ marginTop: 8 }}>
            <BotonPago producto="cert_cuota" estado={e} label={t(`Pagar ${usd(P.cert_cuota)}`, `Pay ${usd(P.cert_cuota)}`)} testId="pagar-cert-cuota" />
          </div>
        )}
      </Paso>
      <Paso hecho={e.plan_vigente} actual={!e.plan_vigente}>
        <strong>{t("Plan mensual", "Monthly plan")}</strong> — {e.plan_vigente
          ? `${e.cert_plan === "ilimitado" ? t("ilimitado", "unlimited") : t("estándar", "standard")} · ${t("vigente hasta", "active until")} ${fecha(e.cert_plan_vence, lang)}`
          : t("elige un plan abajo", "choose a plan below")}
      </Paso>
      <Paso hecho={e.certificado}>
        <strong>{t("Insignia de Agente certificado", "Certified agent badge")}</strong> — {e.certificado ? t("activa", "active") : t("se activa al completar todos los pasos", "activates once every step is complete")}
      </Paso>
    </section>
  );
}

function Planes({ e }: { e: MiEstado }) {
  const t = useT();
  const puede = e.estado === "activo" && !!e.certificacion;
  const planes = [
    { id: "cert_mensual" as const, titulo: t("Estándar", "Standard"), precio: `${usd(P.cert_mensual)}/${t("mes", "mo")}`,
      desc: t(`${P.cupos_incluidos} anuncios de agente certificado incluidos; ${usd(P.anuncio)} cada anuncio adicional.`, `${P.cupos_incluidos} certified-agent listings included; ${usd(P.anuncio)} per additional listing.`) },
    { id: "cert_ilimitado" as const, titulo: t("Ilimitado", "Unlimited"), precio: `${usd(P.cert_ilimitado)}/${t("mes", "mo")}`,
      desc: t(`Anuncios ilimitados. Conveniente si tienes más de ${P.umbral_ilimitado}.`, `Unlimited listings. Worth it if you have more than ${P.umbral_ilimitado}.`) },
  ];
  return (
    <section id="planes" style={{ ...pCard, scrollMarginTop: 90 }}>
      <h2 style={pH2}>{t("Planes de agente certificado", "Certified agent plans")}</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
        {planes.map((p) => {
          const actual = e.plan_vigente && ((p.id === "cert_ilimitado") === (e.cert_plan === "ilimitado"));
          return (
            <div key={p.id} style={{ border: `${actual ? 2 : 1}px solid ${actual ? K.teal : K.line}`, borderRadius: 12, padding: 16, display: "grid", gap: 8 }}>
              <p style={{ fontFamily: K.serif, fontWeight: 800, fontSize: 17, margin: 0, color: K.ink }}>{p.titulo}</p>
              <p style={{ fontWeight: 800, color: K.teal, margin: 0 }}>{p.precio}</p>
              <p style={{ fontSize: 13, color: K.muted, margin: 0 }}>{p.desc}</p>
              {actual ? <span style={{ fontSize: 12, fontWeight: 700, color: K.teal }}>{t("Tu plan actual", "Your current plan")}</span>
                : puede ? <BotonPago producto={p.id} estado={e} primary={p.id === "cert_mensual"} label={t("Elegir este plan", "Choose this plan")} testId={`plan-${p.id}`} />
                : <span style={{ fontSize: 12, color: K.muted }}>{t("Disponible tras enviar tu solicitud", "Available after you submit your application")}</span>}
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: 12, color: K.muted, margin: "12px 0 0" }}>
        {t("Pagos en USD con tarjeta. El estado de Agente certificado se otorga después de aprobar el examen y la evaluación de trayectoria; el pago por sí solo no concede la certificación.",
           "Payments in USD by card. Certified agent status is granted after passing the exam and the track-record review; payment alone does not grant certification.")}
      </p>
    </section>
  );
}
