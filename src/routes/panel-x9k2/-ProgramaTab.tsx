// Panel admin › Programa de agentes: certificaciones (examen EASE + revisión de
// trayectoria), vinculaciones agente↔anuncio, reclamos de inmuebles y leads de
// "Más información". Aprobar una certificación pide la contraseña del admin (re-auth).
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/apiClient";
import { API_ENDPOINTS } from "@/config/api";
import { useT } from "@/lib/i18n";
import { K } from "@/design/tokens";

type Sub = "certificaciones" | "representaciones" | "reclamos" | "leads";

type Cert = {
  id: string; agent_id: string; nombre: string; email: string; telefono: string;
  anios_experiencia: number; n_transacciones: number; descripcion: string | null; documentos: string[];
  examen_evidencia_url: string | null; examen_estado: string; revision_estado: string; motivo: string | null;
  created_at: string; cert_cuota_pagada_at: string | null; cert_plan: string | null; cert_plan_vence: string | null; certificado: boolean;
};
type Rep = {
  id: string; listing_url: string; estado: string; cobertura: string; relacion: string | null; motivo: string | null;
  created_at: string; agent_id: string; nombre: string; email: string; telefono: string; otro_aprobado: string | null;
};
type Reclamo = {
  id: string; listing_url: string; fuente: string | null; estado: string; nombre: string; telefono: string;
  email: string | null; matricula_declarada: string | null; mensaje: string | null; created_at: string;
};
type LeadServicio = {
  id: string; tipo: string; nombre: string; email: string | null; telefono: string | null; barrio: string | null;
  listing_url: string | null; mensaje: string | null; estado: string; created_at: string;
};

const card = "rounded-xl border p-4";
const fmt = (s: string | null) => (s ? new Date(s).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" }) : "—");

function Btn({ children, onClick, tone = "teal", disabled }: { children: React.ReactNode; onClick: () => void; tone?: "teal" | "coral" | "ghost"; disabled?: boolean }) {
  const style = tone === "teal" ? { background: K.tealDeep, color: "#fff" }
    : tone === "coral" ? { background: "#FFFFFF", color: K.coral, border: `1px solid ${K.coral}` }
    : { background: "#FFFFFF", color: K.ink, border: `1px solid ${K.line}` };
  return (
    <button onClick={onClick} disabled={disabled} className="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50" style={style}>
      {children}
    </button>
  );
}

function Pills<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {options.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)} className="rounded-full px-3 py-1 text-xs font-semibold"
          style={value === v ? { background: K.teal, color: "#fff" } : { background: "#fff", color: K.muted, border: `1px solid ${K.line}` }}>
          {l}
        </button>
      ))}
    </div>
  );
}

/** Prompt de contraseña (re-auth) + motivo opcional/obligatorio. */
function usePrompt() {
  const t = useT();
  const [p, setP] = useState<null | { label: string; password: boolean; motivo: boolean; resolve: (v: { password: string; motivo: string }) => void; reject: () => void }>(null);
  const ask = (label: string, opts: { password?: boolean; motivo?: boolean }) =>
    new Promise<{ password: string; motivo: string }>((resolve, reject) =>
      setP({ label, password: !!opts.password, motivo: !!opts.motivo, resolve, reject }));
  const [pw, setPw] = useState("");
  const [mot, setMot] = useState("");
  const cerrar = () => { setPw(""); setMot(""); setP(null); };
  const modal = p ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(20,32,29,0.45)" }}>
      <div className="w-full max-w-sm rounded-xl border p-5" style={{ borderColor: K.line, background: "#FFFFFF" }}>
        <p className="mb-3 text-sm font-semibold" style={{ color: K.ink }}>{p.label}</p>
        {p.motivo && (
          <textarea value={mot} onChange={(e) => setMot(e.target.value)} maxLength={1000} autoFocus
            placeholder={t("Motivo (se envía al agente)", "Reason (sent to the agent)")}
            className="mb-3 w-full rounded-md border px-3 py-2 text-sm" style={{ borderColor: K.line, color: K.ink, minHeight: 70 }} />
        )}
        {p.password && (
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus={!p.motivo}
            placeholder={t("Tu contraseña de admin", "Your admin password")}
            className="mb-3 w-full rounded-md border px-3 py-2 text-sm" style={{ borderColor: K.line, color: K.ink }} />
        )}
        <div className="flex justify-end gap-2">
          <button onClick={() => { p.reject(); cerrar(); }} className="rounded-lg px-3 py-1.5 text-xs font-medium" style={{ color: K.muted }}>{t("Cancelar", "Cancel")}</button>
          <button disabled={(p.password && !pw) || (p.motivo && !mot.trim())}
            onClick={() => { p.resolve({ password: pw, motivo: mot.trim() }); cerrar(); }}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50" style={{ background: K.tealDeep }}>
            {t("Confirmar", "Confirm")}
          </button>
        </div>
      </div>
    </div>
  ) : null;
  return { ask, modal };
}

