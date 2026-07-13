import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Building2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Globe,
  LayoutDashboard,
  ListChecks,
  MapPin,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCOP } from "@/lib/format";
import { datosMinimosCompletos, type EstadoListing, type ItemAsignado, type ItemPool, type MiListing } from "@/lib/realtorApi";
import {
  useInteligenciaBarrio,
  useMisListings,
  usePublicarAsignado,
  useRealtorAsignados,
  useRealtorPerfil,
  useRealtorPool,
  useTomarDelPool,
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

// ── Page ───────────────────────────────────────────────────────────────────────

function RealtorDashboardPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 pb-20 pt-24 sm:px-6">
        <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
          <LayoutDashboard className="h-3.5 w-3.5" />
          <span>Dashboard de agente</span>
        </div>

        <DashboardHeader />

        <div className="mt-8 space-y-10">
          <MetricCards />
          <AsignadosSection />
          <PoolSection />
          <MisListingsSection />
          <InteligenciaSection />
        </div>
      </main>
    </div>
  );
}

// ── 1. Header ──────────────────────────────────────────────────────────────────

function DashboardHeader() {
  const { data: perfil, isLoading } = useRealtorPerfil();

  if (isLoading) {
    return (
      <div className="flex items-center gap-4">
        <Skeleton className="h-14 w-14 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3.5 w-32" />
        </div>
      </div>
    );
  }

  if (!perfil) return null;

  const initials = perfil.nombre.split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-primary/30 to-primary/10 text-lg font-bold text-primary ring-2 ring-primary/20">
          {perfil.avatar
            ? <img src={perfil.avatar} alt={perfil.nombre} className="h-full w-full object-cover" />
            : initials}
        </div>

        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-semibold text-foreground">{perfil.nombre}</h1>
            {perfil.estado === "activo" && (
              <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                <BadgeCheck className="h-3 w-3" /> Verificada
              </span>
            )}
            {perfil.estado === "pendiente" && (
              <span className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning">
                Pendiente de aprobación
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Agente inmobiliario</p>
        </div>
      </div>

      {perfil.zonas_patrocinadas.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {perfil.zonas_patrocinadas.map((z) => (
            <span
              key={z.codigo}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-foreground"
            >
              <MapPin className="h-3 w-3 text-primary" />
              <span className="font-medium">{z.nombre}</span>
              {z.tier && (
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  · {z.tier}
                </span>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 2. Metric cards ────────────────────────────────────────────────────────────

function MetricCards() {
  const { data: asignados, isLoading: loadA } = useRealtorAsignados();
  const { data: pool,      isLoading: loadP } = useRealtorPool();
  const { data: listings,  isLoading: loadL } = useMisListings();

  const publicados  = listings?.filter((l) => l.estado === "publicado").length ?? 0;
  const enRevision  = listings?.filter((l) => l.estado === "en_revision").length ?? 0;
  const pendientes  = asignados?.filter((a) => !a.due_diligence.documentos_completos || (a.listing && !datosMinimosCompletos(a.listing).ok)).length ?? 0;
  const poolCount   = pool?.length ?? 0;

  const loading = loadA || loadP || loadL;

  const cards = [
    { label: "Publicados",          value: publicados, icon: Globe,         color: "text-success" },
    { label: "En revisión",         value: enRevision, icon: ClipboardList, color: "text-warning" },
    { label: "Asignados pendientes",value: pendientes, icon: ListChecks,    color: "text-primary" },
    { label: "Pool disponible",     value: poolCount,  icon: Zap,           color: "text-accent"  },
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map(({ label, value, icon: Icon, color }) => (
        <div key={label} className="rounded-2xl border border-border bg-surface p-4">
          {loading ? (
            <>
              <Skeleton className="h-8 w-12 mb-1" />
              <Skeleton className="h-3 w-24" />
            </>
          ) : (
            <>
              <div className={`font-display text-3xl font-bold ${color}`}>{value}</div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon className={`h-3 w-3 ${color}`} />
                {label}
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

// ── 3. Asignados ───────────────────────────────────────────────────────────────

function AsignadosSection() {
  const { data, isLoading, isError } = useRealtorAsignados();
  const publicar = usePublicarAsignado();

  return (
    <section>
      <SectionHeader
        icon={<ListChecks className="h-4 w-4" />}
        title="Asignados a ti · due diligence pendiente"
        count={data?.length}
      />

      {isLoading && <SkeletonRows n={2} />}

      {isError && (
        <SectionError msg="No se pudieron cargar los inmuebles asignados." />
      )}

      {!isLoading && !isError && data?.length === 0 && (
        <EmptyState
          icon={<ListChecks className="h-5 w-5" />}
          msg="No tienes inmuebles asignados. Cuando un owner publique en tu zona, aparecerá aquí."
        />
      )}

      {!isLoading && !isError && data && data.length > 0 && (
        <div className="space-y-3">
          {data.map((item) => (
            <AsignadoRow
              key={item.id}
              item={item}
              publishing={publicar.isPending && publicar.variables === item.id}
              onPublicar={() => publicar.mutate(item.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function AsignadoRow({
  item,
  publishing,
  onPublicar,
}: {
  item: ItemAsignado;
  publishing: boolean;
  onPublicar: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const ddOk        = item.due_diligence.documentos_completos;
  const completeness = item.listing ? datosMinimosCompletos(item.listing) : null;
  const readyToPublish = ddOk && completeness?.ok === true;
  const needsCompletion = ddOk && completeness !== null && !completeness.ok;

  return (
    <div className="rounded-2xl border border-border bg-surface">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        {/* Left: property info */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground capitalize">
              {item.tipo_inmueble} en {item.barrio}
            </span>
            <span className="text-xs text-muted-foreground">{item.municipio}</span>
            <OperacionBadge operacion={item.operacion} />
          </div>

          <div className="mt-1 text-sm font-semibold text-primary">
            {formatCOP(item.precio_esperado)}
          </div>

          <div className="mt-2 grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
            <span><span className="font-medium text-foreground">Owner:</span> {item.owner_nombre}</span>
            {item.declarado.area_m2 && <span>{item.declarado.area_m2} m²</span>}
            {item.declarado.habitaciones != null && <span>{item.declarado.habitaciones} hab · {item.declarado.banos} baños</span>}
            <span className="col-span-2 text-[11px]">
              Recibido {relativeTime(item.created_at)}
            </span>
          </div>
        </div>

        {/* Right: action button + dd badge */}
        <div className="flex shrink-0 flex-col items-end gap-2">
          <DueDiligenceBadge ok={ddOk} />

          {!ddOk && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-surface"
            >
              Revisar
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          )}

          {needsCompletion && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-md border border-warning/50 bg-warning/10 px-3 py-1.5 text-xs font-semibold text-warning transition hover:bg-warning/20"
              aria-label="Ver campos faltantes del listing"
            >
              Completar ficha
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          )}

          {readyToPublish && (
            <button
              onClick={onPublicar}
              disabled={publishing}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50 glow-cyan"
              aria-label={`Publicar listing del inmueble en ${item.barrio}`}
            >
              {publishing ? "Publicando…" : "Publicar"}
            </button>
          )}
        </div>
      </div>

      {/* Expanded panel */}
      {expanded && !ddOk && (
        <div className="border-t border-border px-4 py-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-warning">
            Documentos faltantes
          </p>
          <ul className="space-y-1">
            {item.due_diligence.faltantes.map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm text-warning/90">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                <span className="capitalize">{f}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Contacta al owner para obtener la documentación faltante antes de continuar.
          </p>
        </div>
      )}

      {expanded && needsCompletion && completeness && (
        <div className="border-t border-border px-4 py-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-warning">
            Campos del listing por completar
          </p>
          <ul className="space-y-1">
            {completeness.faltan.map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm text-warning/90">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                <span className="capitalize">{f}</span>
              </li>
            ))}
          </ul>
          {/* TODO: navegar al form cuando exista → /realtor/listings/:id/editar?highlight=campo1,campo2 */}
          <p className="mt-2 text-xs text-muted-foreground">
            Completa estos campos en el formulario del listing para poder publicar.
          </p>
        </div>
      )}
    </div>
  );
}

// ── 4. Pool ────────────────────────────────────────────────────────────────────

function PoolSection() {
  const { data, isLoading, isError } = useRealtorPool();
  const tomar = useTomarDelPool();

  return (
    <section>
      <SectionHeader
        icon={<Zap className="h-4 w-4" />}
        title="Oportunidades en el pool · first-come"
        count={data?.length}
      />

      {isLoading && <SkeletonRows n={3} />}

      {isError && <SectionError msg="No se pudo cargar el pool de oportunidades." />}

      {!isLoading && !isError && data?.length === 0 && (
        <EmptyState
          icon={<Zap className="h-5 w-5" />}
          msg="El pool está vacío en este momento. Los inmuebles de zonas sin patrocinador aparecen aquí en orden de llegada."
        />
      )}

      {!isLoading && !isError && data && data.length > 0 && (
        <div className="space-y-2">
          {data.map((item) => (
            <PoolRow
              key={item.id}
              item={item}
              taking={tomar.isPending && tomar.variables === item.id}
              onTomar={() => tomar.mutate(item.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function PoolRow({
  item,
  taking,
  onTomar,
}: {
  item: ItemPool;
  taking: boolean;
  onTomar: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-foreground capitalize">
            {item.tipo_inmueble} · {item.barrio}
          </span>
          <span className="text-xs text-muted-foreground">{item.municipio}</span>
          <OperacionBadge operacion={item.operacion} />
        </div>
        <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="font-semibold text-primary">{formatCOP(item.precio_esperado)}</span>
          <span>{relativeTime(item.created_at)}</span>
        </div>
      </div>
      <button
        onClick={onTomar}
        disabled={taking}
        className="ml-4 shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        aria-label={`Tomar inmueble en ${item.barrio}`}
      >
        {taking ? "Tomando…" : "Tomar"}
      </button>
    </div>
  );
}

// ── 5. Mis listings ────────────────────────────────────────────────────────────

const ESTADO_FILTER_OPTIONS: { value: EstadoListing | "todos"; label: string }[] = [
  { value: "todos",       label: "Todos" },
  { value: "publicado",   label: "Publicado" },
  { value: "en_revision", label: "En revisión" },
  { value: "borrador",    label: "Borrador" },
  { value: "rechazado",   label: "Rechazado" },
  { value: "pausado",     label: "Pausado" },
  { value: "cerrado",     label: "Cerrado" },
];

function MisListingsSection() {
  const { data, isLoading, isError } = useMisListings();
  const [filtro, setFiltro] = useState<EstadoListing | "todos">("todos");

  const visible = useMemo(
    () => (filtro === "todos" ? data ?? [] : (data ?? []).filter((l) => l.estado === filtro)),
    [data, filtro],
  );

  return (
    <section>
      <SectionHeader
        icon={<Building2 className="h-4 w-4" />}
        title="Mis listings"
        count={data?.length}
      />

      {/* Filter pills */}
      {!isLoading && data && data.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {ESTADO_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFiltro(opt.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                filtro === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface border border-border text-muted-foreground hover:text-foreground"
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
          icon={<Building2 className="h-5 w-5" />}
          msg={
            filtro === "todos"
              ? "Aún no has creado listings. Publica tu primer inmueble desde la sección de asignados."
              : `No tienes listings con estado "${filtro}".`
          }
        />
      )}

      {!isLoading && !isError && visible.length > 0 && (
        <div className="space-y-2">
          {visible.map((l) => (
            <ListingRow key={l.id} listing={l} />
          ))}
        </div>
      )}
    </section>
  );
}

function ListingRow({ listing: l }: { listing: MiListing }) {
  const { label, cls } = ESTADO_META[l.estado];

  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-foreground">{l.titulo}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="capitalize">{l.tipo_inmueble}</span>
          <span>·</span>
          <span className="capitalize">{l.operacion}</span>
          <span>·</span>
          <span className="font-semibold text-foreground/80">{formatCOP(l.precio)}</span>
          <span>·</span>
          <span>{l.barrio}</span>
          <span>·</span>
          <span>{relativeTime(l.updated_at)}</span>
        </div>
      </div>
      <span className={`ml-3 shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
        {label}
      </span>
    </div>
  );
}

const ESTADO_META: Record<EstadoListing, { label: string; cls: string }> = {
  publicado:   { label: "Publicado",   cls: "bg-success/15 text-success" },
  en_revision: { label: "En revisión", cls: "bg-warning/15 text-warning" },
  borrador:    { label: "Borrador",    cls: "bg-muted/40 text-muted-foreground" },
  pausado:     { label: "Pausado",     cls: "bg-muted/40 text-muted-foreground" },
  rechazado:   { label: "Rechazado",   cls: "bg-danger/15 text-danger" },
  cerrado:     { label: "Cerrado",     cls: "bg-muted/40 text-muted-foreground" },
};

// ── 6. Inteligencia de barrio ──────────────────────────────────────────────────

function InteligenciaSection() {
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
      <SectionHeader
        icon={<TrendingUp className="h-4 w-4" />}
        title="Inteligencia de barrio"
      />

      {zonas.length === 0 ? (
        <EmptyState
          icon={<TrendingUp className="h-5 w-5" />}
          msg="Agrega listings o patrocina una zona para ver métricas de mercado."
        />
      ) : (
        <>
          {/* Zone selector */}
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
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-2xl" />
              ))}
            </div>
          )}

          {isError && <SectionError msg="No se pudo cargar la inteligencia del barrio." />}

          {!isLoading && !isError && intel && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <IntelCard
                  label="Score consolidado"
                  value={Math.round(intel.score_consolidado)}
                  suffix="/ 100"
                  color="text-primary"
                />
                <IntelCard
                  label="Liquidez"
                  value={Math.round(intel.liquidez)}
                  suffix="/ 100"
                  color="text-success"
                />
                <IntelCard
                  label="Mediana m² venta"
                  value={formatCOP(Math.round(intel.mediana_venta_m2))}
                  color="text-foreground"
                />
                <IntelCard
                  label="Días en mercado"
                  value={Math.round(intel.dias_promedio_mercado)}
                  suffix=" días"
                  color="text-warning"
                />
              </div>

              <p className="mt-3 text-[11px] text-muted-foreground">
                * Las medianas son nominales y deben deflactarse con IPC (DANE) antes de comparar períodos.
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}

function IntelCard({
  label,
  value,
  suffix = "",
  color,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className={`font-display text-2xl font-bold ${color}`}>
        {value}
        {suffix && <span className="text-sm font-normal text-muted-foreground">{suffix}</span>}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

// ── Atoms ──────────────────────────────────────────────────────────────────────

function SectionHeader({
  icon,
  title,
  count,
}: {
  icon: React.ReactNode;
  title: string;
  count?: number;
}) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <span className="text-primary">{icon}</span>
      <h2 className="font-display text-xl font-semibold text-foreground">{title}</h2>
      {count != null && (
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {count}
        </span>
      )}
    </div>
  );
}

function EmptyState({ icon, msg }: { icon: React.ReactNode; msg: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-10 text-center">
      <span className="text-muted-foreground/40">{icon}</span>
      <p className="max-w-sm text-sm text-muted-foreground">{msg}</p>
    </div>
  );
}

function SectionError({ msg }: { msg: string }) {
  return (
    <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
      {msg}
    </div>
  );
}

function SkeletonRows({ n }: { n: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: n }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-xl" />
      ))}
    </div>
  );
}

function DueDiligenceBadge({ ok }: { ok: boolean }) {
  return ok ? (
    <Badge className="border-success/40 bg-success/10 text-success">
      <BadgeCheck className="mr-1 h-3 w-3" /> Docs OK
    </Badge>
  ) : (
    <Badge className="border-warning/40 bg-warning/10 text-warning">
      <AlertTriangle className="mr-1 h-3 w-3" /> Docs incompletos
    </Badge>
  );
}

function OperacionBadge({ operacion }: { operacion: "venta" | "arriendo" }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
        operacion === "venta"
          ? "bg-primary/10 text-primary"
          : "bg-accent/10 text-accent-foreground"
      }`}
    >
      {operacion}
    </span>
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

