import { seo } from "@/lib/seo";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { RouteError, RoutePending } from "@/components/RouteStates";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, ArrowRight, Inbox, MapPinned, Plus, Eye, Heart, Home, Building2, Store, MapPin, Camera, X, Bed, Bath, Car, Maximize2,
  Globe2, ClipboardList, Trophy, Search, Info, TrendingUp, UserPlus, CalendarClock, Calendar, Users, Lock, CheckCircle, XCircle,
  History, Flame, Clock, Phone, Mail, Check, KeyRound, Sun, ShieldCheck, TrainFront, BarChart2, Sparkles, Briefcase, User,
} from "@/lib/icons";
import { PieChart, Pie, Cell } from "recharts";
import { apiFetch } from "@/lib/apiClient";
import { API_ENDPOINTS } from "@/config/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ResumenTab } from "./ResumenTab";
import { ComparadorTab } from "./ComparadorTab";
import { SimuladorTab } from "./SimuladorTab";
import { C } from "./_kit";
import { Avatar, EmptyBlock, FilterTabs, IconChip, KpiCard, KpiGrid, MetricCell, MiniRing, PageHeader, Panel, Pill, Steps, TONE, type Tone } from "./-ui";
import { formatCOP } from "@/lib/format";
import { LanguageToggle, Name } from "@/lib/i18n";
import {
  datosMinimosCompletos,
  realtorApi,
  type Agenda,
  type EstadoListing,
  type Franja,
  type ItemAsignado,
  type ItemPool,
  type MiListing,
  type RoiZona,
  type VisitaSolicitud,
  type ZonaNivel,
} from "@/lib/realtorApi";
import { toast } from "sonner";
import {
  useAceptarAsignado,
  useActualizarVisita,
  useAgenda,
  useDesempeno,
  useDueDiligence,
  useInteligenciaBarrio,
  useMisListings,
  usePublicarAsignado,
  useRealtorAsignados,
  useRealtorPerfil,
  useRealtorPool,
  useEditarListing,
  useTomarDelPool,
  useVerificarDDItem,
  useCerrarListing,
  useCambiarEstadoListing,
  useEliminarListing,
  useComparables,
} from "@/hooks/useRealtorDashboard";

export const Route = createFileRoute("/realtor/dashboard")({
  errorComponent: RouteError,
  pendingComponent: RoutePending,
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem("medellin-social.user");
    if (!raw) throw redirect({ to: "/login" });
  },
  component: RealtorDashboardPage,
  head: () => seo({ title: "Panel del agente · Medellín Social", description: "Tus leads, zonas y propiedades.", noindex: true }),
});

// ── Secciones ────────────────────────────────────────────────────────────────
// Reorg 10 tabs → 5 secciones. Las secciones con varias vistas usan sub-nav
// (SubNav) en vez de tabs de primer nivel. Dedup: Desempeño muere (dup de Inicio),
// Resultados/Inteligencia/Comparador → Mercado, Inbox+Agenda → Bandeja.

// Verde oscuro para texto blanco sobre color: C.brand (#0F8A4F) sobre blanco da 4.4:1
// (falla AA texto normal); #0C7A45 da 5.4:1 → pasa AA. Usado en sub-nav/badges activos.
const BRAND_DEEP = "#0C7A45";

type Section = "inicio" | "listings" | "bandeja" | "mercado" | "herramientas";

// Navegación entre secciones desde cualquier hijo (p.ej. "Reportar un cierre" en
// Mercado lleva a Mis listings).
const GoToSection = createContext<(s: Section) => void>(() => {});

const SECTIONS: { id: Section; label: string }[] = [
  { id: "inicio",       label: "Inicio" },
  { id: "listings",     label: "Mis listings" },
  { id: "bandeja",      label: "Bandeja y agenda" },
  { id: "mercado",      label: "Mercado" },
  { id: "herramientas", label: "Herramientas" },
];

// Deep-link: ids viejos de ?tab= → sección nueva (no romper enlaces del navbar/listing).
const TAB_TO_SECTION: Record<string, Section> = {
  resumen: "inicio", desempeno: "inicio",
  listings: "listings",
  inbox: "bandeja", agenda: "bandeja",
  resultados: "mercado", inteligencia: "mercado",
  simulador: "herramientas", comparador: "herramientas", config: "herramientas",
};

// El viejo ?tab= también fija el sub-tab de la sección (p.ej. /realtor/dashboard?tab=comparador
// debe abrir Mercado › Comparador, no la primera sub-vista). Lee el ?tab= actual una vez.
function tabParam(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("tab") ?? "";
}

function RealtorDashboardPage() {
  // Default "inicio" en el primer render (SSR y cliente coinciden → sin hydration
  // mismatch). El deep-link ?section= / ?tab= se aplica post-mount en el efecto.
  const [section, setSection] = useState<Section>("inicio");
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const raw = p.get("section") ?? p.get("tab") ?? "";
    if (SECTIONS.some((s) => s.id === raw)) setSection(raw as Section);
    else if (TAB_TO_SECTION[raw]) setSection(TAB_TO_SECTION[raw]);
  }, []);
  const { isError, error, isLoading } = useRealtorPerfil();

  // La cuenta logueada existe pero no tiene fila `agent` (backend responde 403
  // en /realtor/me y por extensión en todos los demás endpoints). Sin este
  // check el dashboard se ve "vacío": nav sin perfil + cajas de error sueltas
  // en cada sección, que es indistinguible de "no carga nada".
  const sinAgente = isError && /no es un agente/i.test(String((error as Error)?.message ?? ""));

  if (!isLoading && sinAgente) {
    return (
      <div className="paper-theme grid min-h-screen place-items-center bg-background px-4">
        <div className="max-w-sm text-center">
          <h1 className="text-lg font-semibold text-foreground">Esta cuenta no es un agente</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            El dashboard de realtor solo funciona para cuentas registradas como agente inmobiliario.
            Inicia sesión con tu cuenta de agente o solicita el registro.
          </p>
          <Link
            to="/map"
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            <ArrowLeft className="h-4 w-4" /> Volver al mapa
          </Link>
        </div>
      </div>
    );
  }

  const goTo = (s: Section) => {
    setSection(s);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <GoToSection.Provider value={goTo}>
    <div className="paper-theme min-h-screen bg-background">
      <RealtorNav section={section} onSection={setSection} />
      {/* scroll-mt-28: el foco no queda tapado por el header sticky (WCAG 2.2 SC 2.4.11). */}
      <main
        id={`panel-${section}`}
        role="tabpanel"
        aria-labelledby={`tab-${section}`}
        tabIndex={-1}
        className="mx-auto max-w-6xl scroll-mt-28 px-4 pb-20 pt-8 outline-none sm:px-6"
      >
        {section === "inicio"       && <InicioSection />}
        {section === "listings"     && <ListingsTab />}
        {section === "bandeja"      && <BandejaSection />}
        {section === "mercado"      && <MercadoSection />}
        {section === "herramientas" && <HerramientasSection />}
      </main>
    </div>
    </GoToSection.Provider>
  );
}

// ── Nav principal (tablist WAI-ARIA: flechas navegan, Home/End saltan) ─────────

