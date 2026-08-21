import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Inbox, MapPinned, Plus } from "lucide-react";
import { apiFetch } from "@/lib/apiClient";
import { API_ENDPOINTS } from "@/config/api";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCOP } from "@/lib/format";
import { LanguageToggle } from "@/lib/i18n";
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
} from "@/lib/realtorApi";
import { toast } from "sonner";
import { GHL, ghlRedirect } from "@/config/ghl";
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
} from "@/hooks/useRealtorDashboard";

export const Route = createFileRoute("/realtor/dashboard")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem("medellin-social.user");
    if (!raw) throw redirect({ to: "/login" });
  },
  component: RealtorDashboardPage,
  head: () => ({
    meta: [{ title: "Dashboard · Realtor · Medellín Social" }],
  }),
});

// ── Tabs ───────────────────────────────────────────────────────────────────────

type Tab = "inbox" | "agenda" | "horario" | "zonas" | "listings" | "desempeno" | "inteligencia";

const TABS: { id: Tab; label: string }[] = [
  { id: "inbox",        label: "Inbox" },
  { id: "agenda",       label: "Agenda" },
  { id: "horario",      label: "Horario" },
  { id: "zonas",        label: "Zonas" },
  { id: "listings",     label: "Mis listings" },
  { id: "desempeno",    label: "Desempeño" },
  { id: "inteligencia", label: "Inteligencia" },
];

function RealtorDashboardPage() {
  const [tab, setTab] = useState<Tab>("inbox");
  const { isError, error, isLoading } = useRealtorPerfil();

  // La cuenta logueada existe pero no tiene fila `agent` (backend responde 403
  // en /realtor/me y por extensión en todos los demás endpoints). Sin este
  // check el dashboard se ve "vacío": nav sin perfil + cajas de error sueltas
  // en cada tab, que es indistinguible de "no carga nada".
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

  return (
    <div className="paper-theme min-h-screen bg-background">
      <RealtorNav tab={tab} onTab={setTab} />
      <main className="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-6">
        {tab === "inbox"        && <InboxTab />}
        {tab === "agenda"       && <AgendaTab />}
        {tab === "horario"      && <DisponibilidadTab />}
        {tab === "zonas"        && <ZonasCompraTab />}
        {tab === "listings"     && <ListingsTab />}
        {tab === "desempeno"    && <DesempenoTab />}
        {tab === "inteligencia" && <InteligenciaTab />}
      </main>
    </div>
  );
}

// ── Nav ────────────────────────────────────────────────────────────────────────

function RealtorNav({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const { data: perfil } = useRealtorPerfil();
  const { data: asignados } = useRealtorAsignados();
  const { data: agenda } = useAgenda();

  const nuevos = asignados?.filter((a) => a.estado === "asignado").length ?? 0;
  const visitasPendientes = agenda?.visitas.filter((v) => v.estado === "pendiente").length ?? 0;
  const initials = perfil?.nombre.split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();

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
                <div className="text-sm font-medium leading-tight text-foreground">{perfil.nombre}</div>
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

      <nav className="mx-auto max-w-6xl overflow-x-auto px-4 sm:px-6" aria-label="Secciones del dashboard">
        <div className="flex gap-6">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => onTab(id)}
              aria-current={tab === id ? "page" : undefined}
              className={`relative shrink-0 border-b-2 pb-2.5 pt-1 text-sm transition ${
                tab === id
                  ? "border-primary font-semibold text-foreground"
                  : "border-transparent font-medium text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
              {id === "inbox" && nuevos > 0 && (
                <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                  {nuevos}
                </span>
              )}
              {id === "agenda" && visitasPendientes > 0 && (
                <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                  {visitasPendientes}
                </span>
              )}
            </button>
          ))}
          <span className="my-auto h-4 w-px shrink-0 bg-border" aria-hidden />
          <Link
            to="/comparador"
            className="shrink-0 border-b-2 border-transparent pb-2.5 pt-1 text-sm font-medium text-muted-foreground transition hover:text-foreground"
          >
            Comparador
          </Link>
          <Link
            to="/simulador"
            className="shrink-0 border-b-2 border-transparent pb-2.5 pt-1 text-sm font-medium text-muted-foreground transition hover:text-foreground"
          >
            Simulador
          </Link>
        </div>
      </nav>
    </header>
  );
}

// ══ TAB 1: Inbox — lista | detalle ═════════════════════════════════════════════

type LeadItem =
  | { kind: "asignado"; id: string; data: ItemAsignado }
  | { kind: "pool"; id: string; data: ItemPool };

type LeadFilter = "todos" | "nuevos" | "proceso" | "pool";

const LEAD_FILTERS: { id: LeadFilter; label: string }[] = [
  { id: "todos",   label: "Todos" },
  { id: "nuevos",  label: "Nuevos" },
  { id: "proceso", label: "En proceso" },
  { id: "pool",    label: "Pool" },
];

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
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <SkeletonRows n={5} />
        <Skeleton className="hidden h-96 rounded-lg lg:block" />
      </div>
    );
  }

  if (errA) return <SectionError msg="No se pudieron cargar los inmuebles asignados." />;

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      {/* Lista */}
      <div className={`${selected ? "hidden lg:block" : ""}`}>
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por barrio u owner"
          className={inputCls}
          aria-label="Buscar leads"
        />
        <div className="mt-3 flex gap-4 border-b border-border text-sm">
          {LEAD_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFiltro(f.id)}
              className={`border-b-2 pb-2 transition ${
                filtro === f.id
                  ? "border-primary font-semibold text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="mt-3 overflow-hidden rounded-lg border border-border bg-surface">
          {visibles.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              {filtro === "pool"
                ? "El pool está vacío por ahora."
                : "Sin leads en esta vista. Cuando un propietario publique en tu zona, aparecerá aquí."}
            </p>
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
          <div className="grid h-full min-h-[320px] place-items-center rounded-lg border border-dashed border-border">
            <div className="text-center">
              <Inbox className="mx-auto h-5 w-5 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">Selecciona un lead para ver el detalle</p>
            </div>
          </div>
        )}
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

  return (
    <button
      onClick={onClick}
      className={`block w-full px-4 py-3 text-left transition ${
        first ? "" : "border-t border-border/70"
      } ${active ? "bg-primary/5" : "hover:bg-muted/40"}`}
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className={`flex min-w-0 items-center gap-2 text-sm ${esNuevo ? "font-semibold" : "font-medium"} text-foreground`}>
          {esNuevo && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-label="Nuevo" />}
          <span className="truncate">{titulo}</span>
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(d.created_at)}</span>
      </span>
      <span className="mt-0.5 block truncate text-sm text-muted-foreground">
        <span className="capitalize">{d.tipo_inmueble}</span> en {d.barrio} · {formatCOP(d.precio_esperado)}
      </span>
      <span className="mt-1.5 block">
        <LeadStatus lead={lead} />
      </span>
    </button>
  );
}