export function ProgramaTab() {
  const t = useT();
  const [sub, setSub] = useState<Sub>("certificaciones");
  return (
    <div>
      <h2 className="mb-1 text-xl font-bold" style={{ color: K.ink, fontFamily: K.serif }}>{t("Programa de agentes", "Agent program")}</h2>
      <p className="mb-4 text-xs" style={{ color: K.muted }}>
        {t("Certificaciones, vinculaciones de anuncios, reclamos de inmuebles y leads de “Más información”.",
           "Certifications, listing links, property claims and “Get more information” leads.")}
      </p>
      <Pills<Sub> value={sub} onChange={setSub} options={[
        ["certificaciones", t("Certificaciones", "Certifications")],
        ["representaciones", t("Vinculaciones de anuncios", "Listing links")],
        ["reclamos", t("Reclamos de inmuebles", "Property claims")],
        ["leads", t("Leads de servicio", "Service leads")],
      ]} />
      {sub === "certificaciones" && <Certificaciones />}
      {sub === "representaciones" && <Representaciones />}
      {sub === "reclamos" && <Reclamos />}
      {sub === "leads" && <LeadsServicio />}
    </div>
  );
}

function useAccion(keys: unknown[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ url, body, method = "POST" }: { url: string; body: unknown; method?: string }) =>
      apiFetch(url, { method, body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: keys }); toast.success("OK"); },
    onError: (e: Error) => toast.error(e.message || "Error"),
  });
}