function RealtorNav({ section, onSection }: { section: Section; onSection: (s: Section) => void }) {
  const { data: perfil } = useRealtorPerfil();
  const { data: asignados } = useRealtorAsignados();
  const { data: agenda } = useAgenda();

  const nuevos = asignados?.filter((a) => a.estado === "asignado").length ?? 0;
  const visitasPendientes = agenda?.visitas.filter((v) => v.estado === "pendiente").length ?? 0;
  const bandejaBadge = nuevos + visitasPendientes;
  const initials = perfil?.nombre.split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  const onKeyNav = (e: React.KeyboardEvent, idx: number) => {
    const n = SECTIONS.length;
    let next = idx;
    if (e.key === "ArrowRight") next = (idx + 1) % n;
    else if (e.key === "ArrowLeft") next = (idx - 1 + n) % n;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    else return;
    e.preventDefault();
    onSection(SECTIONS[next].id);
    document.getElementById(`tab-${SECTIONS[next].id}`)?.focus();
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <Link
            to="/map"
            className="inline-flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Mapa
          </Link>
          <span className="h-5 w-px bg-border" aria-hidden />
          <span className="truncate text-sm font-semibold text-foreground">Centro de agente</span>
        </div>

        {perfil && (
          <div className="flex shrink-0 items-center gap-3">
            <LanguageToggle />
            {perfil.estado === "pendiente" && (
              <span className="hidden text-xs text-warning sm:block">Cuenta pendiente de aprobación</span>
            )}
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center overflow-hidden rounded-full border border-border bg-surface text-xs font-semibold text-foreground">
                {perfil.avatar
                  ? <img src={perfil.avatar} alt={perfil.nombre} className="h-full w-full object-cover" />
                  : initials}
              </div>
              <div className="hidden md:block">
                <div className="text-sm font-medium leading-tight text-foreground"><Name>{perfil.nombre}</Name></div>
                {perfil.zonas_patrocinadas.length > 0 && (
                  <div className="text-[11px] leading-tight text-muted-foreground">
                    {perfil.zonas_patrocinadas.map((z) => z.nombre).join(" · ")}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <nav className="mx-auto max-w-6xl overflow-x-auto px-4 sm:px-6">
        <div role="tablist" aria-label="Secciones del dashboard" className="flex gap-6">
          {SECTIONS.map(({ id, label }, idx) => {
            const active = section === id;
            const badge = id === "bandeja" ? bandejaBadge : 0;
            return (
              <button
                key={id}
                id={`tab-${id}`}
                role="tab"
                aria-selected={active}
                aria-controls={`panel-${id}`}
                tabIndex={active ? 0 : -1}
                onClick={() => onSection(id)}
                onKeyDown={(e) => onKeyNav(e, idx)}
                className={`relative flex min-h-[44px] shrink-0 items-center gap-1.5 border-b-2 pt-1 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                  active
                    ? "border-primary font-semibold text-foreground"
                    : "border-transparent font-medium text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
                {badge > 0 && (
                  <span
                    className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground"
                    aria-label={`${badge} pendientes`}
                  >
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </header>
  );
}

// ── Sub-nav accesible (tablist secundario dentro de una sección) ──────────────

function SubNav<T extends string>({ value, onChange, items, label }: {
  value: T; onChange: (v: T) => void; items: { id: T; label: string; badge?: number }[]; label: string;
}) {
  const onKeyNav = (e: React.KeyboardEvent, idx: number) => {
    const n = items.length;
    let next = idx;
    if (e.key === "ArrowRight") next = (idx + 1) % n;
    else if (e.key === "ArrowLeft") next = (idx - 1 + n) % n;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    else return;
    e.preventDefault();
    onChange(items[next].id);
    document.getElementById(`subtab-${items[next].id}`)?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className="mb-6 flex flex-wrap gap-2">
      {items.map(({ id, label: lbl, badge }, idx) => {
        const active = value === id;
        return (
          <button
            key={id}
            id={`subtab-${id}`}
            role="tab"
            aria-selected={active}
            aria-controls={`subpanel-${id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(id)}
            onKeyDown={(e) => onKeyNav(e, idx)}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            style={active
              ? { background: BRAND_DEEP, color: "#fff" }   // #0C7A45: blanco pasa AA (5.4:1)
              : { background: C.soft, color: C.sub, border: `1px solid ${C.line}` }}
          >
            {lbl}
            {badge != null && badge > 0 && (
              <span
                className="rounded-full px-1.5 text-[10px] font-bold"
                style={active ? { background: "rgba(255,255,255,.25)" } : { background: BRAND_DEEP, color: "#fff" }}
                aria-label={`${badge} pendientes`}
              >
                {badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Sección: Inicio (alertas de hoy + resumen) ────────────────────────────────

function InicioSection() {
  return (
    <div className="flex flex-col gap-6">
      <AlertasHoy />
      <ResumenTab />
    </div>
  );
}

// "Qué hacer hoy": alertas accionables derivadas de datos ya cargados (sin backend).
// Cada alerta enlaza a la sección donde se resuelve.
function AlertasHoy() {
  const { data: asignados } = useRealtorAsignados();
  const { data: agenda } = useAgenda();
  const { data: listings } = useMisListings();

  const sinResponder = asignados?.filter((a) => a.estado === "asignado").length ?? 0;
  const hoy = new Date().toISOString().slice(0, 10);
  const visitasHoy = agenda?.visitas.filter(
    (v) => v.estado === "pendiente" || (v.fecha_visita?.slice(0, 10) === hoy),
  ).length ?? 0;
  const borradores = listings?.filter((l) => l.estado === "borrador").length ?? 0;
  const rechazados = listings?.filter((l) => l.estado === "rechazado").length ?? 0;

  const alertas: { icon: string; texto: string }[] = [];
  if (sinResponder > 0) alertas.push({ icon: "📩", texto: `${sinResponder} ${sinResponder === 1 ? "cliente nuevo sin responder" : "clientes nuevos sin responder"} — acéptalos antes de que vuelvan al pool` });
  if (visitasHoy > 0) alertas.push({ icon: "📅", texto: `${visitasHoy} ${visitasHoy === 1 ? "visita por confirmar/atender" : "visitas por confirmar/atender"}` });
  if (borradores > 0) alertas.push({ icon: "✏️", texto: `${borradores} ${borradores === 1 ? "borrador sin publicar" : "borradores sin publicar"}` });
  if (rechazados > 0) alertas.push({ icon: "⚠️", texto: `${rechazados} ${rechazados === 1 ? "listing rechazado" : "listings rechazados"} — corrígelos y vuelve a publicar` });

  if (alertas.length === 0) {
    return (
      <div className="rounded-2xl p-4 text-[13px]" style={{ background: C.soft, border: `1px solid ${C.line}`, color: C.sub }}>
        ✅ <strong style={{ color: C.ink }}>Todo al día.</strong> No hay pendientes urgentes hoy.
      </div>
    );
  }
  return (
    <section aria-labelledby="alertas-hoy-h" className="rounded-2xl p-5" style={{ background: C.card, border: `1px solid ${C.line}` }}>
      <h2 id="alertas-hoy-h" className="mb-3 text-[13px] font-semibold tracking-tight" style={{ color: C.ink }}>Qué hacer hoy</h2>
      <ul className="flex flex-col gap-2">
        {alertas.map((a, i) => (
          <li key={i} className="flex items-start gap-2.5 text-[13px]" style={{ color: C.ink }}>
            <span aria-hidden className="mt-px">{a.icon}</span>
            <span>{a.texto}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Sección: Bandeja y agenda ─────────────────────────────────────────────────
// Organizada por QUIÉN te busca, no por tipo de dato:
//   · Propietarios — quieren que vendas/arriendes su inmueble (captación).
//   · Visitas      — compradores que pidieron ver un inmueble (agenda).
//   · Interesados  — guardaron tus listings en favoritos (seguimiento).
// Arriba, los pendientes de hoy como KPIs que llevan a cada pestaña.

type BandejaSub = "propietarios" | "visitas" | "interesados";

function horaVisita(v: VisitaSolicitud): number {
  return v.fecha_visita ? new Date(v.fecha_visita).getTime() : Number.POSITIVE_INFINITY;
}
function slaVencido(v: VisitaSolicitud): boolean {
  const limite = v.es_pro ? 4 : 24;
  return v.horas_pendiente != null && v.horas_pendiente >= limite;
}

function BandejaSection() {
  const { data: asignados } = useRealtorAsignados();
  const { data: agenda } = useAgenda();
  const nuevos = asignados?.filter((a) => a.estado === "asignado").length ?? 0;
  const enProceso = asignados?.filter((a) => a.estado !== "asignado").length ?? 0;
  const visitas = agenda?.visitas ?? [];
  const pendientes = visitas.filter((v) => v.estado === "pendiente");
  const vencidas = pendientes.filter(slaVencido).length;
  const ahora = Date.now();
  const confirmadas = visitas.filter((v) => v.estado === "confirmada");
  const proximas = confirmadas
    .filter((v) => Number.isFinite(horaVisita(v)) && horaVisita(v) >= ahora - 3_600_000)
    .sort((a, b) => horaVisita(a) - horaVisita(b));
  const interesados = agenda?.interesados.length ?? 0;

  const [sub, setSub] = useState<BandejaSub>(() => {
    const t = tabParam();
    return t === "agenda" ? "visitas" : t === "interesados" ? "interesados" : "propietarios";
  });

  const siguiente = proximas[0]?.fecha_visita
    ? new Date(proximas[0].fecha_visita).toLocaleString("es-CO", { weekday: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <div>
      <PageHeader
        title="Bandeja y agenda"
        subtitle="Todo lo que espera tu respuesta: propietarios que quieren publicar contigo y compradores que quieren conocer tus inmuebles."
      />

      <KpiGrid>
        <KpiCard icon={UserPlus} tone="brand" label="Propietarios nuevos" value={nuevos}
          hint={nuevos > 0 ? "esperan que los aceptes" : `${enProceso} en proceso`}
          active={sub === "propietarios"} onClick={() => setSub("propietarios")} />
        <KpiCard icon={CalendarClock} tone={vencidas > 0 ? "bad" : "warn"} label="Visitas por confirmar" value={pendientes.length}
          hint={vencidas > 0 ? `${vencidas} fuera de tiempo de respuesta` : "a tiempo"}
          active={sub === "visitas"} onClick={() => setSub("visitas")} />
        <KpiCard icon={Calendar} tone="info" label="Visitas confirmadas" value={confirmadas.length}
          hint={siguiente ? `la siguiente: ${siguiente}` : confirmadas.length > 0 ? "ninguna programada a futuro" : "sin visitas confirmadas"}
          onClick={() => setSub("visitas")} />
        <KpiCard icon={Heart} tone="violet" label="Interesados" value={interesados}
          hint="guardaron tus listings"
          active={sub === "interesados"} onClick={() => setSub("interesados")} />
      </KpiGrid>

      <SubNav
        label="Bandeja y agenda"
        value={sub}
        onChange={setSub}
        items={[
          { id: "propietarios", label: "Propietarios", badge: nuevos },
          { id: "visitas", label: "Visitas", badge: pendientes.length },
          { id: "interesados", label: "Interesados" },
        ]}
      />
      <div id={`subpanel-${sub}`} role="tabpanel" aria-labelledby={`subtab-${sub}`}>
        {sub === "propietarios" && <InboxTab />}
        {sub === "visitas" && <AgendaTab />}
        {sub === "interesados" && <InteresadosTab />}
      </div>
    </div>
  );
}

// ── Sección: Mercado (Zonas de interés + Inteligencia + Comparador) ────────────

function MercadoSection() {
  const [sub, setSub] = useState<"zonas" | "inteligencia">(() => (tabParam() === "inteligencia" ? "inteligencia" : "zonas"));
  return (
    <div>
      <SubNav
        label="Mercado"
        value={sub}
        onChange={setSub}
        items={[
          { id: "zonas", label: "Zonas de interés" },
          { id: "inteligencia", label: "Inteligencia" },
        ]}
      />
      <div id={`subpanel-${sub}`} role="tabpanel" aria-labelledby={`subtab-${sub}`}>
        {sub === "zonas" ? <ResultadosTab /> : <InteligenciaTab />}
      </div>
    </div>
  );
}

// ── Sección: Herramientas (Simulador + Servicios) ─────────────────────────────

function HerramientasSection() {
  const [sub, setSub] = useState<"simulador" | "comparador" | "servicios">(() => {
    const t = tabParam();
    return t === "comparador" ? "comparador" : t === "config" ? "servicios" : "simulador";
  });
  return (
    <div>
      <SubNav
        label="Herramientas"
        value={sub}
        onChange={setSub}
        items={[
          { id: "simulador", label: "Simulador" },
          { id: "comparador", label: "Comparador" },
          { id: "servicios", label: "Servicios" },
        ]}
      />
      <p className="-mt-2 mb-5 text-[13px]" style={{ color: C.sub }}>
        {sub === "simulador" && "Proyecta la rentabilidad de una inversión en cualquier barrio para mostrársela a tu cliente."}
        {sub === "comparador" && "Pon hasta 4 barrios lado a lado: rentabilidad, precio, seguridad y ubicación."}
        {sub === "servicios" && "Tu perfil público, el horario en que aceptas visitas y las zonas que patrocinas."}
      </p>
      <div id={`subpanel-${sub}`} role="tabpanel" aria-labelledby={`subtab-${sub}`}>
        {sub === "simulador" && <SimuladorTab />}
        {sub === "comparador" && <ComparadorTab />}
        {sub === "servicios" && <ConfiguracionTab />}
      </div>
    </div>
  );
}

// ══ Propietarios (captación) — lista | detalle ══════════════════════════════════

type LeadItem =
  | { kind: "asignado"; id: string; data: ItemAsignado }
  | { kind: "pool"; id: string; data: ItemPool };

type LeadFilter = "todos" | "nuevos" | "proceso" | "pool";

// Etapas del flujo de captación — el stepper del detalle y la barrita de la lista.
const LEAD_STEPS = ["Aceptar", "Documentos", "Ficha", "Publicar"];

function leadEtapa(lead: LeadItem): { step: number; tone: Tone; txt: string } {
  if (lead.kind === "pool") return { step: 0, tone: "info", txt: "Disponible en pool" };
  const a = lead.data;
  if (a.estado === "asignado") return { step: 0, tone: "brand", txt: "Nuevo · requiere respuesta" };
  if (!a.due_diligence.documentos_completos) return { step: 1, tone: "warn", txt: "Verificando documentos" };
  const c = a.listing ? datosMinimosCompletos(a.listing) : null;
  if (c && !c.ok) return { step: 2, tone: "warn", txt: "Ficha incompleta" };
  return { step: 3, tone: "brand", txt: "Listo para publicar" };
}

function InboxTab() {
  const { data: asignados, isLoading: loadA, isError: errA } = useRealtorAsignados();
  const { data: pool, isLoading: loadP } = useRealtorPool();

  const [filtro, setFiltro] = useState<LeadFilter>("todos");
  const [busqueda, setBusqueda] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const leads = useMemo<LeadItem[]>(() => {
    const a: LeadItem[] = (asignados ?? []).map((x) => ({ kind: "asignado", id: x.id, data: x }));
    const p: LeadItem[] = (pool ?? []).map((x) => ({ kind: "pool", id: x.id, data: x }));
    const rank = (l: LeadItem) =>
      l.kind === "pool" ? 2 : l.data.estado === "asignado" ? 0 : 1;
    return [...a, ...p].sort((x, y) =>
      rank(x) !== rank(y) ? rank(x) - rank(y) : y.data.created_at.localeCompare(x.data.created_at),
    );
  }, [asignados, pool]);

  const cuenta = useMemo(() => ({
    todos: leads.length,
    nuevos: leads.filter((l) => l.kind === "asignado" && l.data.estado === "asignado").length,
    proceso: leads.filter((l) => l.kind === "asignado" && l.data.estado !== "asignado").length,
    pool: leads.filter((l) => l.kind === "pool").length,
  }), [leads]);

  const visibles = useMemo(() => {
    let out = leads;
    if (filtro === "nuevos")  out = out.filter((l) => l.kind === "asignado" && l.data.estado === "asignado");
    if (filtro === "proceso") out = out.filter((l) => l.kind === "asignado" && l.data.estado !== "asignado");
    if (filtro === "pool")    out = out.filter((l) => l.kind === "pool");
    const q = busqueda.trim().toLowerCase();
    if (q) {
      out = out.filter((l) => {
        const d = l.data;
        const owner = l.kind === "asignado" ? l.data.owner_nombre : "";
        return `${d.barrio} ${d.municipio} ${d.tipo_inmueble} ${owner}`.toLowerCase().includes(q);
      });
    }
    return out;
  }, [leads, filtro, busqueda]);

  const selected = visibles.find((l) => l.id === selectedId) ?? null;
  const loading = loadA || loadP;

  if (loading) {
    return (
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <SkeletonRows n={5} />
        <Skeleton className="hidden h-96 rounded-2xl lg:block" />
      </div>
    );
  }

  if (errA) return <SectionError msg="No se pudieron cargar los inmuebles asignados." />;

  return (
    <div>
      <p className="mb-4 text-[13px]" style={{ color: C.sub }}>
        Propietarios de tu zona que quieren publicar su inmueble contigo. Acéptalos, verifica documentos, completa la ficha y publica.
      </p>
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        {/* Lista */}
        <div className={`${selected ? "hidden lg:block" : ""}`}>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: C.muted }} />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por barrio u owner"
              className={`${inputCls} rounded-xl pl-9`}
              aria-label="Buscar leads"
            />
          </div>
          <div className="mt-3">
            <FilterTabs
              label="Filtrar propietarios"
              value={filtro}
              onChange={setFiltro}
              options={[
                { v: "todos", label: "Todos", n: cuenta.todos },
                { v: "nuevos", label: "Nuevos", n: cuenta.nuevos },
                { v: "proceso", label: "En proceso", n: cuenta.proceso },
                { v: "pool", label: "Pool", n: cuenta.pool },
              ]}
            />
          </div>

          <div className="mt-3 overflow-hidden rounded-2xl" style={{ background: C.card, border: `1px solid ${C.line}` }}>
            {visibles.length === 0 && (
              <div className="px-4 py-12 text-center">
                <Inbox className="mx-auto h-5 w-5" style={{ color: C.muted, opacity: 0.5 }} />
                <p className="mx-auto mt-2 max-w-[240px] text-sm" style={{ color: C.muted }}>
                  {filtro === "pool"
                    ? "El pool está vacío por ahora."
                    : "Sin propietarios en esta vista. Cuando alguien publique en tu zona, aparecerá aquí."}
                </p>
              </div>
            )}
            {visibles.map((l, i) => (
              <LeadListRow
                key={l.id}
                lead={l}
                active={l.id === selectedId}
                first={i === 0}
                onClick={() => setSelectedId(l.id)}
              />
            ))}
          </div>
        </div>

        {/* Detalle */}
        <div className={`${selected ? "" : "hidden lg:block"}`}>
          {selected ? (
            <LeadDetail lead={selected} onBack={() => setSelectedId(null)} />
          ) : (
            <div className="grid h-full min-h-[360px] place-items-center rounded-2xl border border-dashed" style={{ borderColor: C.line, background: C.card }}>
              <div className="max-w-xs px-6 text-center">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl" style={{ background: C.soft, color: C.muted }}>
                  <Inbox className="h-5 w-5" />
                </span>
                <p className="mt-3 text-[14px] font-semibold" style={{ color: C.ink }}>Selecciona un propietario</p>
                <p className="mt-1 text-[12.5px]" style={{ color: C.muted }}>Verás su inmueble, lo que declaró y el siguiente paso para publicarlo.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LeadListRow({
  lead,
  active,
  first,
  onClick,
}: {
  lead: LeadItem;
  active: boolean;
  first: boolean;
  onClick: () => void;
}) {
  const d = lead.data;
  const esNuevo = lead.kind === "asignado" && lead.data.estado === "asignado";
  const titulo = lead.kind === "asignado" ? lead.data.owner_nombre : "Pool abierto";
  const et = leadEtapa(lead);

  return (
    <button
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={`flex w-full gap-3 border-l-[3px] px-4 py-3.5 text-left transition ${active ? "" : "hover:bg-black/[0.02]"}`}
      style={{
        borderTop: first ? undefined : `1px solid ${C.line}`,
        borderLeftColor: active ? C.brand : "transparent",
        background: active ? TONE.brand.bg : esNuevo ? "#FBFDFB" : undefined,
      }}
    >
      {lead.kind === "asignado"
        ? <Avatar name={lead.data.owner_nombre} size={36} />
        : <IconChip icon={Users} tone="info" size={36} />}
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={`truncate text-[14px] ${esNuevo ? "font-bold" : "font-semibold"}`} style={{ color: C.ink }}>{titulo}</span>
          <span className="shrink-0 text-[11px]" style={{ color: C.muted }}>{relativeTime(d.created_at)}</span>
        </span>
        <span className="mt-0.5 block truncate text-[12.5px]" style={{ color: C.sub }}>
          <span className="capitalize">{d.tipo_inmueble}</span> en {d.barrio} · <span className="font-semibold tabular-nums" style={{ color: C.ink }}>{formatCOP(d.precio_esperado)}</span>
        </span>
        <span className="mt-2 flex items-center gap-2">
          <span className="flex flex-1 gap-1" aria-hidden>
            {LEAD_STEPS.map((s, i) => (
              <span key={s} className="h-1 flex-1 rounded-full"
                style={{ background: lead.kind === "pool" ? C.soft : i < et.step ? C.brand : i === et.step ? TONE[et.tone].solid : C.soft }} />
            ))}
          </span>
          <span className="shrink-0 text-[11px] font-semibold" style={{ color: TONE[et.tone].fg }}>{et.txt}</span>
        </span>
      </span>
    </button>
  );
}

// Estado como pill con tono.
function LeadStatus({ lead }: { lead: LeadItem }) {
  const et = leadEtapa(lead);
  return <Pill tone={et.tone} dot>{et.txt}</Pill>;
}

// ── Detalle del lead ───────────────────────────────────────────────────────────

function LeadDetail({ lead, onBack }: { lead: LeadItem; onBack: () => void }) {
  const publicar = usePublicarAsignado();
  const aceptar  = useAceptarAsignado();
  const tomar    = useTomarDelPool();
  const [editandoFicha, setEditandoFicha] = useState(false);

  const d = lead.data;
  const asignado = lead.kind === "asignado" ? lead.data : null;
  const esNuevo = asignado?.estado === "asignado";
  const ddOk = asignado?.due_diligence.documentos_completos ?? false;
  const completeness = asignado?.listing ? datosMinimosCompletos(asignado.listing) : null;
  const et = leadEtapa(lead);

  let nextStep: { titulo: string; texto: string; accion?: { label: string; run: () => void; pending: boolean } };
  if (lead.kind === "pool") {
    nextStep = {
      titulo: "Tómalo antes que otro agente",
      texto: "Inmueble en pool abierto: el primer agente que lo tome se lo queda.",
      accion: { label: tomar.isPending ? "Tomando…" : "Tomar inmueble", run: () => tomar.mutate(d.id), pending: tomar.isPending },
    };
  } else if (esNuevo) {
    nextStep = {
      titulo: "Acepta al propietario",
      texto: "Acepta este inmueble para iniciar la verificación de documentos.",
      accion: { label: aceptar.isPending ? "Aceptando…" : "Aceptar inmueble", run: () => aceptar.mutate(d.id), pending: aceptar.isPending },
    };
  } else if (!ddOk) {
    nextStep = { titulo: "Verifica los documentos", texto: "Verifica con el propietario los documentos pendientes." };
  } else if (completeness && !completeness.ok) {
    nextStep = {
      titulo: "Completa la ficha",
      texto: "Documentos al día. Completa la ficha para poder publicar.",
      accion: { label: "Completar ficha", run: () => setEditandoFicha(true), pending: false },
    };
  } else {
    nextStep = {
      titulo: "Listo para publicar",
      texto: "Todo listo. Al publicar, aparece en el mapa al instante.",
      accion: { label: publicar.isPending ? "Publicando…" : "Publicar listing", run: () => publicar.mutate(d.id), pending: publicar.isPending },
    };
  }

  const specs = asignado
    ? [
        asignado.declarado.area_m2 && { icon: Maximize2, txt: `${asignado.declarado.area_m2} m²` },
        asignado.declarado.habitaciones != null && { icon: Bed, txt: `${asignado.declarado.habitaciones} hab` },
        asignado.declarado.banos != null && { icon: Bath, txt: `${asignado.declarado.banos} baños` },
      ].filter(Boolean) as { icon: typeof Bed; txt: string }[]
    : [];

  return (
    <div className="overflow-hidden rounded-2xl" style={{ background: C.card, border: `1px solid ${C.line}`, boxShadow: "0 1px 2px rgba(17,20,24,0.04)" }}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 py-4" style={{ borderBottom: `1px solid ${C.line}` }}>
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={onBack}
            className="shrink-0 rounded-xl p-1.5 transition hover:opacity-70 lg:hidden"
            style={{ border: `1px solid ${C.line}`, color: C.muted }}
            aria-label="Volver a la lista"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          {asignado ? <Avatar name={asignado.owner_nombre} size={44} /> : <IconChip icon={Users} tone="info" size={44} />}
          <div className="min-w-0">
            <h2 className="truncate text-[17px] font-bold" style={{ color: C.ink }}>
              {asignado ? asignado.owner_nombre : "Inmueble del pool"}
            </h2>
            <p className="text-[12px]" style={{ color: C.muted }}>
              {lead.kind === "pool" ? "Zona sin patrocinador" : "Asignado por tu zona"} · recibido {relativeTime(d.created_at)}
            </p>
          </div>
        </div>
        <LeadStatus lead={lead} />
      </div>

      {/* Progreso + siguiente paso */}
      <div className="space-y-4 px-5 py-4" style={{ borderBottom: `1px solid ${C.line}`, background: "#FCFBF8" }}>
        {lead.kind === "asignado" && <Steps steps={LEAD_STEPS} current={et.step} />}
        <div
          className="flex flex-col gap-3 rounded-xl p-4 sm:flex-row sm:items-center sm:justify-between"
          style={{ background: TONE[et.tone].bg, boxShadow: `inset 0 0 0 1px ${TONE[et.tone].line}` }}
        >
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: TONE[et.tone].fg }}>Siguiente paso</div>
            <div className="mt-0.5 text-[14px] font-semibold" style={{ color: C.ink }}>{nextStep.titulo}</div>
            <p className="text-[12.5px]" style={{ color: C.sub }}>{nextStep.texto}</p>
          </div>
          {nextStep.accion && (
            <button
              onClick={nextStep.accion.run}
              disabled={nextStep.accion.pending}
              className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl px-4 text-[13px] font-bold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
              style={{ background: C.brand }}
            >
              {nextStep.accion.label} <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-5 px-5 py-5 md:grid-cols-2">
        {/* Propiedad */}
        <section className="rounded-xl p-4" style={{ background: C.soft }}>
          <h3 className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>Propiedad</h3>
          <div className="mt-2 text-[24px] font-bold tabular-nums tracking-tight" style={{ color: C.ink }}>
            {formatCOP(d.precio_esperado)}
          </div>
          <p className="text-[12px] capitalize" style={{ color: C.muted }}>{d.operacion}</p>
          <p className="mt-2 flex items-center gap-1 text-[13px]" style={{ color: C.ink }}>
            <MapPin className="h-3.5 w-3.5" style={{ color: C.muted }} />
            <span><span className="capitalize">{d.tipo_inmueble}</span> en {d.barrio}, {d.municipio}</span>
          </p>
          {asignado && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {specs.length === 0 && <span className="text-[12px]" style={{ color: C.muted }}>Sin características declaradas</span>}
              {specs.map(({ icon: Icon, txt }) => (
                <span key={txt} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-medium" style={{ background: C.card, color: C.ink }}>
                  <Icon className="h-3.5 w-3.5" style={{ color: C.muted }} />{txt}
                </span>
              ))}
            </div>
          )}
        </section>

        {/* Declarado por el propietario */}
        <section className="rounded-xl p-4" style={{ border: `1px solid ${C.line}` }}>
          <h3 className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>Declarado por el propietario</h3>
          {asignado ? (
            <ul className="mt-2 divide-y" style={{ borderColor: C.line }}>
              <DeclaradoItem label="Escritura" value={asignado.declarado.tiene_escritura} />
              <DeclaradoItem label="Predial al día" value={asignado.declarado.al_dia_predial} />
              <DeclaradoItem label="Administración al día" value={asignado.declarado.al_dia_administracion} />
              <DeclaradoItem label="Sin hipoteca" value={asignado.declarado.tiene_hipoteca == null ? null : !asignado.declarado.tiene_hipoteca} />
            </ul>
          ) : (
            <p className="mt-3 flex items-start gap-2 text-[13px]" style={{ color: C.sub }}>
              <Lock className="mt-0.5 h-4 w-4 shrink-0" style={{ color: C.muted }} />
              Los datos del propietario se revelan al tomar el inmueble.
            </p>
          )}
        </section>

        {/* Due diligence interactiva: el realtor verifica item por item */}
        {asignado && !esNuevo && !ddOk && (
          <DDChecklistSection intakeId={asignado.id} />
        )}

        {asignado && ddOk && completeness && !completeness.ok && asignado.listing && (
          <section className="md:col-span-2">
            <h3 className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>Campos de la ficha por completar</h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {completeness.faltan.map((f) => (
                <Pill key={f} tone="warn">{f}</Pill>
              ))}
            </div>
          </section>
        )}
      </div>

      {editandoFicha && asignado?.listing && (
        <EditorFichaModal
          listing={{
            id: asignado.listing.id,
            titulo: asignado.listing.titulo ?? "",
            tipo_inmueble: asignado.listing.tipo_inmueble ?? "apartamento",
            operacion: asignado.listing.operacion ?? "venta",
            precio: asignado.listing.precio ?? 0,
            barrio: asignado.listing.barrio ?? "",
            estado: "borrador",
            updated_at: new Date().toISOString(),
            vistas_total: 0, vistas_30d: 0, favoritos: 0,
            es_propio: false, cover_url: null,
            descripcion: null,
            area_m2: asignado.listing.area_m2,
            habitaciones: asignado.listing.habitaciones,
            banos: asignado.listing.banos,
            parqueaderos: null, estrato: null, antiguedad_anios: null,
            direccion_aprox: null, nombre_edificio: null, administracion: null,
            amenidades: [], lat: null, lon: null,
          }}
          onClose={() => setEditandoFicha(false)}
        />
      )}
    </div>
  );
}

// ── Editor de ficha (modal compartido: inbox + mis listings) ───────────────────

const EDITOR_TIPO_OPTS: { v: string; l: string }[] = [
  { v: "apartamento", l: "Apartamento" }, { v: "casa", l: "Casa" }, { v: "local", l: "Local" },
  { v: "oficina", l: "Oficina" }, { v: "lote", l: "Lote" }, { v: "finca", l: "Finca" },
];
// Vocabulario de amenidades (int + ext) reusado de /publicar. Se duplica aquí a
// propósito: importar desde publicar.tsx arrastraría su módulo mapbox de 1900 líneas.
const EDITOR_AMENIDADES: string[] = [
  "Balcón/terraza", "Depósito", "Cuarto de servicio", "Estudio", "Cocina integral",
  "Walk-in closet", "Chimenea", "Jacuzzi", "Piscina", "Gimnasio", "Salón comunal",
  "Portería 24h", "Vigilancia", "CCTV", "Zonas verdes", "Parque infantil", "BBQ", "Cancha deportiva",
];

// Editor de ficha COMPLETO: todos los campos que el backend (ListingPatchRequest)
// acepta, pre-llenados con los valores actuales del listing. ponytail: el pin
// (lat/lon) se deja fuera — editar la ubicación exacta necesita el mapa de /publicar;
// aquí se edita la dirección aproximada (texto). Subir pin picker si se pide.
function EditorFichaModal({ listing, onClose }: { listing: MiListing; onClose: () => void }) {
  const editar = useEditarListing();
  const num = (n: number | null | undefined) => (n != null ? String(n) : "");
  const [titulo, setTitulo] = useState(listing.titulo ?? "");
  const [tipo, setTipo] = useState<string>(listing.tipo_inmueble ?? "");
  const [precio, setPrecio] = useState(num(listing.precio));
  const [admin, setAdmin] = useState(num(listing.administracion));
  const [area, setArea] = useState(num(listing.area_m2));
  const [hab, setHab] = useState(num(listing.habitaciones));
  const [banos, setBanos] = useState(num(listing.banos));
  const [parqs, setParqs] = useState(num(listing.parqueaderos));
  const [estrato, setEstrato] = useState(num(listing.estrato));
  const [antiguedad, setAntiguedad] = useState(num(listing.antiguedad_anios));
  const [edificio, setEdificio] = useState(listing.nombre_edificio ?? "");
  const [direccion, setDireccion] = useState(listing.direccion_aprox ?? "");
  const [descripcion, setDescripcion] = useState(listing.descripcion ?? "");
  const [amenidades, setAmenidades] = useState<string[]>(listing.amenidades ?? []);
  const [fotos, setFotos] = useState<File[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const toggleAmen = (a: string) =>
    setAmenidades((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));

  const guardar = async () => {
    const campos: import("@/lib/realtorApi").ListingPatch = {};
    const asNum = (s: string) => (s.trim() === "" ? null : Number(s));
    const diffStr = (val: string, orig: string | null, key: keyof import("@/lib/realtorApi").ListingPatch) => {
      const v = val.trim();
      if (v !== (orig ?? "")) (campos as Record<string, unknown>)[key] = v;
    };
    const diffNum = (s: string, orig: number | null, key: keyof import("@/lib/realtorApi").ListingPatch) => {
      const v = asNum(s);
      if (v !== orig && v != null) (campos as Record<string, unknown>)[key] = v;
    };

    if (titulo.trim() && titulo.trim() !== (listing.titulo ?? "")) campos.titulo = titulo.trim();
    if (tipo && tipo !== listing.tipo_inmueble) campos.tipo_inmueble = tipo;
    if (precio && Number(precio) > 0 && Number(precio) !== listing.precio) campos.precio = Number(precio);
    diffNum(admin, listing.administracion, "administracion");
    diffNum(area, listing.area_m2, "area_m2");
    diffNum(hab, listing.habitaciones, "habitaciones");
    diffNum(banos, listing.banos, "banos");
    diffNum(parqs, listing.parqueaderos, "parqueaderos");
    diffNum(estrato, listing.estrato, "estrato");
    diffNum(antiguedad, listing.antiguedad_anios, "antiguedad_anios");
    diffStr(edificio, listing.nombre_edificio, "nombre_edificio");
    diffStr(direccion, listing.direccion_aprox, "direccion_aprox");
    diffStr(descripcion, listing.descripcion, "descripcion");
    if (JSON.stringify([...amenidades].sort()) !== JSON.stringify([...(listing.amenidades ?? [])].sort()))
      campos.amenidades = amenidades;

    if (Object.keys(campos).length === 0 && fotos.length === 0) {
      setErr("No hay cambios para guardar");
      return;
    }
    setErr(null);
    try {
      await editar.mutateAsync({ listingId: listing.id, campos, fotos });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo guardar");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label="Editar ficha del listing">
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="paper-theme relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border bg-background shadow-xl"
        style={{ borderColor: C.line }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: C.line }}>
          <div>
            <h3 className="text-base font-semibold text-foreground">Editar ficha</h3>
            <p className="text-xs capitalize text-muted-foreground">{listing.operacion} · {listing.barrio || "sin barrio"}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted/50 hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-5 overflow-y-auto px-5 py-5 sm:grid-cols-2">
          <FieldGroup title="Datos del aviso" cols={2}>
            <Field label="Título del aviso" className="sm:col-span-2">
              <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className={inputCls} placeholder="Apartamento en El Poblado con balcón" />
            </Field>
            <Field label="Tipo de inmueble">
              <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={inputCls}>
                {EDITOR_TIPO_OPTS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </Field>
            <Field label="Precio (COP)">
              <input inputMode="numeric" value={precio} onChange={(e) => setPrecio(e.target.value.replace(/\D/g, ""))} className={inputCls} />
            </Field>
            <Field label="Administración (COP/mes)">
              <input inputMode="numeric" value={admin} onChange={(e) => setAdmin(e.target.value.replace(/\D/g, ""))} className={inputCls} placeholder="opcional" />
            </Field>
          </FieldGroup>

          <FieldGroup title="Características">
            <Field label="Área (m²)">
              <input inputMode="numeric" value={area} onChange={(e) => setArea(e.target.value.replace(/\D/g, ""))} className={inputCls} />
            </Field>
            <Field label="Habitaciones">
              <input inputMode="numeric" value={hab} onChange={(e) => setHab(e.target.value.replace(/\D/g, ""))} className={inputCls} />
            </Field>
            <Field label="Baños">
              <input inputMode="numeric" value={banos} onChange={(e) => setBanos(e.target.value.replace(/\D/g, ""))} className={inputCls} />
            </Field>
            <Field label="Parqueaderos">
              <input inputMode="numeric" value={parqs} onChange={(e) => setParqs(e.target.value.replace(/\D/g, ""))} className={inputCls} />
            </Field>
            <Field label="Estrato">
              <select value={estrato} onChange={(e) => setEstrato(e.target.value)} className={inputCls}>
                <option value="">—</option>
                {["1", "2", "3", "4", "5", "6"].map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </Field>
            <Field label="Antigüedad (años)">
              <input inputMode="numeric" value={antiguedad} onChange={(e) => setAntiguedad(e.target.value.replace(/\D/g, ""))} className={inputCls} />
            </Field>
          </FieldGroup>

          <FieldGroup title="Ubicación" className="sm:col-span-2">
            <Field label="Nombre del edificio / unidad">
              <input value={edificio} onChange={(e) => setEdificio(e.target.value)} className={inputCls} placeholder="Torre Alción" />
            </Field>
            <Field label="Dirección aproximada">
              <input value={direccion} onChange={(e) => setDireccion(e.target.value)} className={inputCls} placeholder="Cra. 34 # 7 Sur" />
            </Field>
          </FieldGroup>

          <div className="sm:col-span-2">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Amenidades</h4>
            <div className="flex flex-wrap gap-2">
              {EDITOR_AMENIDADES.map((a) => {
                const on = amenidades.includes(a);
                return (
                  <button
                    key={a}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleAmen(a)}
                    className="inline-flex min-h-[32px] items-center rounded-full border px-3 text-xs font-medium transition"
                    style={on
                      ? { background: C.brand, borderColor: C.brand, color: "#fff" }
                      : { background: C.soft, borderColor: C.line, color: C.sub }}
                  >
                    {a}
                  </button>
                );
              })}
            </div>
          </div>

          <Field label="Descripción" className="sm:col-span-2">
            <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className={`${inputCls} min-h-24 resize-y`} placeholder="Describe el inmueble, el sector y lo que lo hace especial." />
          </Field>

          <div className="sm:col-span-2">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Agregar fotos {fotos.length > 0 && <span className="text-foreground">({fotos.length} seleccionadas)</span>}
            </h4>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => setFotos(Array.from(e.target.files ?? []))}
              className="text-sm text-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground"
            />
            <p className="mt-1 text-xs text-muted-foreground">Se añaden a las existentes; la primera queda como portada.</p>
          </div>
        </div>

        {err && <p className="px-5 text-sm text-danger">{err}</p>}

        <div className="flex justify-end gap-2 border-t px-5 py-4" style={{ borderColor: C.line }}>
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground">
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={editar.isPending}
            className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            {editar.isPending ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldGroup({ title, className = "", cols = 3, children }: { title: string; className?: string; cols?: 2 | 3; children: React.ReactNode }) {
  return (
    <div className={className}>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      <div className={`grid grid-cols-2 gap-3 ${cols === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>{children}</div>
    </div>
  );
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`grid gap-1 text-xs text-muted-foreground ${className}`}>
      {label}
      {children}
    </label>
  );
}

// Etiquetas humanas de las claves del cuestionario legal
const DD_LABEL: Record<string, string> = {
  tiene_escritura: "Escritura",
  al_dia_predial: "Predial al día",
  al_dia_administracion: "Administración al día",
  tiene_hipoteca: "Hipoteca",
  en_propiedad_horizontal: "Propiedad horizontal",
  servicios_al_dia: "Servicios al día",
  estado_civil: "Estado civil",
  es_persona_juridica: "Persona jurídica",
};

function DDChecklistSection({ intakeId }: { intakeId: string }) {
  const { data, isLoading, isError } = useDueDiligence(intakeId);
  const verificar = useVerificarDDItem(intakeId);

  return (
    <section className="md:col-span-2">
      <h3 className="text-sm font-semibold" style={{ color: C.ink }}>Verificación de documentos</h3>
      <p className="mt-0.5 text-xs" style={{ color: C.muted }}>
        Revisa cada punto con el propietario. Con todo verificado, el listing recibe el sello.
      </p>

      {isLoading && <Skeleton className="mt-3 h-32 rounded-lg" />}
      {isError && <p className="mt-3 text-sm" style={{ color: C.bad }}>No se pudo cargar el checklist.</p>}

      {data && (
        <div className="mt-3 overflow-hidden rounded-xl" style={{ background: C.soft, border: `1px solid ${C.line}` }}>
          {data.items.map((item, i) => (
            <div
              key={item.id}
              className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between"
              style={i > 0 ? { borderTop: `1px solid ${C.line}` } : undefined}
            >
              <div className="min-w-0">
                <span className="text-sm" style={{ color: C.ink }}>{DD_LABEL[item.clave] ?? item.clave.replaceAll("_", " ")}</span>
                <span className="ml-2 text-xs" style={{ color: C.muted }}>
                  declaró: {item.declarado === true ? "sí" : item.declarado === false ? "no" : item.declarado ?? "sin dato"}
                </span>
                {item.nota && <span className="ml-2 text-xs italic" style={{ color: C.muted }}>“{item.nota}”</span>}
              </div>

              {item.estado === "pendiente" ? (
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => verificar.mutate({ itemId: item.id, estado: "verificado" })}
                    disabled={verificar.isPending}
                    className="rounded-xl px-3 py-1 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
                    style={{ background: C.brand }}
                  >
                    Verificado
                  </button>
                  <button
                    onClick={() => verificar.mutate({ itemId: item.id, estado: "rechazado" })}
                    disabled={verificar.isPending}
                    className="rounded-xl px-3 py-1 text-xs font-semibold transition hover:opacity-80 disabled:opacity-50"
                    style={{ border: `1px solid ${C.line}`, color: C.ink }}
                  >
                    Rechazar
                  </button>
                </div>
              ) : (
                <span className="inline-flex shrink-0 items-center gap-1.5 text-xs" style={{ color: item.estado === "verificado" ? C.good : C.bad }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: item.estado === "verificado" ? C.good : C.bad }} aria-hidden />
                  {item.estado === "verificado" ? "Verificado" : "Rechazado"}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function DeclaradoItem({ label, value }: { label: string; value: boolean | null }) {
  return (
    <li className="flex items-center justify-between gap-2 py-2 text-[13px]" style={{ borderColor: C.line }}>
      <span style={{ color: C.ink }}>{label}</span>
      {value === true  && <span className="inline-flex items-center gap-1 font-semibold" style={{ color: TONE.brand.fg }}><CheckCircle className="h-4 w-4" /> Sí</span>}
      {value === false && <span className="inline-flex items-center gap-1 font-semibold" style={{ color: TONE.bad.fg }}><XCircle className="h-4 w-4" /> No</span>}
      {value == null   && <span style={{ color: C.muted }}>Sin dato</span>}
    </li>
  );
}

// ══ Visitas — por confirmar · próximas (por día) · historial ═══════════════════

function AgendaTab() {
  const { data, isLoading, isError } = useAgenda();
  const actualizar = useActualizarVisita();

  if (isLoading) {
    return (
      <div className="grid gap-5 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }
  if (isError || !data) return <SectionError msg="No se pudo cargar tu agenda." />;

  return <AgendaBody data={data} actualizar={actualizar} />;
}

// Etiqueta de día relativa: Hoy / Mañana / "jue 17 jul".
function etiquetaDia(ms: number): string {
  if (!Number.isFinite(ms)) return "Sin fecha acordada";
  const d = new Date(ms);
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const dia = new Date(d); dia.setHours(0, 0, 0, 0);
  const diff = Math.round((dia.getTime() - hoy.getTime()) / 86_400_000);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Mañana";
  return d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "short" });
}

function AgendaBody({ data, actualizar }: { data: Agenda; actualizar: ReturnType<typeof useActualizarVisita> }) {
  const [verHistorial, setVerHistorial] = useState(false);
  const visitas = data.visitas;

  // Por confirmar: primero las vencidas, luego Pro, luego las más antiguas.
  const porConfirmar = visitas
    .filter((v) => v.estado === "pendiente")
    .sort((a, b) =>
      Number(slaVencido(b)) - Number(slaVencido(a))
      || Number(b.es_pro) - Number(a.es_pro)
      || a.created_at.localeCompare(b.created_at));

  const confirmadas = visitas
    .filter((v) => v.estado === "confirmada")
    .sort((a, b) => horaVisita(a) - horaVisita(b));
  const porDia = new Map<string, VisitaSolicitud[]>();
  for (const v of confirmadas) {
    const k = etiquetaDia(horaVisita(v));
    porDia.set(k, [...(porDia.get(k) ?? []), v]);
  }

  const historial = visitas
    .filter((v) => v.estado === "realizada" || v.estado === "cancelada" || v.estado === "no_asistio")
    .sort((a, b) => (b.fecha_visita ?? b.created_at).localeCompare(a.fecha_visita ?? a.created_at));
  const LIMIT = 5;
  const histVis = verHistorial ? historial : historial.slice(0, LIMIT);

  const props = (v: VisitaSolicitud) => ({
    visita: v,
    pending: actualizar.isPending && actualizar.variables?.id === v.id,
    onEstado: (estado: "confirmada" | "realizada" | "cancelada" | "no_asistio", resultado?: "interesado" | "oferta" | "descartado") =>
      actualizar.mutate({ id: v.id, estado, resultado }),
  });

  if (visitas.length === 0) {
    return (
      <EmptyBlock
        icon={Calendar}
        title="Aún no tienes solicitudes de visita"
        msg="Cuando alguien agende una visita a uno de tus inmuebles desde el mapa, aparecerá aquí para que la confirmes."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Panel
          icon={CalendarClock}
          tone={porConfirmar.some(slaVencido) ? "bad" : "warn"}
          title="Por confirmar"
          count={porConfirmar.length}
          subtitle="Responde rápido: Pro en menos de 4 h, el resto en menos de 24 h."
          flush
        >
          {porConfirmar.length === 0 ? (
            <p className="flex items-center gap-2 px-5 py-8 text-[13px]" style={{ color: C.muted }}>
              <CheckCircle className="h-4 w-4" style={{ color: C.good }} /> Todo confirmado. No hay solicitudes esperando respuesta.
            </p>
          ) : (
            porConfirmar.map((v, i) => <VisitaCard key={v.id} {...props(v)} first={i === 0} />)
          )}
        </Panel>

        <Panel icon={Calendar} tone="info" title="Visitas confirmadas" count={confirmadas.length} subtitle="Tu agenda, ordenada por fecha." flush>
          {confirmadas.length === 0 ? (
            <p className="px-5 py-8 text-[13px]" style={{ color: C.muted }}>No tienes visitas confirmadas por ahora.</p>
          ) : (
            [...porDia.entries()].map(([dia, items]) => (
              <div key={dia}>
                <div className="px-5 py-2 text-[11px] font-bold uppercase tracking-wide" style={{ background: C.soft, color: dia === "Hoy" ? TONE.brand.fg : C.muted, borderTop: `1px solid ${C.line}` }}>
                  {dia}
                </div>
                {items.map((v, i) => <VisitaCard key={v.id} {...props(v)} first={i === 0} />)}
              </div>
            ))
          )}
        </Panel>
      </div>

      {historial.length > 0 && (
        <Panel
          icon={History}
          title="Historial"
          count={historial.length}
          subtitle="Visitas realizadas, canceladas o a las que no asistieron."
          flush
          actions={historial.length > LIMIT ? (
            <button onClick={() => setVerHistorial((x) => !x)} className="text-[12px] font-semibold hover:underline" style={{ color: TONE.brand.fg }}>
              {verHistorial ? "Ver menos" : `Ver ${historial.length - LIMIT} más`}
            </button>
          ) : undefined}
        >
          {histVis.map((v, i) => {
            const e = VISITA_ESTADO[v.estado];
            return (
              <div key={v.id} className="flex flex-wrap items-center gap-3 px-5 py-3" style={i === 0 ? undefined : { borderTop: `1px solid ${C.line}` }}>
                <Avatar name={v.nombre} size={30} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold" style={{ color: C.ink }}><Name>{v.nombre}</Name></div>
                  <div className="truncate text-[12px]" style={{ color: C.muted }}>{v.listing_titulo}</div>
                </div>
                <span className="text-[12px] tabular-nums" style={{ color: C.sub }}>
                  {v.fecha_visita ? new Date(v.fecha_visita).toLocaleDateString("es-CO", { day: "numeric", month: "short" }) : "—"}
                </span>
                {v.resultado && <Pill tone={v.resultado === "oferta" ? "brand" : v.resultado === "interesado" ? "info" : "neutral"}>{RESULTADO_LABEL[v.resultado]}</Pill>}
                <Pill tone={e.tone} dot>{e.label}</Pill>
              </div>
            );
          })}
        </Panel>
      )}
    </div>
  );
}

const VISITA_ESTADO: Record<VisitaSolicitud["estado"], { label: string; tone: Tone }> = {
  pendiente:  { label: "Pendiente",  tone: "warn" },
  confirmada: { label: "Confirmada", tone: "brand" },
  realizada:  { label: "Realizada",  tone: "neutral" },
  cancelada:  { label: "Cancelada",  tone: "neutral" },
  no_asistio: { label: "No asistió", tone: "bad" },
};

const RESULTADO_LABEL: Record<NonNullable<VisitaSolicitud["resultado"]>, string> = {
  interesado: "Interesado",
  oferta: "Hará oferta",
  descartado: "Descartado",
};

// Calificación del lead (Zillow paso 2) — etiquetas legibles por campo.
const LEAD_LABELS = {
  intencion:   { vivir: "Para vivir", invertir: "Inversión" },
  presupuesto: { "<200M": "Hasta $200M", "200-500M": "$200–500M", "500-1000M": "$500M–1.000M", ">1000M": "+$1.000M" },
  plazo:       { ya: "Compra ya", "1-3m": "1–3 meses", "3-6m": "3–6 meses", explorando: "Explorando" },
  credito:     { contado: "De contado", aprobado: "Crédito aprobado", en_tramite: "Crédito en trámite", no: "Sin crédito" },
} as const;

function leadPills(v: VisitaSolicitud): string[] {
  const out: string[] = [];
  if (v.intencion)   out.push(LEAD_LABELS.intencion[v.intencion]);
  if (v.presupuesto) out.push(LEAD_LABELS.presupuesto[v.presupuesto]);
  if (v.plazo)       out.push(LEAD_LABELS.plazo[v.plazo]);
  if (v.credito)     out.push(LEAD_LABELS.credito[v.credito]);
  return out;
}

function VisitaCard({
  visita: v,
  first,
  pending,
  onEstado,
}: {
  visita: VisitaSolicitud;
  first: boolean;
  pending: boolean;
  onEstado: (estado: "confirmada" | "realizada" | "cancelada" | "no_asistio", resultado?: "interesado" | "oferta" | "descartado") => void;
}) {
  const [pidiendoResultado, setPidiendoResultado] = useState(false);
  const vencido = slaVencido(v);
  const fecha = v.fecha_visita
    ? new Date(v.fecha_visita).toLocaleString("es-CO", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
    : "Sin fecha propuesta";
  const hora = v.fecha_visita
    ? new Date(v.fecha_visita).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" })
    : null;

  const btn = "inline-flex min-h-[34px] items-center rounded-lg px-3 text-[12px] font-semibold transition hover:opacity-85 disabled:opacity-50";
  const ghost = { border: `1px solid ${C.line}`, color: C.ink, background: C.card };

  return (
    <div
      className="px-5 py-4"
      style={{
        borderTop: first ? undefined : `1px solid ${C.line}`,
        boxShadow: vencido ? `inset 3px 0 0 ${TONE.bad.solid}` : v.es_pro ? `inset 3px 0 0 #FCD116` : undefined,
      }}
    >
      <div className="flex items-start gap-3">
        {v.estado === "confirmada" && hora ? (
          <div className="w-[72px] shrink-0 rounded-lg px-1 py-2 text-center" style={{ background: TONE.info.bg }}>
            <div className="whitespace-nowrap text-[12px] font-bold tabular-nums leading-tight" style={{ color: TONE.info.fg }}>{hora}</div>
          </div>
        ) : (
          <Avatar name={v.nombre} size={36} />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[14px] font-semibold" style={{ color: C.ink }}><Name>{v.nombre}</Name></span>
            {v.es_pro && (
              <span className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                style={{ background: "#FCD116", color: "#111418" }} title="Lead de listing destacado — priorízalo">
                <Flame className="h-3 w-3" /> Pro
              </span>
            )}
            {v.calificado && <Pill tone="brand">✓ Calificado</Pill>}
            {vencido && (
              <Pill tone="bad" title={`Sin responder hace ${v.horas_pendiente}h (SLA ${v.es_pro ? 4 : 24}h)`}>
                <Clock className="h-3 w-3" /> {v.horas_pendiente}h sin responder
              </Pill>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px]" style={{ color: C.sub }}>
            <span className="inline-flex min-w-0 items-center gap-1"><Home className="h-3.5 w-3.5 shrink-0" style={{ color: C.muted }} /><span className="truncate">{v.listing_titulo}</span></span>
            {v.estado !== "confirmada" && (
              <span className="inline-flex items-center gap-1" style={{ color: C.ink }}><Calendar className="h-3.5 w-3.5" style={{ color: C.muted }} />{fecha}</span>
            )}
          </div>
          {(v.telefono || v.email) && (
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px]">
              {v.telefono && (
                <a href={`tel:${v.telefono}`} className="inline-flex items-center gap-1 font-medium hover:underline" style={{ color: TONE.brand.fg }}>
                  <Phone className="h-3.5 w-3.5" />{v.telefono}
                </a>
              )}
              {v.email && (
                <a href={`mailto:${v.email}`} className="inline-flex items-center gap-1 font-medium hover:underline" style={{ color: TONE.brand.fg }}>
                  <Mail className="h-3.5 w-3.5" />{v.email}
                </a>
              )}
            </div>
          )}
          {v.mensaje && (
            <p className="mt-2 rounded-lg px-3 py-2 text-[12.5px] italic leading-snug" style={{ background: C.soft, color: C.sub }}>
              “{v.mensaje}”
            </p>
          )}
          {v.calificado && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {leadPills(v).map((p) => (
                <span key={p} className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium" style={{ background: C.card, color: C.ink, border: `1px solid ${C.line}` }}>
                  {p}
                </span>
              ))}
            </div>
          )}

          {(v.estado === "pendiente" || v.estado === "confirmada") && (
            pidiendoResultado ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-[12px] font-medium" style={{ color: C.sub }}>¿Cómo terminó?</span>
                {(Object.keys(RESULTADO_LABEL) as (keyof typeof RESULTADO_LABEL)[]).map((r) => (
                  <button key={r} onClick={() => { onEstado("realizada", r); setPidiendoResultado(false); }}
                    disabled={pending} className={btn} style={ghost}>
                    {RESULTADO_LABEL[r]}
                  </button>
                ))}
                <button onClick={() => setPidiendoResultado(false)} className="text-[12px] transition hover:opacity-70" style={{ color: C.muted }}>
                  Volver
                </button>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {v.estado === "pendiente" && (
                  <button onClick={() => onEstado("confirmada")} disabled={pending} className={`${btn} font-bold text-white`} style={{ background: C.brand }}>
                    <Check className="mr-1 h-3.5 w-3.5" /> Confirmar
                  </button>
                )}
                {v.estado === "confirmada" && (
                  <>
                    <button onClick={() => setPidiendoResultado(true)} disabled={pending} className={`${btn} font-bold text-white`} style={{ background: C.brand }}>
                      Marcar realizada
                    </button>
                    <button onClick={() => onEstado("no_asistio")} disabled={pending} className={btn} style={ghost}>
                      No asistió
                    </button>
                  </>
                )}
                <button onClick={() => onEstado("cancelada")} disabled={pending} className={btn} style={ghost}>
                  Cancelar
                </button>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

// ══ Interesados — agrupados por listing ═══════════════════════════════════════

function InteresadosTab() {
  const { data, isLoading, isError } = useAgenda();
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});

  if (isLoading) return <SkeletonRows n={4} />;
  if (isError || !data) return <SectionError msg="No se pudo cargar tu agenda." />;

  const grupos = new Map<string, Agenda["interesados"]>();
  for (const p of data.interesados) grupos.set(p.listing_titulo, [...(grupos.get(p.listing_titulo) ?? []), p]);
  const ordenados = [...grupos.entries()].sort((a, b) => b[1].length - a[1].length);

  if (ordenados.length === 0) {
    return (
      <EmptyBlock icon={Heart} title="Nadie ha guardado tus listings todavía"
        msg="Cuando un usuario guarde uno de tus inmuebles en favoritos, lo verás aquí para hacerle seguimiento." />
    );
  }

  const LIMIT = 5;
  return (
    <div>
      <p className="mb-4 text-[13px]" style={{ color: C.sub }}>
        Usuarios que guardaron tus inmuebles en favoritos. Son compradores tibios: escríbeles para ofrecer una visita.
      </p>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        {ordenados.map(([titulo, personas]) => {
          const open = abiertos[titulo];
          const vis = open ? personas : personas.slice(0, LIMIT);
          return (
            <Panel key={titulo} icon={Heart} tone="violet" title={<span className="truncate">{titulo}</span>} count={personas.length} flush>
              {vis.map((p, i) => (
                <div key={`${p.email}-${i}`} className="flex items-center gap-3 px-5 py-3" style={i === 0 ? undefined : { borderTop: `1px solid ${C.line}` }}>
                  <Avatar name={p.nombre ?? p.email} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold" style={{ color: C.ink }}>{p.nombre ?? "Usuario"}</div>
                    <div className="truncate text-[12px]" style={{ color: C.muted }}>{p.email} · {relativeTime(p.created_at)}</div>
                  </div>
                  <a
                    href={`mailto:${p.email}?subject=${encodeURIComponent(titulo)}`}
                    className="inline-flex min-h-[32px] shrink-0 items-center gap-1 rounded-lg px-2.5 text-[12px] font-semibold transition hover:opacity-85"
                    style={{ border: `1px solid ${C.line}`, color: C.ink }}
                  >
                    <Mail className="h-3.5 w-3.5" /> Escribir
                  </a>
                </div>
              ))}
              {personas.length > LIMIT && (
                <button
                  onClick={() => setAbiertos((s) => ({ ...s, [titulo]: !open }))}
                  className="w-full px-5 py-2.5 text-left text-[12px] font-semibold hover:underline"
                  style={{ color: TONE.brand.fg, borderTop: `1px solid ${C.line}` }}
                >
                  {open ? "Ver menos" : `Ver ${personas.length - LIMIT} más`}
                </button>
              )}
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

// ══ TAB 3: Mis listings ════════════════════════════════════════════════════════
// Organizado por ciclo de vida: Activos (en el mapa o pausados) → En preparación
// (borrador / revisión / rechazado) → Cerrados. Arriba los KPIs del portafolio
// (son también atajos de filtro); cada tarjeta dice su "próximo paso".

type ListingGrupo = "todos" | "activos" | "preparacion" | "cerrados";
type ListingOrden = "recientes" | "vistas" | "precio_desc" | "precio_asc";

const GRUPO_DE: Record<EstadoListing, Exclude<ListingGrupo, "todos">> = {
  publicado: "activos", pausado: "activos",
  borrador: "preparacion", en_revision: "preparacion", rechazado: "preparacion",
  cerrado: "cerrados",
};
// Los íconos se resuelven en render (no en una constante de módulo): el code-splitting
// de TanStack Router pierde imports referenciados solo desde constantes top-level.
const GRUPO_META: Record<Exclude<ListingGrupo, "todos">, { titulo: string; sub: string; tone: Tone }> = {
  activos:     { titulo: "Activos", sub: "Publicados en el mapa o pausados temporalmente", tone: "brand" },
  preparacion: { titulo: "En preparación", sub: "Borradores, en revisión o por corregir", tone: "warn" },
  cerrados:    { titulo: "Cerrados", sub: "Ventas y arriendos reportados", tone: "neutral" },
};
function grupoIcon(g: Exclude<ListingGrupo, "todos">) {
  return g === "activos" ? Globe2 : g === "preparacion" ? ClipboardList : Trophy;
}

function ListingsTab() {
  const { data, isLoading, isError } = useMisListings();
  const [grupo, setGrupo] = useState<ListingGrupo>("todos");
  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState<ListingOrden>("recientes");
  const [editando, setEditando] = useState<MiListing | null>(null);
  const [cerrando, setCerrando] = useState<MiListing | null>(null);
  const cambiarEstado = useCambiarEstadoListing();
  const eliminar = useEliminarListing();

  const all = data ?? [];
  const n = (g: Exclude<ListingGrupo, "todos">) => all.filter((l) => GRUPO_DE[l.estado] === g).length;
  const publicados = all.filter((l) => l.estado === "publicado").length;
  const rechazados = all.filter((l) => l.estado === "rechazado").length;
  const vistas30 = all.reduce((s, l) => s + (l.vistas_30d ?? 0), 0);
  const vistasTot = all.reduce((s, l) => s + (l.vistas_total ?? 0), 0);
  const favs = all.reduce((s, l) => s + (l.favoritos ?? 0), 0);

  const visible = useMemo(() => {
    let out = grupo === "todos" ? all : all.filter((l) => GRUPO_DE[l.estado] === grupo);
    const q = busqueda.trim().toLowerCase();
    if (q) out = out.filter((l) => `${l.titulo} ${l.barrio} ${l.tipo_inmueble}`.toLowerCase().includes(q));
    const sorted = [...out];
    if (orden === "recientes") sorted.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    if (orden === "vistas") sorted.sort((a, b) => b.vistas_30d - a.vistas_30d);
    if (orden === "precio_desc") sorted.sort((a, b) => b.precio - a.precio);
    if (orden === "precio_asc") sorted.sort((a, b) => a.precio - b.precio);
    return sorted;
  }, [all, grupo, busqueda, orden]);

  const onEliminar = (l: MiListing) => {
    // ponytail: confirm nativo — accesible y sin modal extra; subir a modal si se pide.
    // El caso publicado tiene filo: el soft-delete lo saca del dashboard pero sigue
    // vivo en el mapa público hasta el refresh (sync al mapa = fase 2). Avisar.
    const extra = l.estado === "publicado"
      ? " Nota: seguirá visible en el mapa público hasta el próximo refresh."
      : "";
    if (window.confirm(`¿Eliminar "${l.titulo}"? Podrás recuperarlo con soporte (soft-delete).${extra}`)) {
      eliminar.mutate(l.id);
    }
  };

  const busy = cambiarEstado.isPending || eliminar.isPending;
  const toggleGrupo = (g: ListingGrupo) => setGrupo((cur) => (cur === g ? "todos" : g));

  const renderCards = (items: MiListing[]) => (
    <div className="grid gap-4 md:grid-cols-2">
      {items.map((l) => (
        <ListingCard
          key={l.id}
          listing={l}
          busy={busy}
          onEditar={() => setEditando(l)}
          onMarcarVendido={() => setCerrando(l)}
          onPausar={() => cambiarEstado.mutate({ listingId: l.id, estado: "pausado" })}
          onReactivar={() => cambiarEstado.mutate({ listingId: l.id, estado: "publicado" })}
          onEliminar={() => onEliminar(l)}
        />
      ))}
    </div>
  );

  return (
    <section>
      <PageHeader
        title="Mis listings"
        subtitle="Tu portafolio de inmuebles: lo que está en el mapa, lo que estás preparando y lo que ya cerraste."
        actions={
          <Link
            to="/publicar"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-4 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
            style={{ background: C.brand }}
          >
            <Plus className="h-4 w-4" /> Crear listing
          </Link>
        }
      />

      {isLoading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-80 rounded-2xl" />)}
          </div>
        </div>
      )}

      {isError && <SectionError msg="No se pudieron cargar tus listings." />}

      {!isLoading && !isError && all.length === 0 && (
        <EmptyBlock
          icon={Building2}
          title="Aún no tienes listings"
          msg="Crea tu primer inmueble o acepta un propietario desde la bandeja para empezar a publicar."
          action={
            <Link to="/publicar" className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white" style={{ background: C.brand }}>
              <Plus className="h-4 w-4" /> Crear listing
            </Link>
          }
        />
      )}

      {!isLoading && !isError && all.length > 0 && (
        <>
          <KpiGrid>
            <KpiCard icon={Globe2} tone="brand" label="Publicados" value={publicados}
              hint={`${n("activos") - publicados} pausados`}
              active={grupo === "activos"} onClick={() => toggleGrupo("activos")} />
            <KpiCard icon={ClipboardList} tone={rechazados > 0 ? "bad" : "warn"} label="En preparación" value={n("preparacion")}
              hint={rechazados > 0 ? `${rechazados} por corregir` : "borradores y en revisión"}
              active={grupo === "preparacion"} onClick={() => toggleGrupo("preparacion")} />
            <KpiCard icon={Eye} tone="info" label="Aperturas · 30 días" value={vistas30.toLocaleString("es-CO")}
              hint={`${vistasTot.toLocaleString("es-CO")} en total`} />
            <KpiCard icon={Heart} tone="violet" label="Favoritos" value={favs.toLocaleString("es-CO")}
              hint="veces que guardaron tus inmuebles" />
          </KpiGrid>

          {/* Barra de herramientas */}
          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <FilterTabs
              label="Filtrar por etapa"
              value={grupo}
              onChange={setGrupo}
              options={[
                { v: "todos", label: "Todos", n: all.length },
                { v: "activos", label: "Activos", n: n("activos") },
                { v: "preparacion", label: "En preparación", n: n("preparacion") },
                { v: "cerrados", label: "Cerrados", n: n("cerrados") },
              ]}
            />
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1 lg:w-64 lg:flex-none">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: C.muted }} />
                <input
                  type="search"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por título o barrio"
                  aria-label="Buscar listings"
                  className={`${inputCls} rounded-xl pl-9`}
                />
              </div>
              <select
                value={orden}
                onChange={(e) => setOrden(e.target.value as ListingOrden)}
                aria-label="Ordenar listings"
                className={`${inputCls} w-auto rounded-xl`}
              >
                <option value="recientes">Más recientes</option>
                <option value="vistas">Más vistos (30d)</option>
                <option value="precio_desc">Mayor precio</option>
                <option value="precio_asc">Menor precio</option>
              </select>
            </div>
          </div>

          {visible.length === 0 ? (
            <EmptyBlock icon={Search} msg="Ningún listing coincide con este filtro o búsqueda." />
          ) : grupo === "todos" ? (
            <div className="space-y-8">
              {(["preparacion", "activos", "cerrados"] as const).map((g) => {
                const items = visible.filter((l) => GRUPO_DE[l.estado] === g);
                if (items.length === 0) return null;
                const m = GRUPO_META[g];
                return (
                  <div key={g}>
                    <div className="mb-3 flex items-center gap-2.5">
                      <IconChip icon={grupoIcon(g)} tone={m.tone} size={28} />
                      <h2 className="text-[15px] font-semibold" style={{ color: C.ink }}>{m.titulo}</h2>
                      <span className="text-[12px] tabular-nums" style={{ color: C.muted }}>{items.length}</span>
                      <span className="hidden text-[12px] sm:inline" style={{ color: C.muted }}>· {m.sub}</span>
                    </div>
                    {renderCards(items)}
                  </div>
                );
              })}
            </div>
          ) : (
            renderCards(visible)
          )}
        </>
      )}

      {editando && (
        <EditorFichaModal listing={editando} onClose={() => setEditando(null)} />
      )}

      {cerrando && (
        <CerrarVendidoModal listing={cerrando} onClose={() => setCerrando(null)} />
      )}
    </section>
  );
}

// Modal "Marcar vendido" — reporta el cierre (precio + matrícula obligatoria).
// ES la contribución que desbloquea los comparables y sube el puntaje (incentivo).
function CerrarVendidoModal({ listing, onClose }: { listing: MiListing; onClose: () => void }) {
  const cerrar = useCerrarListing();
  const [precio, setPrecio] = useState("");
  const [matricula, setMatricula] = useState("");
  const [fecha, setFecha] = useState("");
  const [catastral, setCatastral] = useState("");

  const precioNum = Number(precio.replace(/[^\d]/g, ""));
  const puedeEnviar = precioNum > 0 && matricula.trim().length > 0 && !cerrar.isPending;

  async function enviar() {
    if (!puedeEnviar) return;
    try {
      await cerrar.mutateAsync({
        listingId: listing.id,
        input: {
          precio_cierre: precioNum,
          matricula_inmobiliaria: matricula.trim(),
          fecha_cierre: fecha || undefined,
          cedula_catastral: catastral.trim() || undefined,
        },
      });
      onClose();
    } catch {
      /* el hook ya hace toast.error */
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Marcar vendido"
        className="relative w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-foreground">Reportar venta</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {listing.titulo}. Reportar el cierre <strong>desbloquea los comparables de cierre</strong> y sube tu puntaje.
        </p>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Precio de cierre (COP) *</span>
            <input
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              inputMode="numeric"
              placeholder="450000000"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {precioNum > 0 && <span className="mt-0.5 block text-xs text-muted-foreground">{formatCOP(precioNum)}</span>}
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Matrícula inmobiliaria (ORIP) *</span>
            <input
              value={matricula}
              onChange={(e) => setMatricula(e.target.value)}
              placeholder="001-123456"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <span className="mt-0.5 block text-xs text-muted-foreground">Obligatoria — es la llave del registro de la propiedad.</span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Fecha de cierre</span>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Cédula catastral</span>
              <input
                value={catastral}
                onChange={(e) => setCatastral(e.target.value)}
                placeholder="opcional"
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </label>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
            Cancelar
          </button>
          <button
            onClick={enviar}
            disabled={!puedeEnviar}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
          >
            {cerrar.isPending ? "Reportando…" : "Reportar venta"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Botón de acción de fila: target ≥24px (WCAG 2.2 SC 2.5.8), min-h-[34px] real.
function RowAction({ onClick, disabled, variant = "ghost", title, children }: {
  onClick: () => void; disabled?: boolean; variant?: "ghost" | "primary" | "danger"; title?: string; children: React.ReactNode;
}) {
  const style =
    variant === "primary" ? { background: C.brand, color: "#fff", border: `1px solid ${C.brand}` }
    : variant === "danger" ? { background: "transparent", color: TONE.bad.fg, border: `1px solid ${TONE.bad.line}` }
    : { background: C.card, color: C.ink, border: `1px solid ${C.line}` };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex min-h-[34px] shrink-0 items-center rounded-lg px-3 text-[12px] font-semibold transition hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 disabled:opacity-50"
      style={style}
    >
      {children}
    </button>
  );
}

// Ícono de portada según el tipo de inmueble (placeholder cuando no hay foto).
function tipoIcon(tipo: string) {
  if (tipo === "casa" || tipo === "finca") return Home;
  if (tipo === "local" || tipo === "oficina" || tipo === "bodega") return Store;
  if (tipo === "lote") return MapPin;
  return Building2;
}

// Próximo paso sugerido para un listing según su estado y su ficha.
function proximoPasoListing(l: MiListing): { tone: Tone; texto: string } | null {
  if (l.estado === "rechazado") return { tone: "bad", texto: "Rechazado en revisión: corrige la ficha y vuelve a enviarla." };
  if (l.estado === "borrador") return { tone: "warn", texto: "Borrador: completa la ficha para enviarla a revisión." };
  if (l.estado === "en_revision") return { tone: "info", texto: "En revisión por el equipo. Te avisamos cuando se apruebe." };
  if (l.estado === "pausado") return { tone: "neutral", texto: "Pausado: no aparece en el mapa hasta que lo reactives." };
  if (l.estado === "publicado" && !l.cover_url) return { tone: "warn", texto: "Sin foto de portada: agrégala para destacar en el mapa." };
  if (l.estado === "publicado" && !l.descripcion) return { tone: "info", texto: "Agrega una descripción para que los interesados entiendan el inmueble." };
  return null;
}

function ListingCard({ listing: l, busy, onEditar, onMarcarVendido, onPausar, onReactivar, onEliminar }: {
  listing: MiListing; busy?: boolean;
  onEditar: () => void; onMarcarVendido: () => void; onPausar: () => void; onReactivar: () => void; onEliminar: () => void;
}) {
  const estado = ESTADO_META[l.estado];
  const puedeCerrar = l.estado === "publicado" || l.estado === "pausado";
  const PlaceIcon = tipoIcon(l.tipo_inmueble);
  const paso = proximoPasoListing(l);
  const conv = l.vistas_total > 0 ? Math.round(((l.favoritos ?? 0) / l.vistas_total) * 100) : null;

  const spec = (val: number | null, suffix: string, Icon: typeof Bed) =>
    val == null ? null : (
      <span className="inline-flex items-center gap-1 text-[12px]" style={{ color: C.sub }}>
        <Icon className="h-3.5 w-3.5" style={{ color: C.muted }} />{val}{suffix}
      </span>
    );

  return (
    <article
      data-testid="listing-row"
      data-estado={l.estado}
      className="flex flex-col overflow-hidden rounded-2xl transition hover:shadow-md"
      style={{ background: C.card, border: `1px solid ${C.line}`, opacity: l.estado === "cerrado" ? 0.85 : 1 }}
    >
      {/* Portada */}
      <div className={`relative shrink-0 overflow-hidden ${l.cover_url ? "h-44" : "h-28"}`} style={{ background: `linear-gradient(135deg, ${C.soft}, #ECE7DA)` }}>
        {l.cover_url ? (
          <img src={l.cover_url} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center">
            <div className="flex flex-col items-center gap-1.5" style={{ color: C.muted }}>
              <PlaceIcon className="h-9 w-9 opacity-60" />
              <span className="inline-flex items-center gap-1 text-[11px] font-medium"><Camera className="h-3 w-3" /> Sin foto</span>
            </div>
          </div>
        )}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-3">
          <Pill tone={estado.tone} dot testId="listing-estado">{estado.label}</Pill>
          <span
            className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold leading-5 backdrop-blur"
            style={{ background: "rgba(255,255,255,0.88)", color: l.es_propio ? TONE.brand.fg : C.sub }}
            title={l.es_propio ? "Creado por ti" : "Asignado de un lead — representas al propietario"}
          >
            {l.es_propio ? "Propio" : "Asignado"}
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug" style={{ color: C.ink }}>{l.titulo}</h3>
            <p className="mt-1 flex items-center gap-1 truncate text-[12px] capitalize" style={{ color: C.muted }}>
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              {l.tipo_inmueble} · {l.operacion}{l.barrio ? ` · ${l.barrio}` : ""}
            </p>
          </div>
        </div>
        <div className="mt-2 text-[20px] font-bold tabular-nums tracking-tight" style={{ color: C.ink }}>
          {formatCOP(l.precio)}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          {spec(l.area_m2, " m²", Maximize2)}
          {spec(l.habitaciones, " hab", Bed)}
          {spec(l.banos, " baños", Bath)}
          {spec(l.parqueaderos, " parq", Car)}
        </div>

        {/* Rendimiento */}
        <dl className="mt-4 grid grid-cols-3 overflow-hidden rounded-xl" style={{ background: C.soft }}>
          {[
            { k: "aperturas", v: l.vistas_total.toLocaleString("es-CO"), icon: Eye },
            { k: "últimos 30d", v: l.vistas_30d.toLocaleString("es-CO"), icon: TrendingUp },
            { k: "favoritos", v: (l.favoritos ?? 0).toLocaleString("es-CO"), icon: Heart },
          ].map(({ k, v, icon: Icon }, i) => (
            <div key={k} className="px-3 py-2.5" style={i > 0 ? { borderLeft: `1px solid ${C.line}` } : undefined}>
              <dd className="flex items-center gap-1 text-[15px] font-bold tabular-nums" style={{ color: C.ink }}>
                <Icon className="h-3.5 w-3.5" style={{ color: C.muted }} />{v}
              </dd>
              <dt className="text-[11px]" style={{ color: C.muted }}>{k}</dt>
            </div>
          ))}
        </dl>
        {conv != null && conv > 0 && (
          <p className="mt-1.5 text-[11px]" style={{ color: C.muted }}>
            {conv}% de quienes lo abren lo guardan en favoritos.
          </p>
        )}

        {paso && (
          <div
            className="mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-[12px] leading-snug"
            style={{ background: TONE[paso.tone].bg, color: TONE[paso.tone].fg }}
          >
            <Info className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>{paso.texto}</span>
          </div>
        )}

        {/* Acciones */}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
          <span className="mr-auto text-[11px]" style={{ color: C.muted }}>Actualizado {relativeTime(l.updated_at)}</span>
          {l.estado !== "cerrado" && (
            <RowAction onClick={onEditar} disabled={busy} variant="primary" title="Editar la ficha completa">Editar</RowAction>
          )}
          {l.estado === "publicado" && (
            <RowAction onClick={onPausar} disabled={busy} title="Ocultar temporalmente este listing">Pausar</RowAction>
          )}
          {l.estado === "pausado" && (
            <RowAction onClick={onReactivar} disabled={busy} title="Volver a publicar">Reactivar</RowAction>
          )}
          {puedeCerrar && (
            <RowAction onClick={onMarcarVendido} disabled={busy}
              title="Reportar la venta: desbloquea comparables de cierre y sube tu puntaje">
              Marcar vendido
            </RowAction>
          )}
          <RowAction onClick={onEliminar} disabled={busy} variant="danger" title="Eliminar este listing">Eliminar</RowAction>
        </div>
      </div>
    </article>
  );
}

const ESTADO_META: Record<EstadoListing, { label: string; tone: Tone }> = {
  publicado:   { label: "Publicado",   tone: "brand" },
  en_revision: { label: "En revisión", tone: "info" },
  borrador:    { label: "Borrador",    tone: "warn" },
  pausado:     { label: "Pausado",     tone: "neutral" },
  rechazado:   { label: "Rechazado",   tone: "bad" },
  cerrado:     { label: "Cerrado",     tone: "neutral" },
};

// ══ Mercado › Zonas de interés ═════════════════════════════════════════════════
// Panel client-facing (PDF panel-resultados-realtor.pdf). Reúne /desempeno e
// /inteligencia/{zona} en lenguaje llano. La zona pagada manda: el resumen y el
// mercado hablan de la misma zona (la de mayor patrocinio). El embudo completo de
// la zona vive en Inicio — aquí solo el resumen para no duplicarlo.

const TIER_LABEL: Record<string, string> = {
  agente_premium: "Plan Agente Premium",
  comuna: "Plan Comuna",
  barrio: "Plan Barrio",
};

function planZona(z: RoiZona): string {
  const plan = z.tier ? TIER_LABEL[z.tier] ?? z.tier.replace(/_/g, " ") : "Patrocinio";
  return `${plan} · ${formatCOP(z.precio_mensual)}/mes`;
}

// walk_score (0–100) → etiqueta llana, como en el PDF ("Muy caminable")
function etiquetaCaminable(score: number | null | undefined): string {
  if (score == null) return "—";
  if (score >= 85) return "Muy caminable";
  if (score >= 65) return "Caminable";
  if (score >= 40) return "Algo caminable";
  return "Poco caminable";
}

const signo = (v: number, dec = 1) => `${v > 0 ? "+" : ""}${v.toFixed(dec)}%`;

// Comparables de cierre — incentivo de reciprocidad: gated si no has reportado cierres.
function ComparablesSection() {
  const { data, isLoading } = useComparables();
  const goTo = useContext(GoToSection);
  const necesarios = data?.cierres_necesarios ?? 1;
  const hechos = data?.cierres_reportados ?? 0;

  return (
    <Panel
      icon={data?.acceso ? Trophy : Lock}
      tone={data?.acceso ? "brand" : "neutral"}
      title="Comparables de cierre"
      subtitle="Precios reales de venta, no de aviso"
      count={data?.acceso ? data.comparables.length : undefined}
      flush
      actions={data?.acceso ? <Pill tone="brand" dot>Ya disponible</Pill> : <Pill tone="neutral">Bloqueado</Pill>}
    >
      {isLoading && <div className="p-5"><SkeletonRows n={2} /></div>}

      {!isLoading && data && !data.acceso && (
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[14px] font-semibold" style={{ color: C.ink }}>Desbloquea los comparables de cierre</p>
            <p className="mt-1 text-[13px]" style={{ color: C.sub }}>{data.motivo}</p>
            <div className="mt-3 flex items-center gap-3">
              <div className="h-2 w-40 overflow-hidden rounded-full" style={{ background: C.soft }}>
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, (hechos / Math.max(necesarios, 1)) * 100)}%`, background: C.brand }} />
              </div>
              <span className="text-[12px] tabular-nums" style={{ color: C.muted }}>{hechos} de {necesarios} cierres reportados</span>
            </div>
          </div>
          <button
            onClick={() => goTo("listings")}
            className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl px-4 text-[13px] font-semibold text-white transition hover:opacity-90"
            style={{ background: C.brand }}
          >
            Reportar un cierre <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {!isLoading && data?.acceso && data.comparables.length === 0 && (
        <p className="px-5 py-8 text-center text-[13px]" style={{ color: C.muted }}>
          Aún no hay cierres reportados para comparar. A medida que los agentes reporten, aparecerán aquí.
        </p>
      )}

      {!isLoading && data?.acceso && data.comparables.length > 0 && (
        <>
          <div className="hidden grid-cols-[1fr_90px_90px_140px_120px] gap-3 px-5 py-2 text-[11px] font-bold uppercase tracking-wide sm:grid"
            style={{ background: C.soft, color: C.muted }}>
            <span>Inmueble</span><span>Área</span><span>Fecha</span><span className="text-right">Precio de cierre</span><span className="text-right">Precio / m²</span>
          </div>
          {data.comparables.map((c, i) => (
            <div key={i} className="grid grid-cols-2 items-center gap-x-3 gap-y-1 px-5 py-3 sm:grid-cols-[1fr_90px_90px_140px_120px]"
              style={{ borderTop: `1px solid ${C.line}` }}>
              <div className="col-span-2 min-w-0 sm:col-span-1">
                <div className="truncate text-[13px] font-semibold capitalize" style={{ color: C.ink }}>{c.tipo_inmueble} · {c.barrio ?? "—"}</div>
                {c.verificado
                  ? <span className="text-[11px] font-semibold" style={{ color: TONE.brand.fg }}>✓ verificado</span>
                  : <span className="text-[11px]" style={{ color: C.muted }}>sin verificar</span>}
              </div>
              <span className="text-[12.5px] tabular-nums" style={{ color: C.sub }}>{c.area_m2 ? `${c.area_m2} m²` : "—"}</span>
              <span className="text-[12.5px]" style={{ color: C.sub }}>{new Date(c.fecha).toLocaleDateString("es-CO", { month: "short", year: "numeric" })}</span>
              <span className="text-right text-[13px] font-bold tabular-nums" style={{ color: C.ink }}>{c.precio != null ? formatCOP(c.precio) : "—"}</span>
              <span className="text-right text-[12.5px] tabular-nums" style={{ color: C.sub }}>{c.precio_m2 != null ? formatCOP(c.precio_m2) : "—"}</span>
            </div>
          ))}
          <p className="px-5 py-3 text-[11.5px]" style={{ color: C.muted, borderTop: `1px solid ${C.line}` }}>
            {data.verificados ?? 0} verificados · {data.autoreportados ?? 0} autoreportados.
            “Sin verificar” = reportado por un agente, aún sin cruzar con el registro (SNR) — tómalo con cautela.
          </p>
        </>
      )}
    </Panel>
  );
}

function ResultadosTab() {
  const { data, isLoading, isError } = useDesempeno();
  // zonas viene ordenado por precio_mensual DESC → [0] es la zona pagada principal
  const zonaPagada = data?.zonas?.[0] ?? null;
  const { data: intel, isError: intelError } = useInteligenciaBarrio(
    zonaPagada?.zona_codigo ?? null,
    zonaPagada?.nivel,
  );

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }
  if (isError || !data) return <SectionError msg="No se pudo cargar tu panel de resultados." />;

  const yieldTxt = intel?.mercado.yield_bruto_pct != null ? `${intel.mercado.yield_bruto_pct.toFixed(1)}%` : "—";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Zonas de interés"
        subtitle="Cómo rinde tu zona pagada, los precios reales de cierre y qué dice el mercado para tus clientes."
      />

      {/* Zona pagada: tarjeta destacada */}
      {!zonaPagada ? (
        <EmptyBlock icon={MapPinned} title="Aún no tienes una zona pagada"
          msg="Cuando actives una zona pagada, aquí verás cuánto te cuesta cada cliente y la información de mercado de esa zona." />
      ) : (
        <section
          className="overflow-hidden rounded-2xl"
          style={{ background: `linear-gradient(135deg, ${TONE.brand.fg} 0%, #0F8A4F 60%, #1baf7a 100%)`, color: "#fff" }}
        >
          <div className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-wider opacity-80">Tu zona pagada</div>
              <h2 className="mt-1 flex items-center gap-2 text-[22px] font-bold capitalize">
                <MapPinned className="h-5 w-5 opacity-90" /> {zonaPagada.zona_nombre}
              </h2>
              <p className="mt-0.5 text-[12.5px] opacity-85"><span className="capitalize">{zonaPagada.nivel}</span> · {planZona(zonaPagada)}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-px sm:grid-cols-3" style={{ background: "rgba(255,255,255,0.18)" }}>
            {[
              { v: zonaPagada.costo_por_intake != null ? formatCOP(zonaPagada.costo_por_intake) : "—", l: "Costo por cada cliente conseguido" },
              { v: zonaPagada.vistas_30d.toLocaleString("es-CO"), l: "Visitas a tus inmuebles este mes" },
              { v: zonaPagada.intakes_mes, l: "Inmuebles nuevos este mes" },
            ].map((k) => (
              <div key={k.l} className="px-5 py-4 sm:px-6" style={{ background: "rgba(8,60,35,0.28)" }}>
                <div className="text-[24px] font-bold tabular-nums leading-tight">{k.v}</div>
                <div className="mt-0.5 text-[12px] opacity-85">{k.l}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <ComparablesSection />

      {/* Información del mercado */}
      {zonaPagada && (
        <div>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[17px] font-bold tracking-tight" style={{ color: C.ink }}>
              Información del mercado <span className="font-normal" style={{ color: C.muted }}>· {intel?.nombre ?? zonaPagada.zona_nombre}</span>
            </h2>
            <span className="text-[11.5px]" style={{ color: C.muted }}>Se actualiza cada semana o cada mes, no al instante.</span>
          </div>
          {intelError || !intel ? (
            <EmptyBlock icon={BarChart2} msg="Aún no tenemos datos de mercado para esta zona." />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              <MercadoCol icon={Home} tone="brand" titulo="Venta" filas={[
                ["Precio por metro cuadrado", intel.mercado.precio_m2_cop ? formatCOP(intel.mercado.precio_m2_cop) : "—"],
                ["Ganancia anual", yieldTxt],
                ["Facilidad de venta", intel.liquidez.categoria ?? "—"],
                ["Tiempo estimado para vender", intel.liquidez.tiempo_estimado_venta ?? "—"],
              ]} />
              <MercadoCol icon={KeyRound} tone="info" titulo="Arriendo de largo plazo" filas={[
                ["Arriendo típico", intel.mercado.arriendo_p50_cop ? formatCOP(intel.mercado.arriendo_p50_cop) : "—"],
                ["Ganancia anual", yieldTxt],
                ["Años para recuperar la inversión", intel.mercado.anos_recupero != null ? intel.mercado.anos_recupero.toFixed(1) : "—"],
              ]} />
              <MercadoCol icon={Sun} tone="warn" titulo="Alquiler por días (tipo Airbnb)" filas={[
                ["Días ocupado", intel.airbnb.ocupacion_pct != null ? `${Math.round(intel.airbnb.ocupacion_pct)}%` : "—"],
                ["Precio promedio por noche", intel.airbnb.adr_cop ? formatCOP(intel.airbnb.adr_cop) : "—"],
                ["Ganancia anual", intel.airbnb.yield_airbnb_pct != null ? `${intel.airbnb.yield_airbnb_pct.toFixed(1)}%` : "—"],
              ]} />
              <MercadoCol icon={ShieldCheck} tone="violet" titulo="Seguridad" filas={[
                ["Qué tan segura es", intel.seguridad.score != null ? `${intel.seguridad.score} de 100` : "—"],
                ["Cómo va cambiando", intel.seguridad.tendencia ?? "—"],
              ]} />
              <MercadoCol icon={TrainFront} tone="info" titulo="Ubicación" filas={[
                ["Distancia al metro", intel.conectividad.dist_metro_km != null ? `${intel.conectividad.dist_metro_km.toFixed(1)} km` : "—"],
                ["Qué tan caminable es", etiquetaCaminable(intel.conectividad.walk_score)],
                ["Colegios cerca", intel.conectividad.n_colegios_1km ?? "—"],
              ]} />
              <MercadoCol icon={TrendingUp} tone="brand" titulo="Valorización" filas={[
                ["Cuánto subió de precio este año", intel.valorizacion.var_anual_pct != null ? signo(intel.valorizacion.var_anual_pct) : "—"],
                ["Lo que se espera que suba en 5 años", intel.valorizacion.proyeccion_5anos_pct != null ? signo(intel.valorizacion.proyeccion_5anos_pct, 0) : "—"],
              ]} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Tarjeta de mercado: encabezado con ícono + filas [etiqueta, valor] con divisores.
function MercadoCol({ icon, tone, titulo, filas }: { icon: typeof Eye; tone: Tone; titulo: string; filas: [string, string | number][] }) {
  return (
    <div className="overflow-hidden rounded-2xl" style={{ background: C.card, border: `1px solid ${C.line}`, boxShadow: "0 1px 2px rgba(17,20,24,0.04)" }}>
      <div className="flex items-center gap-2.5 px-4 py-3" style={{ borderBottom: `1px solid ${C.line}`, background: TONE[tone].bg }}>
        <IconChip icon={icon} tone={tone} size={28} />
        <h3 className="text-[13px] font-bold" style={{ color: TONE[tone].fg }}>{titulo}</h3>
      </div>
      <dl className="divide-y px-4" style={{ borderColor: C.line }}>
        {filas.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3 py-2.5" style={{ borderColor: C.line }}>
            <dt className="text-[12.5px]" style={{ color: C.sub }}>{label}</dt>
            <dd className="shrink-0 text-[14px] font-bold tabular-nums first-letter:uppercase" style={{ color: C.ink }}>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ══ Mercado › Inteligencia ═════════════════════════════════════════════════════
// Regla de visualización: scores y tasas acotados 0–100 (inversión, liquidez,
// seguridad, ocupación, walk/transit) llevan anillo. Dinero, conteos, distancias y
// % no acotados (yields, valorización) van como número — un anillo casi vacío para
// un yield del 6% confundiría más de lo que informa.

function InteligenciaTab() {
  const { data: perfil } = useRealtorPerfil();
  const { data: listings } = useMisListings();

  const zonas = useMemo(() => {
    const map = new Map<string, { nombre: string; nivel: ZonaNivel; patrocinada: boolean }>();
    // zonas patrocinadas primero: son las que sí tienen datos resolubles
    // (comuna/barrio con cd_comuna/id real), vs. el barrio-texto libre del listing.
    for (const z of perfil?.zonas_patrocinadas ?? []) map.set(z.codigo, { nombre: z.nombre, nivel: z.nivel, patrocinada: true });
    for (const l of listings ?? []) {
      if (l.barrio) {
        const code = l.barrio.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
        if (!map.has(code)) map.set(code, { nombre: l.barrio, nivel: "barrio", patrocinada: false });
      }
    }
    return Array.from(map.entries()).map(([codigo, v]) => ({ codigo, ...v }));
  }, [perfil, listings]);

  const [selectedZona, setSelectedZona] = useState<string | null>(null);
  const activeZona = selectedZona ?? zonas[0]?.codigo ?? null;
  const activeNivel = zonas.find((z) => z.codigo === activeZona)?.nivel ?? "barrio";

  const { data: intel, isLoading, isError } = useInteligenciaBarrio(activeZona, activeNivel);
  const pctTxt = (v: number | null | undefined, dec = 1) => (v != null ? `${v.toFixed(dec)}%` : "—");

  return (
    <section>
      <PageHeader
        title="Inteligencia de barrio"
        subtitle="Todo lo que necesitas para asesorar a un inversionista: rentabilidad por modalidad, liquidez, seguridad y valorización."
      />

      {zonas.length === 0 ? (
        <EmptyBlock icon={BarChart2} msg="Agrega listings o patrocina una zona para ver métricas de mercado." />
      ) : (
        <>
          <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Seleccionar zona de análisis">
            {zonas.map((z) => {
              const on = z.codigo === activeZona;
              return (
                <button
                  key={z.codigo}
                  data-i18n-skip
                  onClick={() => setSelectedZona(z.codigo)}
                  aria-pressed={on}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition"
                  style={on
                    ? { background: C.ink, color: "#fff" }
                    : { background: C.card, color: C.sub, border: `1px solid ${C.line}` }}
                >
                  {z.patrocinada && <MapPinned className="h-3.5 w-3.5" style={{ color: on ? "#7EE2AE" : C.brand }} />}
                  {z.nombre}
                </button>
              );
            })}
          </div>

          {isLoading && (
            <div className="grid gap-4 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
            </div>
          )}

          {isError && <SectionError msg="No se pudo cargar la inteligencia del barrio." />}

          {!isLoading && !isError && intel && (
            <div className="space-y-4">
              {/* Hero: score de inversión por horizonte */}
              <section className="overflow-hidden rounded-2xl" style={{ background: C.card, border: `1px solid ${C.line}` }}>
                <div className="h-1.5" style={{ background: intel.color_hex ?? C.brand }} />
                <div className="grid gap-5 p-5 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>Score de inversión por horizonte</div>
                    <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <MetricCell label="Corto plazo" ring={intel.scores.corto} value={`${intel.scores.corto ?? "—"}/100`} hint={intel.scores.cat_corto ?? "Airbnb"} />
                      <MetricCell label="Mediano plazo" ring={intel.scores.mediano} value={`${intel.scores.mediano ?? "—"}/100`} hint={intel.scores.cat_mediano ?? "renta media"} />
                      <MetricCell label="Largo plazo" ring={intel.scores.largo} value={`${intel.scores.largo ?? "—"}/100`} hint={intel.scores.cat_largo ?? "renta larga"} />
                    </div>
                  </div>
                  <div className="rounded-xl px-5 py-4 lg:min-w-[220px]" style={{ background: TONE.brand.bg }}>
                    <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: TONE.brand.fg }}>
                      <Sparkles className="h-3.5 w-3.5" /> Perfil recomendado
                    </div>
                    <div className="mt-1 text-[18px] font-bold first-letter:uppercase" style={{ color: C.ink }}>{intel.scores.perfil_recomendado ?? "—"}</div>
                    <div className="text-[11.5px]" style={{ color: C.sub }}>mejor uso de la zona</div>
                  </div>
                </div>
              </section>

              <div className="grid items-start gap-4 md:grid-cols-2">
                <IntelGroup icon={Home} tone="brand" title="Venta">
                  <MetricCell label="Liquidez" ring={intel.liquidez.score} value={`${intel.liquidez.score ?? "—"}/100`} hint={intel.liquidez.categoria ?? "facilidad de venta"} />
                  <MetricCell label="Mediana m² venta" value={intel.mercado.precio_m2_cop ? formatCOP(intel.mercado.precio_m2_cop) : "—"} hint="precio por m²" />
                  <MetricCell label="Tiempo estimado de venta" value={intel.liquidez.tiempo_estimado_venta ?? "—"} hint="en el mercado" />
                </IntelGroup>

                <IntelGroup icon={KeyRound} tone="info" title="Renta larga">
                  <MetricCell label="Canon mediano" value={intel.mercado.arriendo_p50_cop ? formatCOP(intel.mercado.arriendo_p50_cop) : "—"} hint="COP / mes" />
                  <MetricCell label="Yield bruto" value={pctTxt(intel.mercado.yield_bruto_pct)} hint="anual sobre precio" accent={TONE.brand.fg} />
                  <MetricCell label="Años de recupero" value={intel.mercado.anos_recupero != null ? intel.mercado.anos_recupero.toFixed(1) : "—"} hint="capital vía arriendo" />
                </IntelGroup>

                <IntelGroup icon={Briefcase} tone="violet" title="Renta media (nómadas 1-3 meses)">
                  <MetricCell label="Precio mediano" value={intel.mercado.precio_renta_media_p50 ? formatCOP(intel.mercado.precio_renta_media_p50) : "—"} hint="COP / mes" />
                  <MetricCell label="Yield renta media" value={pctTxt(intel.mercado.yield_renta_media_pct)} hint="anual" accent={TONE.brand.fg} />
                  <MetricCell label="Listings activos" value={intel.mercado.n_listings_renta_media ?? "—"} hint="oferta actual" />
                  <MetricCell label="Premium vs renta larga" value={intel.mercado.premium_vs_largo_pct != null ? `+${intel.mercado.premium_vs_largo_pct.toFixed(0)}%` : "—"} hint="sobre canon tradicional" />
                </IntelGroup>

                <IntelGroup icon={Sun} tone="warn" title="Renta corta (Airbnb)">
                  <MetricCell label="Ocupación" ring={intel.airbnb.ocupacion_pct != null ? Math.round(intel.airbnb.ocupacion_pct) : null}
                    value={intel.airbnb.ocupacion_pct != null ? `${Math.round(intel.airbnb.ocupacion_pct)}%` : "—"} hint="promedio zona" />
                  <MetricCell label="Tarifa noche" value={intel.airbnb.adr_cop ? formatCOP(intel.airbnb.adr_cop) : "—"} hint="ADR promedio" />
                  <MetricCell label="Yield Airbnb" value={pctTxt(intel.airbnb.yield_airbnb_pct)} hint="anual" accent={TONE.brand.fg} />
                  <MetricCell label="Listings activos" value={intel.airbnb.n_listings ?? "—"} hint="oferta actual" />
                </IntelGroup>

                <IntelGroup icon={ShieldCheck} tone="violet" title="Seguridad">
                  <MetricCell label="Score seguridad" ring={intel.seguridad.score} value={`${intel.seguridad.score ?? "—"}/100`} hint={intel.seguridad.categoria ?? "percepción residente"} />
                  <MetricCell label="Tendencia" value={intel.seguridad.tendencia ?? "—"} hint="últimos periodos" />
                  {intel.seguridad.nota && (
                    <p className="col-span-full rounded-lg px-3 py-2 text-[12px]" style={{ background: C.soft, color: C.sub }}>{intel.seguridad.nota}</p>
                  )}
                </IntelGroup>

                <IntelGroup icon={TrainFront} tone="info" title="Conectividad">
                  <MetricCell label="Al metro" value={intel.conectividad.dist_metro_km != null ? `${intel.conectividad.dist_metro_km.toFixed(1)} km` : "—"} hint="distancia" />
                  <MetricCell label="Colegios a 1km" value={intel.conectividad.n_colegios_1km ?? "—"} hint="cercanos" />
                  <MetricCell label="Caminabilidad" ring={intel.conectividad.walk_score} value={`${intel.conectividad.walk_score ?? "—"}/100`} hint="walk score" />
                  <MetricCell label="Transporte público" ring={intel.conectividad.transit_score} value={`${intel.conectividad.transit_score ?? "—"}/100`} hint="transit score" />
                </IntelGroup>
              </div>

              <IntelGroup icon={TrendingUp} tone="brand" title="Valorización" wide>
                <MetricCell label="Variación anual" value={intel.valorizacion.var_anual_pct != null ? signo(intel.valorizacion.var_anual_pct) : "—"} hint={intel.valorizacion.tendencia ?? "histórico"} accent={TONE.brand.fg} />
                <MetricCell label="Proyección 3 años" value={intel.valorizacion.proyeccion_3anos_pct != null ? signo(intel.valorizacion.proyeccion_3anos_pct, 0) : "—"} hint="estimado" />
                <MetricCell label="Proyección 5 años" value={intel.valorizacion.proyeccion_5anos_pct != null ? signo(intel.valorizacion.proyeccion_5anos_pct, 0) : "—"} hint="estimado" />
              </IntelGroup>

              <p className="text-[11.5px]" style={{ color: C.muted }}>
                Las medianas son nominales; deflactar con IPC (DANE) antes de comparar períodos.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// Grupo de métricas: un solo panel con encabezado y grid interno (sin cajitas anidadas).
function IntelGroup({ icon, tone, title, wide, children }: {
  icon: typeof Eye; tone: Tone; title: string; wide?: boolean; children: React.ReactNode;
}) {
  return (
    <Panel icon={icon} tone={tone} title={title}>
      <div className={`grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 ${wide ? "lg:grid-cols-3" : ""}`}>{children}</div>
    </Panel>
  );
}

// ── Atoms ──────────────────────────────────────────────────────────────────────

function SectionError({ msg }: { msg: string }) {
  return (
    <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
      {msg}
    </div>
  );
}

function SkeletonRows({ n }: { n: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: n }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-lg" />
      ))}
    </div>
  );
}

// ── Utils ──────────────────────────────────────────────────────────────────────

const inputCls =
  "rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 w-full";

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1)  return "ahora";
  if (min < 60) return `hace ${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24)   return `hace ${h}h`;
  const d = Math.floor(h / 24);
  return `hace ${d}d`;
}

// ── Horario / disponibilidad del agente (slots de visita, sin Google) ─────────
// ══ TAB 6: Configuración — horario de visitas + zonas patrocinadas ═════════════

type ConfigSub = "perfil" | "horario" | "zonas";

function ConfiguracionTab() {
  const [sub, setSub] = useState<ConfigSub>("perfil");

  return (
    <section>
      <div className="mb-5">
        <FilterTabs
          label="Configuración"
          value={sub}
          onChange={setSub}
          options={[
            { v: "perfil", label: "Perfil público" },
            { v: "horario", label: "Horario de visitas" },
            { v: "zonas", label: "Zonas patrocinadas" },
          ]}
        />
      </div>
      {sub === "perfil" && <PerfilTab />}
      {sub === "horario" && <DisponibilidadTab />}
      {sub === "zonas" && <ZonasCompraTab />}
    </section>
  );
}

// Perfil público que el agente escribe de sí mismo: foto (R2) + descripción.
// Se muestra en el popup del directorio /agentes junto a su actividad auto-agregada.
function PerfilTab() {
  const { data: perfil } = useRealtorPerfil();
  const qc = useQueryClient();
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [initd, setInitd] = useState(false);

  useEffect(() => {
    if (perfil && !initd) { setBio(perfil.bio ?? ""); setInitd(true); }
  }, [perfil, initd]);

  async function guardarBio() {
    setSaving(true);
    try {
      await realtorApi.editarPerfil(bio.trim());
      await qc.invalidateQueries({ queryKey: ["realtor", "perfil"] });
      toast.success("Perfil actualizado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function subirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubiendo(true);
    try {
      await realtorApi.subirFotoPerfil(file);
      await qc.invalidateQueries({ queryKey: ["realtor", "perfil"] });
      toast.success("Foto actualizada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo subir la foto");
    } finally {
      setSubiendo(false);
      e.target.value = "";
    }
  }

  const initials = perfil?.nombre.split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_320px]">
      <Panel icon={User} tone="brand" title="Perfil público" subtitle="Así te ven los visitantes en el directorio de agentes.">
        <div className="mb-6 flex items-center gap-4">
          <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl text-lg font-semibold" style={{ background: C.soft, color: C.ink, border: `1px solid ${C.line}` }}>
            {perfil?.avatar
              ? <img src={perfil.avatar} alt={perfil.nombre} className="h-full w-full object-cover" />
              : initials}
          </div>
          <div>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-semibold transition hover:opacity-85" style={{ border: `1px solid ${C.line}`, color: C.ink }}>
              <Camera className="h-4 w-4" /> {subiendo ? "Subiendo…" : "Cambiar foto"}
              <input type="file" accept="image/*" onChange={subirFoto} disabled={subiendo} className="hidden" />
            </label>
            <p className="mt-1.5 text-[11.5px]" style={{ color: C.muted }}>Una foto clara de tu rostro genera más confianza.</p>
          </div>
        </div>

        <label className="mb-1.5 block text-[13px] font-semibold" style={{ color: C.ink }}>Descripción</label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={2000}
          rows={7}
          placeholder="Cuéntales a los clientes sobre ti: tu experiencia, las zonas que conoces, tu estilo de trabajo."
          className="w-full resize-none rounded-xl border border-border bg-background p-3 text-sm text-foreground outline-none focus:border-primary"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11.5px] tabular-nums" style={{ color: C.muted }}>{bio.length}/2000</span>
          <button
            onClick={guardarBio}
            disabled={saving}
            className="rounded-xl px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            style={{ background: C.brand }}
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </Panel>

      {/* Vista previa */}
      <div className="lg:sticky lg:top-32">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>Vista previa</div>
        <div className="overflow-hidden rounded-2xl" style={{ background: C.card, border: `1px solid ${C.line}` }}>
          <div className="h-16" style={{ background: `linear-gradient(135deg, ${TONE.brand.fg}, #1baf7a)` }} />
          <div className="-mt-8 px-4 pb-4">
            <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-2xl text-base font-bold" style={{ background: C.soft, color: C.ink, border: "3px solid #fff" }}>
              {perfil?.avatar ? <img src={perfil.avatar} alt="" className="h-full w-full object-cover" /> : initials}
            </div>
            <div className="mt-2 text-[15px] font-bold" style={{ color: C.ink }}>{perfil ? <Name>{perfil.nombre}</Name> : "—"}</div>
            {perfil && perfil.zonas_patrocinadas.length > 0 && (
              <div className="mt-0.5 flex items-center gap-1 text-[12px]" style={{ color: C.muted }}>
                <MapPinned className="h-3.5 w-3.5" />{perfil.zonas_patrocinadas.map((z) => z.nombre).join(" · ")}
              </div>
            )}
            <p className="mt-3 line-clamp-6 whitespace-pre-line text-[12.5px] leading-relaxed" style={{ color: bio ? C.sub : C.muted }}>
              {bio || "Tu descripción aparecerá aquí."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

const DIAS_LABEL = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const HORAS_OPC: string[] = (() => {
  const out: string[] = [];
  for (let h = 6; h <= 21; h++) for (const m of ["00", "30"]) out.push(`${String(h).padStart(2, "0")}:${m}`);
  return out;
})();
type DiaState = { enabled: boolean; inicio: string; fin: string };

function horasDe(d: DiaState): number {
  if (!d.enabled) return 0;
  const [h1, m1] = d.inicio.split(":").map(Number);
  const [h2, m2] = d.fin.split(":").map(Number);
  return Math.max(0, (h2 * 60 + m2 - (h1 * 60 + m1)) / 60);
}

function DisponibilidadTab() {
  const [dias, setDias] = useState<DiaState[]>(() =>
    Array.from({ length: 7 }, () => ({ enabled: false, inicio: "09:00", fin: "18:00" })));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    realtorApi.getDisponibilidad().then((fr) => {
      setDias((prev) => {
        const next = prev.map((d) => ({ ...d, enabled: false }));
        for (const f of fr) {
          if (f.dia_semana >= 0 && f.dia_semana < 7)
            next[f.dia_semana] = { enabled: true, inicio: f.hora_inicio, fin: f.hora_fin };
        }
        return next;
      });
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const set = (i: number, patch: Partial<DiaState>) =>
    setDias((prev) => prev.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  const guardar = async () => {
    for (let i = 0; i < 7; i++) {
      if (dias[i].enabled && dias[i].fin <= dias[i].inicio) {
        toast.error(`${DIAS_LABEL[i]}: la hora de fin debe ser mayor a la de inicio`);
        return;
      }
    }
    const franjas: Franja[] = dias
      .map((d, i) => ({ dia_semana: i, hora_inicio: d.inicio, hora_fin: d.fin, _on: d.enabled }))
      .filter((x) => x._on)
      .map(({ _on, ...f }) => f);
    setSaving(true);
    try {
      await realtorApi.putDisponibilidad(franjas);
      toast.success("Horario guardado");
    } catch {
      toast.error("No se pudo guardar el horario");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Skeleton className="h-64 w-full rounded-2xl" />;

  const diasOn = dias.filter((d) => d.enabled).length;
  const horas = dias.reduce((s, d) => s + horasDe(d), 0);
  const sel = "rounded-lg border px-2 py-1.5 text-[13px] tabular-nums";

  return (
    <div className="max-w-2xl">
      <Panel
        icon={Clock}
        tone="info"
        title="Mi horario de visitas"
        subtitle="Los interesados solo podrán agendar visitas en estas horas. Se restan automáticamente las visitas ya reservadas."
        flush
        actions={<Pill tone={diasOn > 0 ? "brand" : "neutral"}>{diasOn} días · {horas.toLocaleString("es-CO")} h/semana</Pill>}
      >
        {DIAS_LABEL.map((lbl, i) => (
          <div key={i} className="flex flex-wrap items-center gap-3 px-5 py-3" style={{ borderTop: i === 0 ? undefined : `1px solid ${C.line}`, background: dias[i].enabled ? undefined : "#FCFBF8" }}>
            <label className="flex w-36 cursor-pointer items-center gap-3">
              <Switch checked={dias[i].enabled} onCheckedChange={(v) => set(i, { enabled: v })} aria-label={lbl}
                className="data-[state=unchecked]:bg-[#CFC9BB]" />
              <span className="text-[13.5px] font-semibold" style={{ color: dias[i].enabled ? C.ink : C.muted }}>{lbl}</span>
            </label>
            {dias[i].enabled ? (
              <div className="flex items-center gap-2 text-sm">
                <select value={dias[i].inicio} onChange={(e) => set(i, { inicio: e.target.value })} className={sel} style={{ borderColor: C.line, color: C.ink, background: C.card }}>
                  {HORAS_OPC.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
                <span style={{ color: C.muted }}>a</span>
                <select value={dias[i].fin} onChange={(e) => set(i, { fin: e.target.value })} className={sel} style={{ borderColor: C.line, color: C.ink, background: C.card }}>
                  {HORAS_OPC.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ) : (
              <span className="text-[13px]" style={{ color: C.muted }}>Cerrado</span>
            )}
          </div>
        ))}
        <div className="flex justify-end px-5 py-4" style={{ borderTop: `1px solid ${C.line}` }}>
          <button onClick={guardar} disabled={saving}
            className="rounded-xl px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            style={{ background: C.brand }}>
            {saving ? "Guardando…" : "Guardar horario"}
          </button>
        </div>
      </Panel>
    </div>
  );
}

// ── Zonas: comprar patrocinio (self-serve) ────────────────────────────────────
type ZonasDisp = {
  comunas: { cd_comuna: number; nombre: string }[];
  barrios: { id: number; nombre: string; cd_comuna: number }[];
  ocupadas: { comuna: string[]; barrio: string[] };
  precios: { comuna: number; barrio: number };
};

function ZonasCompraTab() {
  const qc = useQueryClient();
  const { data: perfil } = useRealtorPerfil();
  const [nivel, setNivel] = useState<"comuna" | "barrio">("comuna");
  const [comunaFiltro, setComunaFiltro] = useState("");
  const [comunaSel, setComunaSel] = useState("");
  const [barrioSel, setBarrioSel] = useState("");
  const [meses, setMeses] = useState(1);
  const [confirmando, setConfirmando] = useState(false);

  const disp = useQuery<ZonasDisp>({
    queryKey: ["zonas", "disponibles"],
    queryFn: () => apiFetch<ZonasDisp>(API_ENDPOINTS.zonasDisponibles),
  });

  const comprar = useMutation({
    mutationFn: async (body: { zona_nivel: string; zona_codigo: string; meses: number }) => {
      // Pasarela existente
      const r = await apiFetch<{ checkout_url?: string; modo?: string }>(API_ENDPOINTS.zonasCheckout, { method: "POST", body: JSON.stringify(body) });
      if (r.checkout_url) { window.location.href = r.checkout_url; return; }
      await apiFetch(API_ENDPOINTS.zonasConfirmarSimulado, { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["realtor", "perfil"] });
      qc.invalidateQueries({ queryKey: ["zonas", "disponibles"] });
      setComunaSel(""); setBarrioSel(""); setConfirmando(false);
      toast.success("¡Zona adquirida! Ya patrocinas esa zona.");
    },
    onError: (e) => {
      setConfirmando(false);
      toast.error(/409/.test(String((e as Error).message)) ? "Esa zona ya tiene patrocinador" : "No se pudo completar la compra");
    },
  });

  const ocupComuna = new Set(disp.data?.ocupadas.comuna ?? []);
  const ocupBarrio = new Set(disp.data?.ocupadas.barrio ?? []);
  const barriosDeComuna = (disp.data?.barrios ?? []).filter((b) => String(b.cd_comuna) === comunaFiltro);
  const precioMes = nivel === "comuna" ? (disp.data?.precios.comuna ?? 0) : (disp.data?.precios.barrio ?? 0);
  const zonaCodigo = nivel === "comuna" ? comunaSel : barrioSel;
  const puede = !!zonaCodigo;
  const zonaNombre = nivel === "comuna"
    ? disp.data?.comunas.find((c) => String(c.cd_comuna) === comunaSel)?.nombre
    : disp.data?.barrios.find((b) => String(b.id) === barrioSel)?.nombre;
  const total = precioMes * meses;
  const onConfirmar = () => comprar.mutate({ zona_nivel: nivel, zona_codigo: zonaCodigo, meses });

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_300px]">
      <div className="space-y-5">
        <Panel icon={MapPinned} tone="brand" title="Mis zonas patrocinadas" count={perfil?.zonas_patrocinadas?.length ?? 0}
          subtitle="Los inmuebles que se publiquen en estas zonas te llegan como propietarios nuevos. Solo tú las patrocinas.">
          {(perfil?.zonas_patrocinadas?.length ?? 0) === 0 ? (
            <p className="text-[13px]" style={{ color: C.muted }}>Aún no patrocinas ninguna zona. Elige una abajo.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {perfil!.zonas_patrocinadas.map((z) => (
                <div key={z.codigo} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: C.soft }}>
                  <IconChip icon={MapPinned} tone={z.nivel === "comuna" ? "brand" : "warn"} size={32} />
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-semibold" style={{ color: C.ink }}><Name>{z.nombre}</Name></div>
                    <div className="text-[11.5px] capitalize" style={{ color: C.muted }}>{z.nivel} · activa</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel icon={Plus} tone="info" title="Comprar nueva zona" subtitle="Una zona = un solo patrocinador (exclusiva). Pago mensual recurrente.">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>1 · Nivel</div>
          <div className="mb-5 grid grid-cols-2 gap-2 sm:max-w-md">
            {(["comuna", "barrio"] as const).map((n) => {
              const on = nivel === n;
              return (
                <button
                  key={n}
                  onClick={() => { setNivel(n); setComunaSel(""); setBarrioSel(""); }}
                  aria-pressed={on}
                  className="rounded-xl p-3 text-left transition"
                  style={on
                    ? { background: TONE.brand.bg, boxShadow: `inset 0 0 0 2px ${C.brand}` }
                    : { background: C.card, boxShadow: `inset 0 0 0 1px ${C.line}` }}
                >
                  <div className="text-[14px] font-bold" style={{ color: C.ink }}>{n === "comuna" ? "Comuna" : "Barrio"}</div>
                  <div className="text-[12px] tabular-nums" style={{ color: on ? TONE.brand.fg : C.muted }}>
                    {formatCOP(n === "comuna" ? (disp.data?.precios.comuna ?? 0) : (disp.data?.precios.barrio ?? 0))}/mes
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>2 · Zona</div>
          {nivel === "barrio" && (
            <label className="mb-3 block text-sm">
              <span className="sr-only">Filtrar por comuna</span>
              <select
                value={comunaFiltro}
                onChange={(e) => { setComunaFiltro(e.target.value); setBarrioSel(""); }}
                className={`${inputCls} w-auto rounded-xl`}
              >
                <option value="">Elegir comuna…</option>
                {(disp.data?.comunas ?? []).map((c) => (
                  <option data-i18n-skip key={c.cd_comuna} value={String(c.cd_comuna)}>{c.nombre}</option>
                ))}
              </select>
            </label>
          )}

          <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
            {nivel === "comuna"
              ? (disp.data?.comunas ?? []).map((c) => {
                  const codigo = String(c.cd_comuna);
                  return (
                    <ZonaCard key={codigo} nombre={c.nombre} ocupada={ocupComuna.has(codigo)} selected={comunaSel === codigo}
                      onClick={() => setComunaSel(codigo)} />
                  );
                })
              : barriosDeComuna.map((b) => {
                  const codigo = String(b.id);
                  return (
                    <ZonaCard key={codigo} nombre={b.nombre} ocupada={ocupBarrio.has(codigo)} selected={barrioSel === codigo}
                      onClick={() => setBarrioSel(codigo)} />
                  );
                })}
            {nivel === "barrio" && !comunaFiltro && (
              <p className="col-span-full text-[13px]" style={{ color: C.muted }}>Elige una comuna arriba para ver sus barrios.</p>
            )}
          </div>
        </Panel>
      </div>

      {/* Resumen de compra */}
      <div className="lg:sticky lg:top-32">
        <Panel title="Resumen">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>3 · Duración</div>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Meses">
            {[1, 3, 6, 12].map((m) => {
              const on = meses === m;
              return (
                <button key={m} type="button" aria-pressed={on} onClick={() => setMeses(m)}
                  className="min-h-[36px] rounded-lg text-[12.5px] font-semibold transition"
                  style={on
                    ? { background: TONE.brand.bg, color: TONE.brand.fg, boxShadow: `inset 0 0 0 2px ${C.brand}` }
                    : { background: C.card, color: C.sub, boxShadow: `inset 0 0 0 1px ${C.line}` }}>
                  {m} {m === 1 ? "mes" : "meses"}
                </button>
              );
            })}
          </div>
          <dl className="mt-4 space-y-2 text-[13px]">
            <div className="flex justify-between gap-2"><dt style={{ color: C.muted }}>Zona</dt><dd className="truncate font-semibold" style={{ color: C.ink }}>{zonaNombre ?? "—"}</dd></div>
            <div className="flex justify-between gap-2"><dt style={{ color: C.muted }}>Precio</dt><dd className="tabular-nums" style={{ color: C.ink }}>{formatCOP(precioMes)}/mes</dd></div>
            <div className="flex items-baseline justify-between gap-2 pt-2" style={{ borderTop: `1px solid ${C.line}` }}>
              <dt style={{ color: C.muted }}>Total</dt><dd className="text-[20px] font-bold tabular-nums" style={{ color: C.ink }}>{formatCOP(total)}</dd>
            </div>
          </dl>
          <button onClick={() => setConfirmando(true)} disabled={!puede}
            className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
            style={{ background: C.brand }}>
            <Plus className="h-4 w-4" /> Comprar zona
          </button>
          <p className="mt-2 text-[11px]" style={{ color: C.muted }}>(Pasarela en conexión — modo demo por ahora.)</p>
        </Panel>
      </div>

      {confirmando && zonaNombre && (
        <ConfirmarCompraModal
          zonaNombre={zonaNombre}
          nivel={nivel}
          meses={meses}
          total={total}
          loading={comprar.isPending}
          onCancel={() => setConfirmando(false)}
          onConfirm={onConfirmar}
        />
      )}
    </div>
  );
}

function ZonaCard({ nombre, ocupada, selected, onClick }: { nombre: string; ocupada: boolean; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={ocupada}
      aria-pressed={selected}
      className="rounded-xl p-3 text-left text-[13px] transition disabled:cursor-not-allowed disabled:opacity-50"
      style={selected
        ? { background: TONE.brand.bg, boxShadow: `inset 0 0 0 2px ${C.brand}` }
        : { background: C.card, boxShadow: `inset 0 0 0 1px ${C.line}` }}
    >
      <div className="truncate font-semibold" style={{ color: C.ink }}>{nombre}</div>
      <div className="mt-0.5 flex items-center gap-1 text-[11px] font-medium" style={{ color: ocupada ? C.muted : TONE.brand.fg }}>
        {ocupada ? <Lock className="h-3 w-3" /> : selected ? <Check className="h-3 w-3" /> : null}
        {ocupada ? "Ocupada" : selected ? "Seleccionada" : "Disponible"}
      </div>
    </button>
  );
}

function ConfirmarCompraModal({
  zonaNombre, nivel, meses, total, loading, onCancel, onConfirm,
}: {
  zonaNombre: string; nivel: "comuna" | "barrio"; meses: number; total: number;
  loading: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onCancel} role="dialog" aria-modal="true" aria-label="Confirmar compra de zona">
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="paper-theme relative w-full max-w-sm rounded-lg border border-border bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-foreground">Confirmar patrocinio</h3>
        <div className="mt-3 space-y-2 rounded-lg border border-border bg-surface p-3 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Zona</span><span className="font-medium text-foreground">{zonaNombre}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Nivel</span><span className="font-medium text-foreground">{nivel === "comuna" ? "Comuna" : "Barrio"}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Duración</span><span className="font-medium text-foreground">{meses} {meses === 1 ? "mes" : "meses"}</span></div>
          <div className="flex justify-between border-t border-border pt-2"><span className="text-muted-foreground">Total</span><span className="font-bold text-foreground">{formatCOP(total)}</span></div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Zona exclusiva: al confirmar, ningún otro agente podrá patrocinarla mientras esté activa.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} disabled={loading}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:bg-surface disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60">
            {loading ? "Procesando…" : "Confirmar compra"}
          </button>
        </div>
      </div>
    </div>
  );
}
