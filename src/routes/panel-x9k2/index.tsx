import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, ShieldCheck, LayoutDashboard, Eye, Heart, Calculator, GitCompare, Check, X, Ban, Building2, CreditCard, MapPinned, Plus, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/apiClient";
import { API_ENDPOINTS } from "@/config/api";
import { auth } from "@/lib/auth";
import { toast } from "sonner";

// Ruta ofuscada (no /admin). El gate real es el backend (ADMIN_EMAIL); esto solo
// evita descubrimiento casual. beforeLoad exige sesión; los datos 403 si no eres admin.
export const Route = createFileRoute("/panel-x9k2/")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem("medellin-social.user")) throw redirect({ to: "/login" });
  },
  component: AdminPanel,
  head: () => ({ meta: [{ title: "Panel · Medellín Social" }] }),
});

const K = {
  paper: "#FAF7F2", surface: "#F5F0E8", line: "#E9E4D8", ink: "#14201D",
  muted: "#62736D", teal: "#1D9E75", tealDeep: "#085041", coral: "#D85A30",
  amber: "#D97706", fucsia: "#FF2D95", serif: "'Fraunces', Georgia, serif" as const,
};

type Tab = "overview" | "realtors" | "usuarios";
const TABS: { id: Tab; label: string; Icon: typeof Users }[] = [
  { id: "overview", label: "Resumen", Icon: LayoutDashboard },
  { id: "realtors", label: "Realtors", Icon: ShieldCheck },
  { id: "usuarios", label: "Usuarios", Icon: Users },
];

function AdminPanel() {
  const [tab, setTab] = useState<Tab>("overview");
  return (
    <div style={{ background: K.paper, minHeight: "100vh" }}>
      <header className="border-b" style={{ borderColor: K.line, background: "#FFFFFF" }}>
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <h1 className="text-xl font-bold" style={{ fontFamily: K.serif, color: K.ink }}>Panel de administración</h1>
          <span className="text-xs" style={{ color: K.muted }}>{auth.get()?.email}</span>
        </div>
        <div className="mx-auto flex max-w-5xl gap-6 px-4">
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className="flex items-center gap-1.5 border-b-2 pb-2.5 pt-1 text-sm transition"
              style={tab === id ? { borderColor: K.teal, color: K.ink, fontWeight: 600 } : { borderColor: "transparent", color: K.muted }}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        {tab === "overview" && <OverviewTab />}
        {tab === "realtors" && <RealtorsTab />}
        {tab === "usuarios" && <UsuariosTab />}
      </main>
    </div>
  );
}

function AccessError({ error }: { error: unknown }) {
  const msg = String((error as Error)?.message ?? "");
  if (/403|no autorizado/i.test(msg))
    return <p className="text-sm" style={{ color: K.coral }}>Acceso solo para administradores.</p>;
  return <p className="text-sm" style={{ color: K.coral }}>No se pudo cargar. {msg}</p>;
}

function Kpi({ icon, value, label, accent }: { icon: React.ReactNode; value: number | string; label: string; accent?: string }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: K.line, background: "#FFFFFF" }}>
      <div className="mb-1" style={{ color: accent ?? K.muted }}>{icon}</div>
      <div className="text-2xl font-bold" style={{ color: K.ink, fontFamily: K.serif }}>{value}</div>
      <div className="text-xs" style={{ color: K.muted }}>{label}</div>
    </div>
  );
}

// ── Overview ─────────────────────────────────────────────────────────────────
type Dashboard = {
  negocio: {
    realtors: Record<string, number>;
    listings: Record<string, number>;
    suscripciones: Record<string, number>;
    sponsorships_activos: number;
  };
  usuarios: { total: number; activos_7dias: number; activos_30dias: number; nuevos_hoy: number; nuevos_7dias: number; nuevos_30dias: number };
  comportamiento: { total_simulaciones: number; total_comparaciones: number; total_vistas_barrio: number; total_favoritos: number; barrios_top10: { nombre: string; visitas: number }[] };
};