// Estado como punto + texto — color solo en el punto
function LeadStatus({ lead }: { lead: LeadItem }) {
  let dot = "bg-muted-foreground";
  let txt = "";
  if (lead.kind === "pool") {
    dot = "bg-accent"; txt = "Disponible en pool";
  } else {
    const a = lead.data;
    if (a.estado === "asignado") { dot = "bg-primary"; txt = "Nuevo · requiere respuesta"; }
    else if (!a.due_diligence.documentos_completos) { dot = "bg-warning"; txt = "Verificando documentos"; }
    else {
      const c = a.listing ? datosMinimosCompletos(a.listing) : null;
      if (c && !c.ok) { dot = "bg-warning"; txt = "Ficha incompleta"; }
      else { dot = "bg-success"; txt = "Listo para publicar"; }
    }
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
      {txt}
    </span>
  );
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

  let nextStep: { texto: string; accion?: { label: string; run: () => void; pending: boolean } };
  if (lead.kind === "pool") {
    nextStep = {
      texto: "Inmueble en pool abierto: el primer agente que lo tome se lo queda.",
      accion: { label: tomar.isPending ? "Tomando…" : "Tomar inmueble", run: () => tomar.mutate(d.id), pending: tomar.isPending },
    };
  } else if (esNuevo) {
    nextStep = {
      texto: "Acepta este inmueble para iniciar la verificación de documentos.",
      accion: { label: aceptar.isPending ? "Aceptando…" : "Aceptar inmueble", run: () => aceptar.mutate(d.id), pending: aceptar.isPending },
    };
  } else if (!ddOk) {
    nextStep = { texto: "Verifica con el propietario los documentos pendientes." };
  } else if (completeness && !completeness.ok) {
    nextStep = { texto: "Documentos al día. Completa la ficha para poder publicar." };
  } else {
    nextStep = {
      texto: "Todo listo para enviar a revisión.",
      accion: { label: publicar.isPending ? "Publicando…" : "Publicar listing", run: () => publicar.mutate(d.id), pending: publicar.isPending },
    };
  }

  return (
    <div className="rounded-lg border border-border bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={onBack}
            className="shrink-0 rounded-md border border-border p-1.5 text-muted-foreground transition hover:text-foreground lg:hidden"
            aria-label="Volver a la lista"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-foreground">
              {asignado ? asignado.owner_nombre : "Inmueble del pool"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {lead.kind === "pool" ? "Zona sin patrocinador" : "Asignado por tu zona"} · recibido {relativeTime(d.created_at)}
            </p>
          </div>
        </div>
        <LeadStatus lead={lead} />
      </div>

      {/* Siguiente paso */}
      <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-foreground">{nextStep.texto}</p>
        {nextStep.accion && (
          <button
            onClick={nextStep.accion.run}
            disabled={nextStep.accion.pending}
            className="shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            {nextStep.accion.label}
          </button>
        )}
      </div>

      <div className="grid gap-6 px-5 py-5 md:grid-cols-2">
        {/* Propiedad */}
        <section>
          <h3 className="text-sm font-semibold text-foreground">Propiedad</h3>
          <div className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
            {formatCOP(d.precio_esperado)}
            <span className="ml-2 text-sm font-normal capitalize text-muted-foreground">{d.operacion}</span>
          </div>
          <p className="mt-1 text-sm text-foreground">
            <span className="capitalize">{d.tipo_inmueble}</span> en {d.barrio}, {d.municipio}
          </p>
          {asignado && (
            <p className="mt-1 text-sm text-muted-foreground">
              {[
                asignado.declarado.area_m2 && `${asignado.declarado.area_m2} m²`,
                asignado.declarado.habitaciones != null && `${asignado.declarado.habitaciones} hab`,
                asignado.declarado.banos != null && `${asignado.declarado.banos} baños`,
              ].filter(Boolean).join(" · ") || "Sin características declaradas"}
            </p>
          )}
        </section>

        {/* Declarado por el propietario */}
        <section>
          <h3 className="text-sm font-semibold text-foreground">Declarado por el propietario</h3>
          {asignado ? (
            <ul className="mt-2 space-y-1.5">
              <DeclaradoItem label="Escritura" value={asignado.declarado.tiene_escritura} />
              <DeclaradoItem label="Predial al día" value={asignado.declarado.al_dia_predial} />
              <DeclaradoItem label="Administración al día" value={asignado.declarado.al_dia_administracion} />
              <DeclaradoItem label="Sin hipoteca" value={asignado.declarado.tiene_hipoteca == null ? null : !asignado.declarado.tiene_hipoteca} />
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
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
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-foreground">Campos de la ficha por completar</h3>
              <button
                onClick={() => setEditandoFicha(true)}
                className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90"
              >
                Completar ficha
              </button>
            </div>
            <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {completeness.faltan.map((f) => (
                <li key={f} className="text-sm capitalize text-muted-foreground">· {f}</li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {editandoFicha && asignado?.listing && (
        <EditorFichaModal
          listingId={asignado.listing.id}
          initial={{
            titulo: asignado.listing.titulo ?? "",
            precio: asignado.listing.precio ?? undefined,
            area_m2: asignado.listing.area_m2 ?? undefined,
            habitaciones: asignado.listing.habitaciones ?? undefined,
            banos: asignado.listing.banos ?? undefined,
          }}
          onClose={() => setEditandoFicha(false)}
        />
      )}
    </div>
  );
}

// ── Editor de ficha (modal compartido: inbox + mis listings) ───────────────────

function EditorFichaModal({
  listingId,
  initial,
  onClose,
}: {
  listingId: string;
  initial: { titulo?: string; precio?: number; area_m2?: number; habitaciones?: number; banos?: number };
  onClose: () => void;
}) {
  const editar = useEditarListing();
  const [titulo, setTitulo] = useState(initial.titulo ?? "");
  const [precio, setPrecio] = useState(initial.precio ? String(initial.precio) : "");
  const [area, setArea] = useState(initial.area_m2 ? String(initial.area_m2) : "");
  const [hab, setHab] = useState(initial.habitaciones != null ? String(initial.habitaciones) : "");
  const [banos, setBanos] = useState(initial.banos != null ? String(initial.banos) : "");
  const [descripcion, setDescripcion] = useState("");
  const [fotos, setFotos] = useState<File[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const guardar = async () => {
    const campos: import("@/lib/realtorApi").ListingPatch = {};
    if (titulo.trim() && titulo.trim() !== (initial.titulo ?? "")) campos.titulo = titulo.trim();
    if (precio && Number(precio) > 0 && Number(precio) !== initial.precio) campos.precio = Number(precio);
    if (area && Number(area) > 0 && Number(area) !== initial.area_m2) campos.area_m2 = Number(area);
    if (hab && Number(hab) !== initial.habitaciones) campos.habitaciones = Number(hab);
    if (banos && Number(banos) !== initial.banos) campos.banos = Number(banos);
    if (descripcion.trim()) campos.descripcion = descripcion.trim();

    if (Object.keys(campos).length === 0 && fotos.length === 0) {
      setErr("No hay cambios para guardar");
      return;
    }
    setErr(null);
    try {
      await editar.mutateAsync({ listingId, campos, fotos });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo guardar");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label="Editar ficha del listing">
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="paper-theme relative w-full max-w-md rounded-lg border border-border bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-foreground">Editar ficha</h3>

        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-xs text-muted-foreground">
            Título del aviso
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className={inputCls} placeholder="Apartamento en El Poblado con balcón" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-xs text-muted-foreground">
              Precio (COP)
              <input inputMode="numeric" value={precio} onChange={(e) => setPrecio(e.target.value.replace(/\D/g, ""))} className={inputCls} />
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Área (m²)
              <input inputMode="numeric" value={area} onChange={(e) => setArea(e.target.value.replace(/\D/g, ""))} className={inputCls} />
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Habitaciones
              <input inputMode="numeric" value={hab} onChange={(e) => setHab(e.target.value.replace(/\D/g, ""))} className={inputCls} />
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Baños
              <input inputMode="numeric" value={banos} onChange={(e) => setBanos(e.target.value.replace(/\D/g, ""))} className={inputCls} />
            </label>
          </div>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Descripción (opcional)
            <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className={`${inputCls} min-h-20 resize-y`} />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Agregar fotos {fotos.length > 0 && `(${fotos.length} seleccionadas)`}
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => setFotos(Array.from(e.target.files ?? []))}
              className="text-sm text-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground"
            />
          </label>
        </div>

        {err && <p className="mt-3 text-sm text-danger">{err}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground">
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={editar.isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            {editar.isPending ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
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
      <h3 className="text-sm font-semibold text-foreground">Verificación de documentos</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Revisa cada punto con el propietario. Con todo verificado, el listing recibe el sello.
      </p>

      {isLoading && <Skeleton className="mt-3 h-32 rounded-lg" />}
      {isError && <p className="mt-3 text-sm text-danger">No se pudo cargar el checklist.</p>}

      {data && (
        <div className="mt-3 overflow-hidden rounded-lg border border-border bg-background">
          {data.items.map((item, i) => (
            <div
              key={item.id}
              className={`flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between ${i > 0 ? "border-t border-border/60" : ""}`}
            >
              <div className="min-w-0">
                <span className="text-sm text-foreground">{DD_LABEL[item.clave] ?? item.clave.replaceAll("_", " ")}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  declaró: {item.declarado === true ? "sí" : item.declarado === false ? "no" : item.declarado ?? "sin dato"}
                </span>
                {item.nota && <span className="ml-2 text-xs italic text-muted-foreground">“{item.nota}”</span>}
              </div>

              {item.estado === "pendiente" ? (
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => verificar.mutate({ itemId: item.id, estado: "verificado" })}
                    disabled={verificar.isPending}
                    className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
                  >
                    Verificado
                  </button>
                  <button
                    onClick={() => verificar.mutate({ itemId: item.id, estado: "rechazado" })}
                    disabled={verificar.isPending}
                    className="rounded-md border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition hover:text-foreground disabled:opacity-50"
                  >
                    Rechazar
                  </button>
                </div>
              ) : (
                <span className={`inline-flex shrink-0 items-center gap-1.5 text-xs ${item.estado === "verificado" ? "text-success" : "text-danger"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${item.estado === "verificado" ? "bg-success" : "bg-danger"}`} aria-hidden />
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
    <li className="flex items-center justify-between gap-2 text-sm">
      <span className="text-foreground">{label}</span>
      {value === true  && <span className="font-medium text-success">Sí</span>}
      {value === false && <span className="font-medium text-danger">No</span>}
      {value == null   && <span className="text-muted-foreground">Sin dato</span>}
    </li>
  );
}

// ══ TAB 2: Agenda — solicitudes de visita + interesados ════════════════════════

function AgendaTab() {
  const { data, isLoading, isError } = useAgenda();
  const actualizar = useActualizarVisita();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <SkeletonRows n={3} />
        <Skeleton className="h-40 rounded-lg" />
      </div>
    );
  }
  if (isError || !data) return <SectionError msg="No se pudo cargar tu agenda." />;

  return <AgendaBody data={data} actualizar={actualizar} />;
}

type AgFiltro = "todas" | "pendiente" | "confirmada" | "realizada" | "cancelada";

function AgendaBody({ data, actualizar }: { data: Agenda; actualizar: ReturnType<typeof useActualizarVisita> }) {
  const [filtro, setFiltro] = useState<AgFiltro>("todas");
  const [verTodas, setVerTodas] = useState(false);
  const [verInteresados, setVerInteresados] = useState(false);

  const visitas = data.visitas;
  const nEstado = (e: VisitaSolicitud["estado"]) => visitas.filter((v) => v.estado === e).length;
  const filtradas =
    filtro === "todas" ? visitas
    : filtro === "cancelada" ? visitas.filter((v) => v.estado === "cancelada" || v.estado === "no_asistio")
    : visitas.filter((v) => v.estado === filtro);

  const LIMIT = 8;
  const visibles = verTodas ? filtradas : filtradas.slice(0, LIMIT);
  const chips: { id: AgFiltro; label: string; n: number }[] = [
    { id: "todas",      label: "Todas",       n: visitas.length },
    { id: "pendiente",  label: "Pendientes",  n: nEstado("pendiente") },
    { id: "confirmada", label: "Confirmadas", n: nEstado("confirmada") },
    { id: "realizada",  label: "Realizadas",  n: nEstado("realizada") },
    { id: "cancelada",  label: "Canceladas",  n: nEstado("cancelada") + nEstado("no_asistio") },
  ];

  const interesadosVis = verInteresados ? data.interesados : data.interesados.slice(0, LIMIT);

  return (
    <div className="space-y-10">
      <section>
        <SectionHeader title="Solicitudes de visita" count={visitas.length} sub="Personas que quieren ver tus inmuebles" />
        <div className="mb-3 flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <button
              key={c.id}
              onClick={() => { setFiltro(c.id); setVerTodas(false); }}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                filtro === c.id
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-surface text-muted-foreground hover:text-foreground"
              }`}
            >
              {c.label} <span className="opacity-60">{c.n}</span>
            </button>
          ))}
        </div>
        {filtradas.length === 0 ? (
          <EmptyState msg="No hay solicitudes con este filtro. Cuando alguien agende una visita desde el mapa, aparecerá aquí." />
        ) : (
          <>
            <div className="overflow-hidden rounded-lg border border-border bg-surface">
              {visibles.map((v, i) => (
                <VisitaRow
                  key={v.id}
                  visita={v}
                  first={i === 0}
                  pending={actualizar.isPending && actualizar.variables?.id === v.id}
                  onEstado={(estado, resultado) => actualizar.mutate({ id: v.id, estado, resultado })}
                />
              ))}
            </div>
            {filtradas.length > LIMIT && (
              <button
                onClick={() => setVerTodas((v) => !v)}
                className="mt-2 text-xs font-medium text-primary transition hover:underline"
              >
                {verTodas ? "Ver menos" : `Ver ${filtradas.length - LIMIT} más`}
              </button>
            )}
          </>
        )}
      </section>

      <section>
        <SectionHeader title="Interesados" count={data.interesados.length} sub="Usuarios que guardaron tus listings en favoritos" />
        {data.interesados.length === 0 ? (
          <EmptyState msg="Nadie ha guardado tus listings todavía." />
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-border bg-surface">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Usuario</th>
                    <th className="px-4 py-3 font-medium">Listing</th>
                    <th className="px-4 py-3 text-right font-medium">Guardado</th>
                  </tr>
                </thead>
                <tbody>
                  {interesadosVis.map((p, i) => (
                    <tr key={`${p.email}-${i}`} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{p.nombre ?? "Usuario"}</div>
                        <div className="text-xs text-muted-foreground">{p.email}</div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{p.listing_titulo}</td>
                      <td className="px-4 py-3 text-right text-xs text-muted-foreground">{relativeTime(p.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.interesados.length > LIMIT && (
              <button
                onClick={() => setVerInteresados((v) => !v)}
                className="mt-2 text-xs font-medium text-primary transition hover:underline"
              >
                {verInteresados ? "Ver menos" : `Ver ${data.interesados.length - LIMIT} más`}
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}

const VISITA_ESTADO: Record<VisitaSolicitud["estado"], { label: string; dot: string }> = {
  pendiente:  { label: "Pendiente",  dot: "bg-warning" },
  confirmada: { label: "Confirmada", dot: "bg-success" },
  realizada:  { label: "Realizada",  dot: "bg-muted-foreground" },
  cancelada:  { label: "Cancelada",  dot: "bg-muted-foreground" },
  no_asistio: { label: "No asistió", dot: "bg-danger" },
};

const RESULTADO_LABEL: Record<NonNullable<VisitaSolicitud["resultado"]>, string> = {
  interesado: "Interesado",
  oferta: "Hará oferta",
  descartado: "Descartado",
};

function VisitaRow({
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
  const { label, dot } = VISITA_ESTADO[v.estado];
  const fecha = v.fecha_visita
    ? new Date(v.fecha_visita).toLocaleString("es-CO", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
    : "Sin fecha propuesta";

  return (
    <div className={`flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${first ? "" : "border-t border-border/70"}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-medium text-foreground">{v.nombre}</span>
          {v.es_pro && (
            <span
              className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white"
              style={{ background: "#FF2D95" }}
              title="Lead de listing destacado — priorízalo"
            >
              🔥 Pro
            </span>
          )}
          {(() => {
            // SLA: Pro debe responderse en ≤4h; normal en ≤24h. horas_pendiente
            // es null cuando ya se atendió (estado != pendiente).
            const limite = v.es_pro ? 4 : 24;
            const vencido = v.horas_pendiente != null && v.horas_pendiente >= limite;
            if (!vencido) return null;
            return (
              <span
                className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white"
                style={{ background: "#E24B4A" }}
                title={`Sin responder hace ${v.horas_pendiente}h (SLA ${limite}h)`}
              >
                ⏰ Vencido
              </span>
            );
          })()}
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
            {label}
          </span>
        </div>
        <div className="mt-0.5 text-sm text-muted-foreground">
          {v.listing_titulo} · <span className="text-foreground">{fecha}</span>
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {[v.telefono, v.email].filter(Boolean).join(" · ") || "Sin datos de contacto"}
          {v.mensaje && ` · "${v.mensaje}"`}
          {v.resultado && (
            <span className="ml-1 font-medium text-foreground">· {RESULTADO_LABEL[v.resultado]}</span>
          )}
        </div>
      </div>

      {(v.estado === "pendiente" || v.estado === "confirmada") && (
        pidiendoResultado ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">¿Cómo terminó?</span>
            {(Object.keys(RESULTADO_LABEL) as (keyof typeof RESULTADO_LABEL)[]).map((r) => (
              <button
                key={r}
                onClick={() => { onEstado("realizada", r); setPidiendoResultado(false); }}
                disabled={pending}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-muted/50 disabled:opacity-50"
              >
                {RESULTADO_LABEL[r]}
              </button>
            ))}
            <button
              onClick={() => setPidiendoResultado(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Volver
            </button>
          </div>
        ) : (
          <div className="flex shrink-0 gap-2">
            {v.estado === "pendiente" && (
              <button
                onClick={() => onEstado("confirmada")}
                disabled={pending}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
              >
                Confirmar
              </button>
            )}
            {v.estado === "confirmada" && (
              <>
                <button
                  onClick={() => setPidiendoResultado(true)}
                  disabled={pending}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
                >
                  Marcar realizada
                </button>
                <button
                  onClick={() => onEstado("no_asistio")}
                  disabled={pending}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground disabled:opacity-50"
                >
                  No asistió
                </button>
              </>
            )}
            <button
              onClick={() => onEstado("cancelada")}
              disabled={pending}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        )
      )}
    </div>
  );
}

// ══ TAB 3: Mis listings ════════════════════════════════════════════════════════

const ESTADO_FILTER_OPTIONS: { value: EstadoListing | "todos"; label: string }[] = [
  { value: "todos",       label: "Todos" },
  { value: "publicado",   label: "Publicado" },
  { value: "en_revision", label: "En revisión" },
  { value: "borrador",    label: "Borrador" },
  { value: "rechazado",   label: "Rechazado" },
  { value: "pausado",     label: "Pausado" },
  { value: "cerrado",     label: "Cerrado" },
];

function ListingsTab() {
  const { data, isLoading, isError } = useMisListings();
  const [filtro, setFiltro] = useState<EstadoListing | "todos">("todos");
  const [editando, setEditando] = useState<MiListing | null>(null);

  const visible = useMemo(
    () => (filtro === "todos" ? data ?? [] : (data ?? []).filter((l) => l.estado === filtro)),
    [data, filtro],
  );

  return (
    <section>
      <SectionHeader title="Mis listings" count={data?.length} />

      {!isLoading && data && data.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-4 border-b border-border text-sm">
          {ESTADO_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFiltro(opt.value)}
              className={`border-b-2 pb-2 transition ${
                filtro === opt.value
                  ? "border-primary font-semibold text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {isLoading && <SkeletonRows n={3} />}

      {isError && <SectionError msg="No se pudieron cargar tus listings." />}

      {!isLoading && !isError && visible.length === 0 && (
        <EmptyState
          msg={
            filtro === "todos"
              ? "Aún no tienes listings. Publica tu primer inmueble desde el inbox."
              : `No tienes listings con estado "${filtro}".`
          }
        />
      )}

      {!isLoading && !isError && visible.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Listing</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 text-right font-medium">Precio</th>
                <th className="px-4 py-3 text-right font-medium">Vistas 30 días</th>
                <th className="px-4 py-3 text-right font-medium">Vistas totales</th>
                <th className="px-4 py-3 text-right font-medium">Actualizado</th>
                <th className="px-4 py-3" aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {visible.map((l) => <ListingTableRow key={l.id} listing={l} onEditar={() => setEditando(l)} />)}
            </tbody>
          </table>
        </div>
      )}

      {editando && (
        <EditorFichaModal
          listingId={editando.id}
          initial={{ titulo: editando.titulo, precio: editando.precio }}
          onClose={() => setEditando(null)}
        />
      )}
    </section>
  );
}

function ListingTableRow({ listing: l, onEditar }: { listing: MiListing; onEditar: () => void }) {
  const { label, dot } = ESTADO_META[l.estado];
  return (
    <tr className="border-b border-border/60 last:border-0 hover:bg-muted/30">
      <td className="px-4 py-3">
        <div className="max-w-[280px] truncate font-medium text-foreground">{l.titulo}</div>
        <div className="text-xs capitalize text-muted-foreground">
          {l.tipo_inmueble} · {l.operacion} · {l.barrio}
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center gap-1.5 text-xs text-foreground">
          <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
          {label}
        </span>
      </td>
      <td className="px-4 py-3 text-right font-medium tabular-nums text-foreground">{formatCOP(l.precio)}</td>
      <td className="px-4 py-3 text-right tabular-nums text-foreground">
        {l.estado === "publicado" ? l.vistas_30d.toLocaleString("es-CO") : "—"}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
        {l.vistas_total > 0 ? l.vistas_total.toLocaleString("es-CO") : "—"}
      </td>
      <td className="px-4 py-3 text-right text-xs text-muted-foreground">{relativeTime(l.updated_at)}</td>
      <td className="px-4 py-3 text-right">
        {l.estado !== "cerrado" && (
          <button
            onClick={onEditar}
            className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:text-foreground"
          >
            Editar
          </button>
        )}
      </td>
    </tr>
  );
}

const ESTADO_META: Record<EstadoListing, { label: string; dot: string }> = {
  publicado:   { label: "Publicado",   dot: "bg-success" },
  en_revision: { label: "En revisión", dot: "bg-warning" },
  borrador:    { label: "Borrador",    dot: "bg-muted-foreground" },
  pausado:     { label: "Pausado",     dot: "bg-muted-foreground" },
  rechazado:   { label: "Rechazado",   dot: "bg-danger" },
  cerrado:     { label: "Cerrado",     dot: "bg-muted-foreground" },
};

// ══ TAB 3: Desempeño ═══════════════════════════════════════════════════════════

function DesempenoTab() {
  const { data, isLoading, isError } = useDesempeno();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  if (isError || !data) {
    return <SectionError msg="No se pudo cargar tu desempeño." />;
  }

  const tasa = data.tasa_aceptacion != null ? `${Math.round(data.tasa_aceptacion * 100)}%` : "—";
  const mediana = data.mediana_horas_aceptar != null
    ? data.mediana_horas_aceptar < 48
      ? `${data.mediana_horas_aceptar} h`
      : `${Math.round(data.mediana_horas_aceptar / 24)} d`
    : "—";

  return (
    <div className="space-y-10">
      <section>
        <SectionHeader title="Tu desempeño" sub="Últimos 90 días" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatTile
            label="Tasa de aceptación"
            value={tasa}
            sub={`${data.aceptados_90d} de ${data.asignados_90d} asignados`}
          />
          <StatTile
            label="Velocidad de respuesta"
            value={mediana}
            sub="mediana hasta aceptar"
          />
          <StatTile
            label="Vistas en 30 días"
            value={data.vistas_30d.toLocaleString("es-CO")}
            sub={`${data.vistas_total.toLocaleString("es-CO")} históricas`}
          />
          <StatTile
            label="Asistencia a visitas"
            value={data.show_rate != null ? `${Math.round(data.show_rate * 100)}%` : "—"}
            sub={`${data.visitas_realizadas_90d} realizadas · ${data.visitas_no_show_90d} plantones`}
          />
          <StatTile
            label="Visitas con oferta"
            value={data.ofertas_90d}
            sub={`${data.interesados_90d} más quedaron interesados`}
          />
          <StatTile
            label="Cierres"
            value={data.zonas.reduce((s, z) => s + z.cerrados_total, 0)}
            sub="en zonas patrocinadas"
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Los asignados no aceptados a tiempo pueden volver al pool. Responder rápido protege tu zona.
        </p>
      </section>

      <section>
        <SectionHeader title="Retorno de tus zonas patrocinadas" sub="Este mes" />
        {data.zonas.length === 0 ? (
          <EmptyState msg="No tienes zonas patrocinadas activas. Patrocina un barrio o comuna para recibir inmuebles con prioridad." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {data.zonas.map((z) => <RoiZonaCard key={z.zona_codigo} zona={z} />)}
          </div>
        )}
      </section>
    </div>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

function RoiZonaCard({ zona: z }: { zona: RoiZona }) {
  const embudo = [
    { label: "Inmuebles en la zona", value: z.intakes_mes },
    { label: "Tomados por ti",       value: z.tomados_mes },
    { label: "Publicados",           value: z.publicados_total },
    { label: "Cerrados",             value: z.cerrados_total },
  ];
  const max = Math.max(z.intakes_mes, 1);

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {z.zona_nombre}
            <span className="ml-2 text-xs font-normal capitalize text-muted-foreground">{z.nivel}</span>
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Patrocinio {formatCOP(z.precio_mensual)}/mes
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-xs text-muted-foreground">Costo por inmueble</div>
          <div className="text-lg font-semibold tabular-nums text-foreground">
            {z.costo_por_intake != null ? formatCOP(z.costo_por_intake) : "—"}
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {embudo.map(({ label, value }) => (
          <div key={label} className="flex items-center gap-3">
            <span className="w-40 shrink-0 text-xs text-muted-foreground">{label}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.min(100, (value / max) * 100)}%` }}
              />
            </div>
            <span className="w-8 shrink-0 text-right text-sm font-medium tabular-nums text-foreground">{value}</span>
          </div>
        ))}
      </div>

      <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
        <span className="font-medium tabular-nums text-foreground">{z.vistas_30d.toLocaleString("es-CO")}</span>{" "}
        vistas a tus listings de esta zona en los últimos 30 días
      </p>
    </div>
  );
}

// ══ TAB 4: Inteligencia ════════════════════════════════════════════════════════

function InteligenciaTab() {
  const { data: perfil } = useRealtorPerfil();
  const { data: listings } = useMisListings();

  const zonas = useMemo(() => {
    const map = new Map<string, string>();
    for (const z of perfil?.zonas_patrocinadas ?? []) map.set(z.codigo, z.nombre);
    for (const l of listings ?? []) {
      if (l.barrio) {
        const code = l.barrio.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
        if (!map.has(code)) map.set(code, l.barrio);
      }
    }
    return Array.from(map.entries()).map(([codigo, nombre]) => ({ codigo, nombre }));
  }, [perfil, listings]);

  const [selectedZona, setSelectedZona] = useState<string | null>(null);
  const activeZona = selectedZona ?? zonas[0]?.codigo ?? null;

  const { data: intel, isLoading, isError } = useInteligenciaBarrio(activeZona);

  return (
    <section>
      <SectionHeader title="Inteligencia de barrio" />

      {zonas.length === 0 ? (
        <EmptyState msg="Agrega listings o patrocina una zona para ver métricas de mercado." />
      ) : (
        <>
          <div className="mb-4">
            <select
              value={activeZona ?? ""}
              onChange={(e) => setSelectedZona(e.target.value || null)}
              className={inputCls}
              style={{ maxWidth: 260 }}
              aria-label="Seleccionar zona de análisis"
            >
              {zonas.map((z) => (
                <option key={z.codigo} value={z.codigo}>{z.nombre}</option>
              ))}
            </select>
          </div>

          {isLoading && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-lg" />
              ))}
            </div>
          )}

          {isError && <SectionError msg="No se pudo cargar la inteligencia del barrio." />}

          {!isLoading && !isError && intel && (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <StatTile
                  label="Score consolidado"
                  value={`${Math.round(intel.score_consolidado)} / 100`}
                  sub="potencial de inversión"
                />
                <StatTile
                  label="Liquidez"
                  value={`${Math.round(intel.liquidez)} / 100`}
                  sub="facilidad de venta"
                />
                <StatTile
                  label="Mediana m² venta"
                  value={formatCOP(Math.round(intel.mediana_venta_m2))}
                  sub="precio por m²"
                />
                <StatTile
                  label="Tiempo estimado de venta"
                  value={intel.tiempo_estimado_venta ?? "—"}
                  sub="en el mercado"
                />
              </div>

              <p className="mt-3 text-xs text-muted-foreground">
                Las medianas son nominales; deflactar con IPC (DANE) antes de comparar períodos.
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}

// ── Atoms ──────────────────────────────────────────────────────────────────────

function SectionHeader({ title, count, sub }: { title: string; count?: number; sub?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-semibold text-foreground">
        {title}
        {count != null && <span className="ml-2 font-normal text-muted-foreground">({count})</span>}
      </h2>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center">
      <p className="mx-auto max-w-sm text-sm text-muted-foreground">{msg}</p>
    </div>
  );
}

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
const DIAS_LABEL = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const HORAS_OPC: string[] = (() => {
  const out: string[] = [];
  for (let h = 6; h <= 21; h++) for (const m of ["00", "30"]) out.push(`${String(h).padStart(2, "0")}:${m}`);
  return out;
})();
type DiaState = { enabled: boolean; inicio: string; fin: string };

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

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Mi horario de visitas</h2>
        <p className="text-sm text-muted-foreground">
          Los interesados solo podrán agendar visitas en estas horas. Se restan automáticamente las visitas ya reservadas.
        </p>
      </div>
      <div className="divide-y divide-border rounded-xl border border-border">
        {DIAS_LABEL.map((lbl, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <label className="flex w-32 items-center gap-2">
              <input type="checkbox" checked={dias[i].enabled} onChange={(e) => set(i, { enabled: e.target.checked })} />
              <span className="text-sm font-medium text-foreground">{lbl}</span>
            </label>
            {dias[i].enabled ? (
              <div className="flex items-center gap-2 text-sm">
                <select value={dias[i].inicio} onChange={(e) => set(i, { inicio: e.target.value })}
                  className="rounded border border-border bg-surface px-2 py-1 text-foreground">
                  {HORAS_OPC.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
                <span className="text-muted-foreground">a</span>
                <select value={dias[i].fin} onChange={(e) => set(i, { fin: e.target.value })}
                  className="rounded border border-border bg-surface px-2 py-1 text-foreground">
                  {HORAS_OPC.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">Cerrado</span>
            )}
          </div>
        ))}
      </div>
      <button onClick={guardar} disabled={saving}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60">
        {saving ? "Guardando…" : "Guardar horario"}
      </button>
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
  const [comunaSel, setComunaSel] = useState("");
  const [barrioSel, setBarrioSel] = useState("");
  const [meses, setMeses] = useState(1);

  const disp = useQuery<ZonasDisp>({
    queryKey: ["zonas", "disponibles"],
    queryFn: () => apiFetch<ZonasDisp>(API_ENDPOINTS.zonasDisponibles),
  });

  const comprar = useMutation({
    mutationFn: async (body: { zona_nivel: string; zona_codigo: string; meses: number }) => {
      const ghlUrl = body.zona_nivel === "comuna" ? GHL.agente_comuna : GHL.agente_barrio;
      if (ghlUrl) {
        ghlRedirect(ghlUrl, { nivel: body.zona_nivel, zona: body.zona_codigo, meses: body.meses });
        return;
      }
      // Fallback: pasarela existente
      const r = await apiFetch<{ checkout_url?: string; modo?: string }>(API_ENDPOINTS.zonasCheckout, { method: "POST", body: JSON.stringify(body) });
      if (r.checkout_url) { window.location.href = r.checkout_url; return; }
      await apiFetch(API_ENDPOINTS.zonasConfirmarSimulado, { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["realtor", "perfil"] });
      qc.invalidateQueries({ queryKey: ["zonas", "disponibles"] });
      setComunaSel(""); setBarrioSel("");
      toast.success("¡Zona adquirida! Ya patrocinas esa zona.");
    },
    onError: (e) => toast.error(/409/.test(String((e as Error).message)) ? "Esa zona ya tiene patrocinador" : "No se pudo completar la compra"),
  });

  const ocupComuna = new Set(disp.data?.ocupadas.comuna ?? []);
  const ocupBarrio = new Set(disp.data?.ocupadas.barrio ?? []);
  const comunasLibres = (disp.data?.comunas ?? []).filter((c) => !ocupComuna.has(String(c.cd_comuna)));
  const barriosDeComuna = (disp.data?.barrios ?? []).filter((b) => String(b.cd_comuna) === comunaSel && !ocupBarrio.has(String(b.id)));
  const precioMes = nivel === "comuna" ? (disp.data?.precios.comuna ?? 0) : (disp.data?.precios.barrio ?? 0);
  const puede = nivel === "comuna" ? !!comunaSel : !!barrioSel;
  const onComprar = () => comprar.mutate({ zona_nivel: nivel, zona_codigo: nivel === "comuna" ? comunaSel : barrioSel, meses });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <section>
        <h2 className="text-lg font-semibold text-foreground">Mis zonas patrocinadas</h2>
        <p className="mb-3 text-sm text-muted-foreground">Los listings de estas zonas te llegan como leads. Solo tú las patrocinas.</p>
        {(perfil?.zonas_patrocinadas?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no patrocinas ninguna zona. Compra una abajo.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {perfil!.zonas_patrocinadas.map((z) => (
              <span key={z.codigo} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-sm text-foreground">
                <MapPinned className={`h-3.5 w-3.5 ${z.nivel === "comuna" ? "text-primary" : "text-warning"}`} />
                {z.nombre} <span className="text-xs text-muted-foreground">({z.nivel})</span>
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-3 text-lg font-semibold text-foreground">Comprar nueva zona</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Nivel</span>
            <select value={nivel} onChange={(e) => { setNivel(e.target.value as "comuna" | "barrio"); setBarrioSel(""); }}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground">
              <option value="comuna">Comuna</option>
              <option value="barrio">Barrio</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Comuna</span>
            <select value={comunaSel} onChange={(e) => { setComunaSel(e.target.value); setBarrioSel(""); }}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground">
              <option value="">{nivel === "comuna" ? "Elegir comuna…" : "Filtrar…"}</option>
              {(nivel === "comuna" ? comunasLibres : disp.data?.comunas ?? []).map((c) => (
                <option key={c.cd_comuna} value={String(c.cd_comuna)}>{c.nombre}</option>
              ))}
            </select>
          </label>
          {nivel === "barrio" && (
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Barrio</span>
              <select value={barrioSel} onChange={(e) => setBarrioSel(e.target.value)} disabled={!comunaSel}
                className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground">
                <option value="">Elegir barrio…</option>
                {barriosDeComuna.map((b) => <option key={b.id} value={String(b.id)}>{b.nombre}</option>)}
              </select>
            </label>
          )}
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Meses</span>
            <select value={meses} onChange={(e) => setMeses(Number(e.target.value))}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground">
              {[1, 3, 6, 12].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            Total: <span className="text-base font-bold text-foreground">{formatCOP(precioMes * meses)}</span>
            <span className="text-xs"> ({formatCOP(precioMes)}/mes × {meses})</span>
          </div>
          <button onClick={onComprar} disabled={!puede || comprar.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
            <Plus className="h-4 w-4" /> {comprar.isPending ? "Procesando…" : "Comprar zona"}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Una zona = un solo patrocinador (exclusiva). Pago mensual recurrente. (Pasarela en conexión — modo demo por ahora.)</p>
      </section>
    </div>
  );
}
