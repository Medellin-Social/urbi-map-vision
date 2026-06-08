import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { API_ENDPOINTS } from "@/config/api";
import { apiFetch } from "@/lib/apiClient";

export const Route = createFileRoute("/admin/agentes")({
  component: AdminAgentesPage,
  head: () => ({
    meta: [{ title: "Admin · Agentes · Medellín Social" }],
  }),
});

// ── Design tokens ──────────────────────────────────────────────────────────────
const K = {
  paper:  "#FAF7F2",
  surface:"#F5F0E8",
  line:   "#E9E4D8",
  ink:    "#14201D",
  muted:  "#62736D",
  teal:   "#1D9E75",
  coral:  "#D85A30",
  amber:  "#D97706",
  serif:  "'Fraunces', Georgia, serif" as const,
};

// ── Types ──────────────────────────────────────────────────────────────────────

type AgenteRow = {
  id: number;
  nombre_completo: string;
  cedula_numero: string;
  email: string;
  telefono: string;
  foto_perfil: string | null;
  estado: "pendiente" | "aprobado" | "rechazado";
  motivo_rechazo: string | null;
  fecha_registro: string;
  fecha_aprobacion: string | null;
  aprobado_por: string | null;
  especialidad: string[] | null;
  anos_experiencia: number | null;
};

type AgenteDetalle = AgenteRow & {
  cedula_foto_frente: string | null;
  cedula_foto_reverso: string | null;
  rut_documento: string | null;
  tarjeta_profesional: string | null;
  fecha_nacimiento: string | null;
  es_independiente: boolean;
  inmobiliaria_nombre: string | null;
  inmobiliaria_nit: string | null;
  transacciones_cerradas: number | null;
  tipo_inmueble: string[] | null;
  precio_rango_min: number | null;
  precio_rango_max: number | null;
  zonas_opera: string[] | null;
  whatsapp: string | null;
  linkedin: string | null;
  instagram: string | null;
  sitio_web: string | null;
  referencia_1_nombre: string | null; referencia_1_telefono: string | null; referencia_1_tipo: string | null;
  referencia_2_nombre: string | null; referencia_2_telefono: string | null; referencia_2_tipo: string | null;
  referencia_3_nombre: string | null; referencia_3_telefono: string | null; referencia_3_tipo: string | null;
};

type EstadoFilter = "todos" | "pendiente" | "aprobado" | "rechazado";

// ── Helpers ────────────────────────────────────────────────────────────────────

function EstadoBadge({ estado }: { estado: AgenteRow["estado"] }) {
  const cfg: Record<string, { bg: string; color: string; label: string }> = {
    pendiente: { bg: "#FEF3C7", color: K.amber,  label: "Pendiente" },
    aprobado:  { bg: "#F0FBF6", color: K.teal,   label: "Aprobado"  },
    rechazado: { bg: "#FAECE7", color: K.coral,  label: "Rechazado" },
  };
  const c = cfg[estado] ?? cfg.pendiente;
  return (
    <span
      className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ background: c.bg, color: c.color }}
    >
      {c.label}
    </span>
  );
}

function Avatar({ src, name }: { src: string | null; name: string }) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className="w-10 h-10 rounded-full object-cover flex-shrink-0"
        style={{ border: `2px solid ${K.line}` }}
      />
    );
  }
  const initials = name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <div
      className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
      style={{ background: K.teal, color: "#fff" }}
    >
      {initials}
    </div>
  );
}

function DocLink({ url, label }: { url: string | null; label: string }) {
  if (!url) return <span style={{ color: K.muted, fontSize: 12 }}>—</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs font-medium underline"
      style={{ color: K.teal }}
    >
      {label} ↗
    </a>
  );
}

// ── Detail modal ───────────────────────────────────────────────────────────────