function OverviewTab() {
  const { data, isLoading, error } = useQuery<Dashboard>({
    queryKey: ["admin", "dashboard"],
    queryFn: () => apiFetch<Dashboard>(API_ENDPOINTS.adminDashboard),
  });
  if (isLoading) return <p className="text-sm" style={{ color: K.muted }}>Cargando…</p>;
  if (error || !data) return <AccessError error={error} />;
  const { usuarios: u, comportamiento: c, negocio: n } = data;
  const subsTotal = Object.values(n.suscripciones).reduce((s, x) => s + x, 0);
  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider" style={{ color: K.muted }}>Negocio</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi icon={<ShieldCheck className="h-4 w-4" />} accent={K.teal} value={n.realtors.activo ?? 0} label={`realtors activos (${n.realtors.pendiente ?? 0} pend.)`} />
          <Kpi icon={<CreditCard className="h-4 w-4" />} accent={K.fucsia} value={subsTotal} label={`suscripciones (${n.suscripciones.pro ?? 0} pro · ${n.suscripciones.agente ?? 0} agente)`} />
          <Kpi icon={<Building2 className="h-4 w-4" />} value={n.listings.publicado ?? 0} label={`listings publicados (${n.listings.en_revision ?? 0} en revisión)`} />
          <Kpi icon={<MapPinned className="h-4 w-4" />} value={n.sponsorships_activos} label="zonas patrocinadas activas" />
        </div>
      </div>
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider" style={{ color: K.muted }}>Usuarios</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Kpi icon={<Users className="h-4 w-4" />} value={u.total} label="total" />
          <Kpi icon={<Users className="h-4 w-4" />} value={u.activos_7dias} label="activos 7d" />
          <Kpi icon={<Users className="h-4 w-4" />} value={u.activos_30dias} label="activos 30d" />
          <Kpi icon={<Users className="h-4 w-4" />} value={u.nuevos_hoy} label="nuevos hoy" />
          <Kpi icon={<Users className="h-4 w-4" />} value={u.nuevos_7dias} label="nuevos 7d" />
          <Kpi icon={<Users className="h-4 w-4" />} value={u.nuevos_30dias} label="nuevos 30d" />
        </div>
      </div>
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider" style={{ color: K.muted }}>Actividad</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi icon={<Calculator className="h-4 w-4" />} value={c.total_simulaciones} label="simulaciones" />
          <Kpi icon={<GitCompare className="h-4 w-4" />} value={c.total_comparaciones} label="comparaciones" />
          <Kpi icon={<Eye className="h-4 w-4" />} value={c.total_vistas_barrio} label="vistas barrio" />
          <Kpi icon={<Heart className="h-4 w-4" />} value={c.total_favoritos} label="favoritos" />
        </div>
      </div>
      {c.barrios_top10?.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider" style={{ color: K.muted }}>Barrios más vistos</h2>
          <div className="rounded-xl border" style={{ borderColor: K.line, background: "#FFFFFF" }}>
            {c.barrios_top10.slice(0, 8).map((b, i) => (
              <div key={i} className="flex items-center justify-between border-b px-4 py-2 text-sm last:border-0" style={{ borderColor: K.line }}>
                <span style={{ color: K.ink }}>{i + 1}. {b.nombre}</span>
                <span style={{ color: K.muted }}>{b.visitas} vistas</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Realtors ─────────────────────────────────────────────────────────────────
type Agente = { id: string; email: string; nombre: string; telefono: string | null; estado: string; created_at: string };
const ESTADOS = [
  { id: "pendiente", label: "Pendientes" },
  { id: "activo", label: "Activos" },
  { id: "rechazado", label: "Rechazados" },
  { id: "inactivo", label: "Inactivos" },
];

function RealtorsTab() {
  const qc = useQueryClient();
  const [estado, setEstado] = useState("pendiente");
  const [zonasDe, setZonasDe] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery<Agente[]>({
    queryKey: ["admin", "agentes", estado],
    queryFn: () => apiFetch<Agente[]>(`${API_ENDPOINTS.adminAgentes}?estado=${estado}`),
  });
  const accion = useMutation({
    mutationFn: ({ url }: { url: string }) => apiFetch<void>(url, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "agentes"] }); toast.success("Actualizado"); },
    onError: () => toast.error("No se pudo actualizar"),
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {ESTADOS.map((e) => (
          <button key={e.id} onClick={() => setEstado(e.id)}
            className="rounded-full border px-3 py-1 text-xs font-medium transition"
            style={estado === e.id ? { borderColor: K.teal, background: "#E1F5EE", color: K.tealDeep } : { borderColor: K.line, color: K.muted }}>
            {e.label}
          </button>
        ))}
      </div>
      {isLoading && <p className="text-sm" style={{ color: K.muted }}>Cargando…</p>}
      {error && <AccessError error={error} />}
      {data && data.length === 0 && <p className="text-sm" style={{ color: K.muted }}>Sin agentes {estado}s.</p>}
      <div className="space-y-2">
        {data?.map((a) => (
          <div key={a.id} className="rounded-xl border" style={{ borderColor: K.line, background: "#FFFFFF" }}>
            <div className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <div className="font-medium" style={{ color: K.ink }}>{a.nombre}</div>
              <div className="text-xs" style={{ color: K.muted }}>{a.email}{a.telefono ? ` · ${a.telefono}` : ""}</div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setZonasDe(zonasDe === a.id ? null : a.id)}
                className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: K.line, color: K.tealDeep }}>
                <MapPinned className="h-3.5 w-3.5" /> Zonas
              </button>
              {estado === "pendiente" && (
                <>
                  <button onClick={() => accion.mutate({ url: API_ENDPOINTS.adminAgenteAprobar(a.id) })}
                    className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-white" style={{ background: K.teal }}>
                    <Check className="h-3.5 w-3.5" /> Aprobar
                  </button>
                  <button onClick={() => accion.mutate({ url: API_ENDPOINTS.adminAgenteRechazar(a.id) })}
                    className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: K.coral, color: K.coral }}>
                    <X className="h-3.5 w-3.5" /> Rechazar
                  </button>
                </>
              )}
              {estado === "activo" && (
                <button onClick={() => accion.mutate({ url: API_ENDPOINTS.adminAgenteSuspender(a.id) })}
                  className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: K.amber, color: K.amber }}>
                  <Ban className="h-3.5 w-3.5" /> Suspender
                </button>
              )}
              {(estado === "rechazado" || estado === "inactivo") && (
                <button onClick={() => accion.mutate({ url: API_ENDPOINTS.adminAgenteAprobar(a.id) })}
                  className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-white" style={{ background: K.teal }}>
                  <Check className="h-3.5 w-3.5" /> Reactivar
                </button>
              )}
            </div>
            </div>
            {zonasDe === a.id && <ZonasManager agentId={a.id} />}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Gestor de zonas de un realtor (asignar/quitar comuna o barrio) ─────────────
type Zona = { id: string; zona_nivel: string; zona_codigo: string; nombre: string; estado: string; precio_mensual: number; fecha_fin: string };
type Catalogo = { comunas: { cd_comuna: number; nombre: string }[]; barrios: { id: number; nombre: string; cd_comuna: number }[] };

function ZonasManager({ agentId }: { agentId: string }) {
  const qc = useQueryClient();
  const [nivel, setNivel] = useState<"comuna" | "barrio">("comuna");
  const [comunaSel, setComunaSel] = useState("");
  const [barrioSel, setBarrioSel] = useState("");

  const zonas = useQuery<Zona[]>({
    queryKey: ["admin", "zonas", agentId],
    queryFn: () => apiFetch<Zona[]>(API_ENDPOINTS.adminAgenteZonas(agentId)),
  });
  const catalogo = useQuery<Catalogo>({
    queryKey: ["admin", "catalogo"],
    queryFn: () => apiFetch<Catalogo>(API_ENDPOINTS.adminZonasCatalogo),
    staleTime: 10 * 60 * 1000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin", "zonas", agentId] });
    qc.invalidateQueries({ queryKey: ["admin", "dashboard"] });
  };
  const agregar = useMutation({
    mutationFn: (body: { zona_nivel: string; zona_codigo: string }) =>
      apiFetch<void>(API_ENDPOINTS.adminAgenteZonas(agentId), { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { invalidate(); toast.success("Zona asignada"); setComunaSel(""); setBarrioSel(""); },
    onError: (e) => toast.error(/409/.test(String((e as Error).message)) ? "Esa zona ya está asignada" : "No se pudo asignar"),
  });
  const quitar = useMutation({
    mutationFn: (id: string) => apiFetch<void>(API_ENDPOINTS.adminSponsorshipDelete(id), { method: "DELETE" }),
    onSuccess: () => { invalidate(); toast.success("Zona quitada"); },
    onError: () => toast.error("No se pudo quitar"),
  });

  const barriosDeComuna = (catalogo.data?.barrios ?? []).filter((b) => String(b.cd_comuna) === comunaSel);
  const puedeAgregar = nivel === "comuna" ? !!comunaSel : !!barrioSel;
  const onAgregar = () => {
    if (nivel === "comuna") agregar.mutate({ zona_nivel: "comuna", zona_codigo: comunaSel });
    else agregar.mutate({ zona_nivel: "barrio", zona_codigo: barrioSel });
  };

  return (
    <div className="border-t px-3 py-3" style={{ borderColor: K.line, background: K.surface }}>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: K.muted }}>Zonas asignadas</div>
      {zonas.isLoading ? (
        <p className="text-xs" style={{ color: K.muted }}>Cargando…</p>
      ) : (zonas.data?.length ?? 0) === 0 ? (
        <p className="text-xs" style={{ color: K.muted }}>Sin zonas. Asigna una abajo.</p>
      ) : (
        <div className="mb-3 flex flex-wrap gap-2">
          {zonas.data!.map((z) => (
            <span key={z.id} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs"
              style={{ borderColor: K.line, background: "#FFF", color: K.ink }}>
              <MapPinned className="h-3 w-3" style={{ color: z.zona_nivel === "comuna" ? K.teal : K.amber }} />
              {z.nombre ?? z.zona_codigo} <span style={{ color: K.muted }}>({z.zona_nivel})</span>
              <button onClick={() => quitar.mutate(z.id)} title="Quitar" className="ml-0.5" style={{ color: K.coral }}>
                <Trash2 className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <select value={nivel} onChange={(e) => { setNivel(e.target.value as "comuna" | "barrio"); setBarrioSel(""); }}
          className="rounded-md border px-2 py-1 text-xs" style={{ borderColor: K.line, color: K.ink, background: "#FFF" }}>
          <option value="comuna">Comuna</option>
          <option value="barrio">Barrio</option>
        </select>
        <select value={comunaSel} onChange={(e) => { setComunaSel(e.target.value); setBarrioSel(""); }}
          className="rounded-md border px-2 py-1 text-xs" style={{ borderColor: K.line, color: K.ink, background: "#FFF" }}>
          <option value="">{nivel === "comuna" ? "Elegir comuna…" : "Filtrar por comuna…"}</option>
          {catalogo.data?.comunas.map((c) => <option key={c.cd_comuna} value={String(c.cd_comuna)}>{c.nombre}</option>)}
        </select>
        {nivel === "barrio" && (
          <select value={barrioSel} onChange={(e) => setBarrioSel(e.target.value)} disabled={!comunaSel}
            className="rounded-md border px-2 py-1 text-xs" style={{ borderColor: K.line, color: K.ink, background: "#FFF" }}>
            <option value="">Elegir barrio…</option>
            {barriosDeComuna.map((b) => <option key={b.id} value={String(b.id)}>{b.nombre}</option>)}
          </select>
        )}
        <button onClick={onAgregar} disabled={!puedeAgregar || agregar.isPending}
          className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50" style={{ background: K.teal }}>
          <Plus className="h-3.5 w-3.5" /> Asignar
        </button>
      </div>
      <p className="mt-1.5 text-[11px]" style={{ color: K.muted }}>Comuna ~$1.000.000/mes · Barrio ~$200.000/mes · vigencia 12 meses.</p>
    </div>
  );
}

// ── Usuarios (editable: plan + activo) ─────────────────────────────────────────
type UsuarioRow = {
  id: number; nombre: string | null; email: string; created_at: string | null;
  plan?: string | null; activo?: boolean;
  perfil: { presupuesto: string | null; objetivo: string | null; perfil_riesgo: string | null };
  stats: { barrios_visitados: number; simulaciones: number; comparaciones: number; favoritos: number };
};
type UsuariosResp = { usuarios: UsuarioRow[]; total: number; page: number; pages: number };
const actividadTotal = (u: UsuarioRow) => u.stats.barrios_visitados + u.stats.simulaciones + u.stats.comparaciones + u.stats.favoritos;

function UsuariosTab() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery<UsuariosResp>({
    queryKey: ["admin", "usuarios"],
    queryFn: () => apiFetch<UsuariosResp>(API_ENDPOINTS.adminUsuarios),
  });
  const editar = useMutation({
    mutationFn: ({ id, body }: { id: number; body: { plan?: string; activo?: boolean } }) =>
      apiFetch<void>(API_ENDPOINTS.adminUsuarioEditar(id), { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "usuarios"] }); qc.invalidateQueries({ queryKey: ["admin", "dashboard"] }); toast.success("Usuario actualizado"); },
    onError: () => toast.error("No se pudo actualizar"),
  });
  if (isLoading) return <p className="text-sm" style={{ color: K.muted }}>Cargando…</p>;
  if (error || !data) return <AccessError error={error} />;
  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: K.muted }}>{data.total} usuarios · edita plan (acceso Pro/Agente) o desactiva cuenta</p>
      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: K.line, background: "#FFFFFF" }}>
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs" style={{ borderColor: K.line, color: K.muted }}>
              <th className="px-4 py-3 font-medium">Usuario</th>
              <th className="px-4 py-3 font-medium">Objetivo</th>
              <th className="px-4 py-3 text-right font-medium">Actividad</th>
              <th className="px-4 py-3 font-medium">Plan (acceso)</th>
              <th className="px-4 py-3 text-center font-medium">Activo</th>
            </tr>
          </thead>
          <tbody>
            {data.usuarios.map((u) => (
              <tr key={u.id} className="border-b last:border-0" style={{ borderColor: K.line }}>
                <td className="px-4 py-3">
                  <div className="font-medium" style={{ color: K.ink }}>{u.nombre ?? "—"}</div>
                  <div className="text-xs" style={{ color: K.muted }}>{u.email}</div>
                </td>
                <td className="px-4 py-3 capitalize" style={{ color: K.muted }}>{u.perfil?.objetivo ?? "—"}</td>
                <td className="px-4 py-3 text-right" style={{ color: K.ink }}>{actividadTotal(u)}</td>
                <td className="px-4 py-3">
                  <select
                    value={u.plan ?? "free"}
                    onChange={(e) => editar.mutate({ id: u.id, body: { plan: e.target.value } })}
                    className="rounded-md border px-2 py-1 text-xs" style={{ borderColor: K.line, color: K.ink, background: "#FFF" }}
                  >
                    <option value="free">Free</option>
                    <option value="pro">Pro</option>
                    <option value="agente">Agente</option>
                  </select>
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => editar.mutate({ id: u.id, body: { activo: !(u.activo ?? true) } })}
                    className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                    style={(u.activo ?? true)
                      ? { background: "#E1F5EE", color: K.tealDeep }
                      : { background: "#FDECEA", color: K.coral }}
                    title="Click para alternar"
                  >
                    {(u.activo ?? true) ? "Activo" : "Inactivo"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.pages > 1 && <p className="text-xs" style={{ color: K.muted }}>Página 1 de {data.pages}. (Paginación + búsqueda en fase siguiente.)</p>}
    </div>
  );
}