function Certificaciones() {
  const t = useT();
  const [estado, setEstado] = useState<"abiertas" | "aprobadas" | "no_aprobadas">("abiertas");
  const q = useQuery<Cert[]>({ queryKey: ["admin", "prog-cert", estado], queryFn: () => apiFetch<Cert[]>(API_ENDPOINTS.adminCertificaciones(estado)) });
  const accion = useAccion(["admin", "prog-cert"]);
  const { ask, modal } = usePrompt();

  async function resolver(c: Cert, campo: "examen" | "revision", decision: "aprobado" | "no_aprobado") {
    try {
      const nombreCampo = campo === "examen" ? t("examen EASE", "EASE exam") : t("revisión de trayectoria", "track-record review");
      const r = await ask(
        decision === "aprobado" ? t(`Aprobar ${nombreCampo} de ${c.nombre}`, `Approve ${nombreCampo} for ${c.nombre}`)
          : t(`No aprobar ${nombreCampo} de ${c.nombre}`, `Reject ${nombreCampo} for ${c.nombre}`),
        { password: decision === "aprobado", motivo: decision === "no_aprobado" });
      accion.mutate({ url: API_ENDPOINTS.adminCertificacionResolver(c.id), body: { campo, decision, motivo: r.motivo || null, password: r.password || null } });
    } catch { /* cancelado */ }
  }

  return (
    <div>
      {modal}
      <Pills value={estado} onChange={setEstado} options={[["abiertas", t("Abiertas", "Open")], ["aprobadas", t("Aprobadas", "Approved")], ["no_aprobadas", t("No aprobadas", "Rejected")]]} />
      {q.isLoading && <p className="text-sm" style={{ color: K.muted }}>{t("Cargando…", "Loading…")}</p>}
      {q.data?.length === 0 && <p className="text-sm" style={{ color: K.muted }}>{t("No hay solicitudes.", "No applications.")}</p>}
      <div className="grid gap-3">
        {q.data?.map((c) => (
          <div key={c.id} className={card} style={{ borderColor: K.line, background: "#fff" }} data-testid="admin-cert">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="font-semibold" style={{ color: K.ink }}>{c.nombre} <span className="text-xs font-normal" style={{ color: K.muted }}>{c.email} · {c.telefono}</span></div>
              <div className="text-xs" style={{ color: K.muted }}>{fmt(c.created_at)}</div>
            </div>
            <div className="mt-1 text-sm" style={{ color: K.ink }}>
              {c.anios_experiencia} {t("años", "years")} · {c.n_transacciones} {t("transacciones", "transactions")}
              {c.certificado && <span className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: K.tealLight, color: K.tealDeep }}>{t("CERTIFICADO", "CERTIFIED")}</span>}
            </div>
            {c.descripcion && <p className="mt-1 text-xs" style={{ color: K.muted }}>{c.descripcion}</p>}
            {c.documentos.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-2 text-xs">
                {c.documentos.map((d, i) => <a key={d} href={d} target="_blank" rel="noopener noreferrer" style={{ color: K.teal }}>{t("Documento", "Document")} {i + 1} ↗</a>)}
              </div>
            )}
            <div className="mt-2 grid gap-1 text-xs" style={{ color: K.ink }}>
              <div>
                <strong>{t("Examen EASE", "EASE exam")}:</strong> {c.examen_estado}
                {c.examen_evidencia_url && <> · <a href={c.examen_evidencia_url} target="_blank" rel="noopener noreferrer" style={{ color: K.teal }}>{t("evidencia", "evidence")} ↗</a></>}
              </div>
              <div><strong>{t("Revisión de trayectoria", "Track-record review")}:</strong> {c.revision_estado}</div>
              <div><strong>{t("Pagos", "Payments")}:</strong> {c.cert_cuota_pagada_at ? t("$99 pagado", "$99 paid") : t("$99 pendiente", "$99 pending")} · {c.cert_plan ? `${c.cert_plan} ${t("hasta", "until")} ${fmt(c.cert_plan_vence)}` : t("sin plan", "no plan")}</div>
              {c.motivo && <div style={{ color: K.coral }}>{t("Motivo", "Reason")}: {c.motivo}</div>}
            </div>
            {estado === "abiertas" && (
              <div className="mt-3 flex flex-wrap gap-2">
                {c.examen_estado !== "aprobado" && <>
                  <Btn onClick={() => resolver(c, "examen", "aprobado")} disabled={accion.isPending}>{t("Aprobar examen", "Approve exam")}</Btn>
                  <Btn tone="coral" onClick={() => resolver(c, "examen", "no_aprobado")} disabled={accion.isPending}>{t("No aprobar examen", "Reject exam")}</Btn>
                </>}
                {c.revision_estado !== "aprobado" && <>
                  <Btn onClick={() => resolver(c, "revision", "aprobado")} disabled={accion.isPending}>{t("Aprobar trayectoria", "Approve track record")}</Btn>
                  <Btn tone="coral" onClick={() => resolver(c, "revision", "no_aprobado")} disabled={accion.isPending}>{t("No aprobar trayectoria", "Reject track record")}</Btn>
                </>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Representaciones() {
  const t = useT();
  const [estado, setEstado] = useState<"solicitado" | "aprobado" | "rechazado">("solicitado");
  const q = useQuery<Rep[]>({ queryKey: ["admin", "prog-rep", estado], queryFn: () => apiFetch<Rep[]>(API_ENDPOINTS.adminRepresentaciones(estado)) });
  const accion = useAccion(["admin", "prog-rep"]);
  const { ask, modal } = usePrompt();
  async function rechazar(r: Rep) {
    try {
      const { motivo } = await ask(t(`Rechazar vinculación de ${r.nombre}`, `Reject link for ${r.nombre}`), { motivo: true });
      accion.mutate({ url: API_ENDPOINTS.adminRepresentacionResolver(r.id), body: { decision: "rechazado", motivo } });
    } catch { /* cancelado */ }
  }
  return (
    <div>
      {modal}
      <Pills value={estado} onChange={setEstado} options={[["solicitado", t("Por verificar", "To verify")], ["aprobado", t("Aprobadas", "Approved")], ["rechazado", t("Rechazadas", "Rejected")]]} />
      {q.data?.length === 0 && <p className="text-sm" style={{ color: K.muted }}>{t("No hay vinculaciones.", "No links.")}</p>}
      <div className="grid gap-3">
        {q.data?.map((r) => (
          <div key={r.id} className={card} style={{ borderColor: K.line, background: "#fff" }} data-testid="admin-rep">
            <div className="font-semibold" style={{ color: K.ink }}>{r.nombre} <span className="text-xs font-normal" style={{ color: K.muted }}>{r.email} · {r.telefono}</span></div>
            <a href={r.listing_url} target="_blank" rel="noopener noreferrer" className="block break-all text-xs" style={{ color: K.teal }}>{r.listing_url}</a>
            <div className="mt-1 text-xs" style={{ color: K.ink }}>
              {t("Relación declarada", "Declared relationship")}: {r.relacion ?? "—"} · {t("Cobertura", "Coverage")}: {r.cobertura} · {fmt(r.created_at)}
            </div>
            {r.otro_aprobado && <div className="mt-1 text-xs" style={{ color: K.coral }}>{t("Ya representado por", "Already represented by")}: {r.otro_aprobado}</div>}
            {r.motivo && <div className="mt-1 text-xs" style={{ color: K.muted }}>{t("Motivo", "Reason")}: {r.motivo}</div>}
            {estado === "solicitado" && (
              <div className="mt-3 flex gap-2">
                <Btn onClick={() => accion.mutate({ url: API_ENDPOINTS.adminRepresentacionResolver(r.id), body: { decision: "aprobado" } })} disabled={accion.isPending}>{t("Aprobar", "Approve")}</Btn>
                <Btn tone="coral" onClick={() => rechazar(r)} disabled={accion.isPending}>{t("Rechazar", "Reject")}</Btn>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Reclamos() {
  const t = useT();
  const [estado, setEstado] = useState<"pendiente" | "verificado" | "rechazado">("pendiente");
  const q = useQuery<Reclamo[]>({ queryKey: ["admin", "prog-recl", estado], queryFn: () => apiFetch<Reclamo[]>(API_ENDPOINTS.adminReclamos(estado)) });
  const accion = useAccion(["admin", "prog-recl"]);
  const { ask, modal } = usePrompt();
  async function rechazar(r: Reclamo) {
    try {
      const { motivo } = await ask(t(`Rechazar reclamo de ${r.nombre}`, `Reject claim from ${r.nombre}`), { motivo: true });
      accion.mutate({ url: API_ENDPOINTS.adminReclamoResolver(r.id), body: { decision: "rechazado", motivo } });
    } catch { /* cancelado */ }
  }
  return (
    <div>
      {modal}
      <Pills value={estado} onChange={setEstado} options={[["pendiente", t("Pendientes", "Pending")], ["verificado", t("Verificados", "Verified")], ["rechazado", t("Rechazados", "Rejected")]]} />
      {q.data?.length === 0 && <p className="text-sm" style={{ color: K.muted }}>{t("No hay reclamos.", "No claims.")}</p>}
      <div className="grid gap-3">
        {q.data?.map((r) => (
          <div key={r.id} className={card} style={{ borderColor: K.line, background: "#fff" }}>
            <div className="font-semibold" style={{ color: K.ink }}>{r.nombre} <span className="text-xs font-normal" style={{ color: K.muted }}>{r.email ?? ""} · {r.telefono}</span></div>
            <a href={r.listing_url} target="_blank" rel="noopener noreferrer" className="block break-all text-xs" style={{ color: K.teal }}>{r.listing_url}</a>
            <div className="mt-1 text-xs" style={{ color: K.ink }}>
              {t("Matrícula declarada", "Declared registration")}: {r.matricula_declarada ?? "—"} · {r.fuente ?? ""} · {fmt(r.created_at)}
            </div>
            {r.mensaje && <p className="mt-1 text-xs" style={{ color: K.muted }}>{r.mensaje}</p>}
            {estado === "pendiente" && (
              <div className="mt-3 flex gap-2">
                <Btn onClick={() => accion.mutate({ url: API_ENDPOINTS.adminReclamoResolver(r.id), body: { decision: "verificado" } })} disabled={accion.isPending}>{t("Verificar", "Verify")}</Btn>
                <Btn tone="coral" onClick={() => rechazar(r)} disabled={accion.isPending}>{t("Rechazar", "Reject")}</Btn>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function LeadsServicio() {
  const t = useT();
  const q = useQuery<LeadServicio[]>({ queryKey: ["admin", "prog-leads"], queryFn: () => apiFetch<LeadServicio[]>(API_ENDPOINTS.adminLeadsServicio) });
  const accion = useAccion(["admin", "prog-leads"]);
  const TIPO: Record<string, string> = {
    realtor_casa: t("Realtor de la casa", "House realtor"), property_manager: "Property manager",
    administracion: t("Administración", "Administration"),
  };
  const ESTADOS: [string, string][] = [["nuevo", t("Nuevo", "New")], ["contactado", t("Contactado", "Contacted")], ["cerrado", t("Cerrado", "Closed")], ["descartado", t("Descartado", "Discarded")]];
  return (
    <div>
      {q.data?.length === 0 && <p className="text-sm" style={{ color: K.muted }}>{t("No hay leads.", "No leads.")}</p>}
      <div className="grid gap-3">
        {q.data?.map((l) => (
          <div key={l.id} className={card} style={{ borderColor: K.line, background: "#fff" }} data-testid="admin-lead-servicio">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="font-semibold" style={{ color: K.ink }}>{l.nombre}
                <span className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: K.tealLight, color: K.tealDeep }}>{TIPO[l.tipo] ?? l.tipo}</span>
              </div>
              <div className="text-xs" style={{ color: K.muted }}>{fmt(l.created_at)}</div>
            </div>
            <div className="mt-1 text-xs" style={{ color: K.ink }}>{[l.email, l.telefono, l.barrio].filter(Boolean).join(" · ")}</div>
            {l.listing_url && <a href={l.listing_url} target="_blank" rel="noopener noreferrer" className="block break-all text-xs" style={{ color: K.teal }}>{l.listing_url}</a>}
            {l.mensaje && <p className="mt-1 text-xs" style={{ color: K.muted }}>{l.mensaje}</p>}
            <select value={l.estado} onChange={(e) => accion.mutate({ url: API_ENDPOINTS.adminLeadServicio(l.id), body: { estado: e.target.value }, method: "PUT" })}
              className="mt-2 rounded-md border px-2 py-1 text-xs" style={{ borderColor: K.line }} aria-label={t("Estado del lead", "Lead status")}>
              {ESTADOS.map(([v, lab]) => <option key={v} value={v}>{lab}</option>)}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
