import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
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

// ── Types (tabla `agent` UUID, 0045) ────────────────────────────────────────────
type Estado = "pendiente" | "activo" | "rechazado" | "inactivo";

type AgentRow = {
  id: string;
  nombre: string;
  email: string;
  telefono: string;
  estado: Estado;
  usuario_id: number | null;
  created_at: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function EstadoBadge({ estado }: { estado: Estado }) {
  const cfg: Record<Estado, { bg: string; color: string; label: string }> = {
    pendiente: { bg: "#FEF3C7", color: K.amber, label: "Pendiente" },
    activo:    { bg: "#F0FBF6", color: K.teal,  label: "Activo"    },
    rechazado: { bg: "#FAECE7", color: K.coral, label: "Rechazado" },
    inactivo:  { bg: K.surface, color: K.muted, label: "Inactivo"  },
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

function Avatar({ name }: { name: string }) {
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

// ── Main page ──────────────────────────────────────────────────────────────────
function AdminAgentesPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Estado>("pendiente");

  const { data: items = [], isLoading } = useQuery<AgentRow[]>({
    queryKey: ["admin-agentes", filter],
    queryFn: () => apiFetch<AgentRow[]>(`${API_ENDPOINTS.adminAgentes}?estado=${filter}`),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-agentes"] });

  const approve = useMutation({
    mutationFn: (id: string) => apiFetch(API_ENDPOINTS.adminAgenteAprobar(id), { method: "POST" }),
    onSuccess: invalidate,
  });
  const reject = useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) =>
      apiFetch(API_ENDPOINTS.adminAgenteRechazar(id), { method: "POST", body: JSON.stringify({ motivo }) }),
    onSuccess: invalidate,
  });
  const suspend = useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) =>
      apiFetch(API_ENDPOINTS.adminAgenteSuspender(id), { method: "POST", body: JSON.stringify({ motivo }) }),
    onSuccess: invalidate,
  });

  // ponytail: window.prompt para el motivo — es una tool interna de admin, no vale
  // reconstruir un modal. Cambiar a modal si se necesita UX pública.
  const askReject = (id: string) => {
    const motivo = window.prompt("Motivo del rechazo:");
    if (motivo?.trim()) reject.mutate({ id, motivo: motivo.trim() });
  };
  const askSuspend = (id: string) => {
    const motivo = window.prompt("Motivo de la suspensión:");
    if (motivo?.trim()) suspend.mutate({ id, motivo: motivo.trim() });
  };

  const TABS: { key: Estado; label: string }[] = [
    { key: "pendiente", label: "Pendientes" },
    { key: "activo",    label: "Activos"    },
    { key: "rechazado", label: "Rechazados" },
    { key: "inactivo",  label: "Inactivos"  },
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
                  {["Agente", "Contacto", "Registro", "Estado", ""].map((h) => (
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
                    className="border-b transition-colors"
                    style={{ borderColor: K.line }}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={a.nombre} />
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: K.ink }}>{a.nombre}</div>
                          <div style={{ fontSize: 12, color: K.muted }}>{a.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3" style={{ fontSize: 13, color: K.ink }}>{a.telefono}</td>
                    <td className="px-4 py-3" style={{ fontSize: 13, color: K.muted }}>
                      {new Date(a.created_at).toLocaleDateString("es-CO")}
                    </td>
                    <td className="px-4 py-3"><EstadoBadge estado={a.estado} /></td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end">
                        {a.estado === "pendiente" && (
                          <>
                            <button
                              onClick={() => approve.mutate(a.id)}
                              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
                              style={{ background: K.teal }}
                            >
                              ✓ Aprobar
                            </button>
                            <button
                              onClick={() => askReject(a.id)}
                              className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
                              style={{ borderColor: K.coral, color: K.coral }}
                            >
                              ✕ Rechazar
                            </button>
                          </>
                        )}
                        {a.estado === "activo" && (
                          <button
                            onClick={() => askSuspend(a.id)}
                            className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
                            style={{ borderColor: K.coral, color: K.coral }}
                          >
                            Suspender
                          </button>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