function DetalleModal({
  agenteId,
  onClose,
  onApprove,
  onReject,
}: {
  agenteId: number;
  onClose: () => void;
  onApprove: (id: number) => void;
  onReject: (id: number, motivo: string) => void;
}) {
  const [motivoOpen, setMotivoOpen] = useState(false);
  const [motivo, setMotivo] = useState("");

  const { data: agente, isLoading } = useQuery<AgenteDetalle>({
    queryKey: ["agente-detalle", agenteId],
    queryFn: () => apiFetch<AgenteDetalle>(API_ENDPOINTS.adminAgenteDetalle(agenteId)),
  });

  const inputCls = `w-full rounded-lg border px-3 py-2.5 text-sm outline-none`;
  const inputSt = { borderColor: K.line, background: K.surface, color: K.ink };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-8 px-4"
      style={{ background: "rgba(20,32,29,0.6)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-2xl rounded-2xl shadow-xl"
        style={{ background: "#fff", border: `1px solid ${K.line}` }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b" style={{ borderColor: K.line }}>
          <h2 style={{ fontFamily: K.serif, fontSize: 20, color: K.ink }}>Detalle del agente</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: K.surface, color: K.muted }}
          >
            ×
          </button>
        </div>

        {isLoading && (
          <div className="p-8 text-center" style={{ color: K.muted }}>Cargando…</div>
        )}

        {agente && (
          <div className="p-6 grid gap-5">
            {/* Identity */}
            <Section title="Identidad">
              <Row label="Nombre" value={agente.nombre_completo} />
              <Row label="Cédula" value={agente.cedula_numero} />
              <Row label="Nacimiento" value={agente.fecha_nacimiento ?? "—"} />
              <Row label="Estado"><EstadoBadge estado={agente.estado} /></Row>
              <div className="flex gap-4">
                <DocLink url={agente.cedula_foto_frente} label="Cédula frente" />
                <DocLink url={agente.cedula_foto_reverso} label="Cédula reverso" />
                {agente.foto_perfil && <DocLink url={agente.foto_perfil} label="Foto perfil" />}
              </div>
            </Section>

            {/* Legal */}
            <Section title="Legal">
              <Row label="Tipo" value={agente.es_independiente ? "Independiente" : `Inmobiliaria: ${agente.inmobiliaria_nombre}`} />
              {agente.inmobiliaria_nit && <Row label="NIT" value={agente.inmobiliaria_nit} />}
              <div className="flex gap-4">
                <DocLink url={agente.rut_documento} label="RUT" />
                {agente.tarjeta_profesional && <DocLink url={agente.tarjeta_profesional} label="Tarjeta profesional" />}
              </div>
            </Section>

            {/* Experiencia */}
            <Section title="Experiencia">
              <Row label="Años exp." value={agente.anos_experiencia ? `${agente.anos_experiencia}+` : "—"} />
              <Row label="Transacciones" value={agente.transacciones_cerradas ? `${agente.transacciones_cerradas}+` : "—"} />
              <Row label="Especialidad" value={(agente.especialidad ?? []).join(", ") || "—"} />
              <Row label="Tipo inmueble" value={(agente.tipo_inmueble ?? []).join(", ") || "—"} />
              {(agente.precio_rango_min || agente.precio_rango_max) && (
                <Row label="Rango precio" value={`${fmtCOP(agente.precio_rango_min)} – ${fmtCOP(agente.precio_rango_max)}`} />
              )}
              <Row label="Zonas" value={(agente.zonas_opera ?? []).join(", ") || "—"} />
            </Section>

            {/* Contacto */}
            <Section title="Contacto">
              <Row label="Teléfono" value={agente.telefono} />
              <Row label="Email" value={agente.email} />
              {agente.whatsapp && <Row label="WhatsApp" value={agente.whatsapp} />}
              {agente.linkedin && <Row label="LinkedIn" value={agente.linkedin} />}
              {agente.instagram && <Row label="Instagram" value={agente.instagram} />}
              {agente.sitio_web && <Row label="Sitio web" value={agente.sitio_web} />}
            </Section>

            {/* Referencias */}
            {(agente.referencia_1_nombre || agente.referencia_2_nombre || agente.referencia_3_nombre) && (
              <Section title="Referencias">
                {[
                  { n: agente.referencia_1_nombre, t: agente.referencia_1_telefono, tipo: agente.referencia_1_tipo },
                  { n: agente.referencia_2_nombre, t: agente.referencia_2_telefono, tipo: agente.referencia_2_tipo },
                  { n: agente.referencia_3_nombre, t: agente.referencia_3_telefono, tipo: agente.referencia_3_tipo },
                ].filter((r) => r.n).map((r, i) => (
                  <Row key={i} label={`Ref ${i + 1}`} value={`${r.n} · ${r.t} · ${r.tipo}`} />
                ))}
              </Section>
            )}

            {/* Motivo rechazo */}
            {agente.motivo_rechazo && (
              <div className="rounded-lg p-4" style={{ background: "#FAECE7", border: `1px solid ${K.coral}30` }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: K.coral, marginBottom: 4 }}>Motivo de rechazo:</p>
                <p style={{ fontSize: 13, color: K.ink }}>{agente.motivo_rechazo}</p>
              </div>
            )}

            {/* Actions */}
            {agente.estado === "pendiente" && (
              <div className="pt-2">
                {!motivoOpen ? (
                  <div className="flex gap-3">
                    <button
                      onClick={() => onApprove(agente.id)}
                      className="flex-1 rounded-lg py-2.5 text-sm font-semibold text-white transition-all"
                      style={{ background: K.teal }}
                    >
                      ✓ Aprobar
                    </button>
                    <button
                      onClick={() => setMotivoOpen(true)}
                      className="flex-1 rounded-lg border py-2.5 text-sm font-semibold transition-all"
                      style={{ borderColor: K.coral, color: K.coral }}
                    >
                      ✕ Rechazar
                    </button>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    <p style={{ fontSize: 13, fontWeight: 600, color: K.ink }}>Motivo del rechazo:</p>
                    <textarea
                      className={inputCls}
                      style={{ ...inputSt, minHeight: 100, resize: "vertical" }}
                      placeholder="Describe qué debe corregir el agente…"
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                    />
                    <div className="flex gap-3">
                      <button
                        onClick={() => setMotivoOpen(false)}
                        className="flex-1 rounded-lg border py-2 text-sm"
                        style={{ borderColor: K.line, color: K.muted }}
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => { if (motivo.trim()) onReject(agente.id, motivo); }}
                        disabled={!motivo.trim()}
                        className="flex-1 rounded-lg py-2 text-sm font-semibold text-white disabled:opacity-40"
                        style={{ background: K.coral }}
                      >
                        Confirmar rechazo
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{ fontSize: 11, fontWeight: 700, color: K.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
        {title}
      </p>
      <div className="rounded-lg border divide-y" style={{ borderColor: K.line }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 px-4 py-2.5">
      <span style={{ fontSize: 12, color: K.muted, width: 120, flexShrink: 0 }}>{label}</span>
      {children ?? <span style={{ fontSize: 13, color: K.ink }}>{value}</span>}
    </div>
  );
}

function fmtCOP(n: number | null): string {
  if (!n) return "—";
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
}

// ── Main page ──────────────────────────────────────────────────────────────────

function AdminAgentesPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<EstadoFilter>("todos");
  const [selected, setSelected] = useState<number | null>(null);

  const { data, isLoading } = useQuery<{ total: number; items: AgenteRow[] }>({
    queryKey: ["admin-agentes", filter],
    queryFn: () => {
      const qs = filter !== "todos" ? `?estado=${filter}` : "";
      return apiFetch<{ total: number; items: AgenteRow[] }>(API_ENDPOINTS.adminAgentes + qs);
    },
  });

  const approve = useMutation({
    mutationFn: (id: number) =>
      apiFetch(API_ENDPOINTS.adminAgenteAprobar(id), { method: "PATCH" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-agentes"] });
      setSelected(null);
    },
  });

  const reject = useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) =>
      apiFetch(API_ENDPOINTS.adminAgenteRechazar(id), {
        method: "PATCH",
        body: JSON.stringify({ motivo }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-agentes"] });
      setSelected(null);
    },
  });

  const items = data?.items ?? [];
  const pendienteCount = items.filter((a) => a.estado === "pendiente").length;

  const TABS: { key: EstadoFilter; label: string }[] = [
    { key: "todos",     label: "Todos" },
    { key: "pendiente", label: "Pendientes" },
    { key: "aprobado",  label: "Aprobados" },
    { key: "rechazado", label: "Rechazados" },
  ];

  return (
    <div style={{ background: K.paper, minHeight: "100vh", padding: "40px 0" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 16px" }}>
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap" style={{ marginBottom: 28 }}>
          <div>
            <h1 style={{ fontFamily: K.serif, fontSize: 28, color: K.ink, marginBottom: 4 }}>
              Agentes
            </h1>
            <p style={{ fontSize: 14, color: K.muted }}>
              Panel de verificación de agentes inmobiliarios
            </p>
          </div>
          {pendienteCount > 0 && (
            <div
              className="rounded-full px-4 py-1.5 text-sm font-semibold"
              style={{ background: "#FEF3C7", color: K.amber }}
            >
              {pendienteCount} pendiente{pendienteCount !== 1 ? "s" : ""}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-xl p-1 mb-6 w-fit" style={{ background: K.surface }}>
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className="rounded-lg px-4 py-1.5 text-sm font-medium transition-all"
              style={{
                background: filter === tab.key ? "#fff" : "transparent",
                color: filter === tab.key ? K.ink : K.muted,
                boxShadow: filter === tab.key ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Table */}
        {isLoading && (
          <div className="text-center py-12" style={{ color: K.muted }}>Cargando…</div>
        )}

        {!isLoading && items.length === 0 && (
          <div
            className="rounded-xl py-16 text-center"
            style={{ background: "#fff", border: `1px solid ${K.line}`, color: K.muted }}
          >
            No hay agentes en este estado
          </div>
        )}

        {!isLoading && items.length > 0 && (
          <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${K.line}`, background: "#fff" }}>
            <table className="w-full">
              <thead>
                <tr style={{ background: K.surface, borderBottom: `1px solid ${K.line}` }}>
                  {["Agente", "Cédula", "Registro", "Estado", ""].map((h) => (
                    <th key={h} className="text-left px-4 py-3" style={{ fontSize: 11, fontWeight: 700, color: K.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <motion.tr
                    key={a.id}
                    layout
                    className="border-b hover:bg-[#FAF7F2] transition-colors cursor-pointer"
                    style={{ borderColor: K.line }}
                    onClick={() => setSelected(a.id)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar src={a.foto_perfil} name={a.nombre_completo} />
                        <div>
                          <p style={{ fontSize: 14, fontWeight: 600, color: K.ink }}>{a.nombre_completo}</p>
                          <p style={{ fontSize: 12, color: K.muted }}>{a.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span style={{ fontSize: 13, color: K.muted }}>{a.cedula_numero}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span style={{ fontSize: 12, color: K.muted }}>{fmtDate(a.fecha_registro)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <EstadoBadge estado={a.estado} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        className="text-xs font-medium px-3 py-1 rounded-lg transition-all"
                        style={{ background: K.teal + "15", color: K.teal }}
                        onClick={(e) => { e.stopPropagation(); setSelected(a.id); }}
                      >
                        Ver detalle
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail modal */}
      <AnimatePresence>
        {selected !== null && (
          <DetalleModal
            agenteId={selected}
            onClose={() => setSelected(null)}
            onApprove={(id) => approve.mutate(id)}
            onReject={(id, motivo) => reject.mutate({ id, motivo })}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function fmtDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));
  } catch {
    return iso;
  }
}
