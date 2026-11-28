import { seo } from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useMemo } from "react";
import { Search, Users, ArrowRight, X, HelpCircle, ChevronRight, ChevronDown, MapPin } from "@/lib/icons";
import { apiFetch } from "@/lib/apiClient";
import { API_ENDPOINTS } from "@/config/api";
import { ComunidadLayout } from "@/components/comunidad/ComunidadLayout";
import { K } from "@/design/tokens";
import { type AgenteCard as AgenteCardT, AgentCard, buildBuscarQS } from "@/components/agentes/agenteShared";
import { AGENTE_TIPO_LABEL } from "@/lib/agenteTipos";
import { AgentesTourModal } from "@/components/AgentesTourModal";

type Intencion = "comprar" | "vender" | "arrendar";
type DirSearch = {
  ciudad?: string; zona?: string; comuna?: string; nombre?: string; intencion?: Intencion;
  tipo?: string; tipo_agente?: string; idiomas?: string; especialidad?: string; orden?: string;
  rating_min?: number; pg?: number;
};

// Etiqueta legible del filtro por estado del agente (deep-link ?tipo_agente=certified,preferred).
const tipoAgenteLabel = (v: string) =>
  v.split(",").map((x) => (AGENTE_TIPO_LABEL as Record<string, { es: string }>)[x.trim()]?.es ?? x.trim()).join(" · ");

const str = (s: unknown) => (typeof s === "string" && s.trim() ? s.trim() : undefined);
const CIUDAD_DEFAULT = "medellin";
const CIUDAD_LABEL: Record<string, string> = { medellin: "Medellín", barranquilla: "Barranquilla", cali: "Cali", panama: "Ciudad de Panamá" };

export const Route = createFileRoute("/agentes")({
  head: () => seo({ title: "Agentes inmobiliarios en Medellín · Medellín Social", description: "Directorio de agentes inmobiliarios verificados por zona en Medellín y el Valle de Aburrá. Filtra por barrio, idioma y especialidad.", path: "/agentes" }),
  validateSearch: (s: Record<string, unknown>): DirSearch => ({
    ciudad: str(s.ciudad), zona: str(s.zona), comuna: str(s.comuna), nombre: str(s.nombre),
    intencion: (["comprar", "vender", "arrendar"] as const).includes(s.intencion as Intencion) ? (s.intencion as Intencion) : undefined,
    tipo: str(s.tipo), tipo_agente: str(s.tipo_agente), idiomas: str(s.idiomas), especialidad: str(s.especialidad),
    orden: str(s.orden), rating_min: typeof s.rating_min === "number" ? s.rating_min : undefined,
    pg: typeof s.pg === "number" && s.pg > 1 ? s.pg : undefined,
  }),
  component: DirectorioPage,
});

type BuscarResp = { items: AgenteCardT[]; total: number; page: number; page_size: number };

const INTENCIONES: { v: Intencion; label: string }[] = [
  { v: "comprar", label: "Comprar" }, { v: "vender", label: "Vender" }, { v: "arrendar", label: "Arrendar" },
];
const ORDENES = [
  { v: "relevantes", label: "Relevantes" }, { v: "mas-vendidos", label: "Más vendidos" },
  { v: "mejor-calificados", label: "Mejor calificados" }, { v: "mas-propiedades", label: "Más propiedades" },
];
const TIPOS = [
  { v: "", label: "Todos los tipos" }, { v: "compra-venta", label: "Compra y venta" },
  { v: "arrendamiento", label: "Arrendamiento" }, { v: "inversion", label: "Inversión" },
];
const IDIOMAS = [{ v: "", label: "Cualquier idioma" }, { v: "Inglés", label: "Inglés" }, { v: "Portugués", label: "Portugués" }, { v: "Español", label: "Español" }];
const ESPECIALIDADES = [
  { v: "", label: "Toda especialidad" }, { v: "inversion", label: "Inversión" }, { v: "extranjeros", label: "Extranjeros" },
  { v: "airbnb", label: "Airbnb / renta corta" }, { v: "compra", label: "Compra" }, { v: "venta", label: "Venta" }, { v: "arriendo", label: "Arriendo" },
];
const ZONAS_POPULARES = ["El Poblado", "Laureles", "Envigado", "Belén", "Sabaneta", "La América"];

const PAGE_SIZE = 20;

// Select de filtro con chevron propio (appearance-none) → se ve diseñado, no el
// desplegable por defecto del sistema operativo. Mismo look en todos los filtros.
function FilterSelect({ label, value, onChange, children }: {
  label: string; value: string | number; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select
        aria-label={label}
        value={value}
        onChange={onChange}
        className="cursor-pointer appearance-none rounded-lg border py-2 pl-3 pr-9 text-sm font-medium outline-none transition hover:border-[#0F8A4F]/50 focus:ring-2 focus:ring-[#0F8A4F]/25"
        style={{ borderColor: K.line, background: "#FFFFFF", color: K.ink }}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: K.muted }} />
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="flex animate-pulse items-center gap-4 rounded-2xl border-l-4 p-5" style={{ borderLeftColor: K.line, borderTop: `1px solid ${K.line}`, borderRight: `1px solid ${K.line}`, borderBottom: `1px solid ${K.line}`, background: "#FFFFFF" }}>
      <div className="h-24 w-24 shrink-0 rounded-2xl" style={{ background: K.tealLight }} />
      <div className="flex-1 space-y-2"><div className="h-4 w-44 rounded" style={{ background: K.line }} /><div className="h-3 w-28 rounded" style={{ background: K.line }} /><div className="h-3 w-56 rounded" style={{ background: K.line }} /></div>
      <div className="hidden h-11 w-36 rounded-xl sm:block" style={{ background: K.line }} />
    </div>
  );
}

function DirectorioPage() {
  const sp = Route.useSearch();
  const navigate = Route.useNavigate();
  const ciudad = sp.ciudad ?? CIUDAD_DEFAULT;
  const ciudadLabel = CIUDAD_LABEL[ciudad] ?? ciudad;
  const pg = sp.pg ?? 1;

  // Actualiza un filtro en la URL (resetea pg salvo que se cambie pg).
  const setFilter = (patch: Partial<DirSearch>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch, ...(("pg" in patch) ? {} : { pg: undefined }) }) });

  const qs = useMemo(() => buildBuscarQS(sp, { ciudad, pg, pageSize: PAGE_SIZE }), [sp, ciudad, pg]);

  const { data, isLoading, isError, refetch, isFetching } = useQuery<BuscarResp>({
    queryKey: ["agentes-buscar", qs],
    queryFn: () => apiFetch<BuscarResp>(API_ENDPOINTS.agentesBuscar(qs)),
    placeholderData: keepPreviousData,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const desde = total === 0 ? 0 : (pg - 1) * PAGE_SIZE + 1;
  const hasta = Math.min(pg * PAGE_SIZE, total);

  const chips = [
    sp.zona && { k: "zona", label: sp.zona },
    sp.tipo_agente && { k: "tipo_agente", label: tipoAgenteLabel(sp.tipo_agente) },
    sp.intencion && { k: "intencion", label: INTENCIONES.find((i) => i.v === sp.intencion)?.label },
    sp.tipo && { k: "tipo", label: TIPOS.find((t) => t.v === sp.tipo)?.label },
    sp.idiomas && { k: "idiomas", label: sp.idiomas },
    sp.especialidad && { k: "especialidad", label: ESPECIALIDADES.find((e) => e.v === sp.especialidad)?.label },
    sp.rating_min && { k: "rating_min", label: `${sp.rating_min}★ o más` },
  ].filter(Boolean) as { k: keyof DirSearch; label: string }[];

  const selStyle: React.CSSProperties = { border: `1px solid ${K.line}`, background: "#FFFFFF", color: K.ink };
  const titulo = sp.zona ? `Agentes inmobiliarios en ${sp.zona}` : `Agentes inmobiliarios en ${ciudadLabel}`;

  return (
    <ComunidadLayout>
      <AgentesTourModal />
      <div className="mx-auto max-w-5xl px-4 pb-20 pt-6">
        {/* Breadcrumb */}
        <nav aria-label="Ruta" className="flex flex-wrap items-center gap-1 text-xs" style={{ color: K.muted }}>
          <Link to="/" className="hover:opacity-70">Inicio</Link> <ChevronRight className="h-3 w-3" />
          <span style={{ color: K.ink }}>Agentes</span> <ChevronRight className="h-3 w-3" />
          <span style={{ color: K.ink }}>{ciudadLabel}</span>
          {sp.zona && <><ChevronRight className="h-3 w-3" /> <span style={{ color: K.ink }}>{sp.zona}</span></>}
        </nav>

        {/* H1 + conteo */}
        <h1 className="mt-3 text-3xl font-bold tracking-tight" style={{ fontFamily: K.serif, color: K.ink }}>{titulo}</h1>
        <p className="mt-1 text-sm" style={{ color: K.muted }}>
          {isLoading ? "Buscando…" : <span data-i18n-skip="true">{total} agente{total === 1 ? "" : "s"} {sp.zona || sp.intencion || sp.especialidad ? "con tus filtros" : "verificados"}</span>}
        </p>

        {/* Buscador + intención */}
        <div data-tour="agentes-buscar" className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: K.muted }} />
            <input defaultValue={sp.nombre ?? ""} onKeyDown={(e) => { if (e.key === "Enter") setFilter({ nombre: str((e.target as HTMLInputElement).value) }); }}
              onBlur={(e) => setFilter({ nombre: str(e.target.value) })}
              placeholder="Buscar por agente, inmobiliaria o zona" aria-label="Buscar agente"
              className="w-full rounded-xl py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2" style={selStyle} />
          </div>
          <div role="tablist" aria-label="Intención" className="inline-flex rounded-xl p-1" style={{ background: K.surface }}>
            {INTENCIONES.map((i) => {
              const on = sp.intencion === i.v;
              return (
                <button key={i.v} role="tab" aria-selected={on} onClick={() => setFilter({ intencion: on ? undefined : i.v })}
                  className="rounded-lg px-3 py-1.5 text-sm font-semibold transition"
                  style={on ? { background: K.tealDeep, color: "#FFFFFF" } : { color: K.muted }}>{i.label}</button>
              );
            })}
          </div>
        </div>

        {/* Barra de filtros */}
        <div data-tour="agentes-filtros" className="mt-3 flex flex-wrap items-center gap-2">
          <FilterSelect label="Tipo de agente" value={sp.tipo ?? ""} onChange={(e) => setFilter({ tipo: str(e.target.value) })}>{TIPOS.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}</FilterSelect>
          <FilterSelect label="Idioma" value={sp.idiomas ?? ""} onChange={(e) => setFilter({ idiomas: str(e.target.value) })}>{IDIOMAS.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}</FilterSelect>
          <FilterSelect label="Especialidad" value={sp.especialidad ?? ""} onChange={(e) => setFilter({ especialidad: str(e.target.value) })}>{ESPECIALIDADES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}</FilterSelect>
          <FilterSelect label="Calificación mínima" value={sp.rating_min ?? ""} onChange={(e) => setFilter({ rating_min: e.target.value ? Number(e.target.value) : undefined })}>
            <option value="">Cualquier calificación</option><option value="4">4★ o más</option><option value="4.5">4.5★ o más</option>
          </FilterSelect>
          <div className="ml-auto flex items-center gap-2">
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: K.muted }}>Ordenar</label>
            <FilterSelect label="Ordenar por" value={sp.orden ?? "relevantes"} onChange={(e) => setFilter({ orden: e.target.value })}>{ORDENES.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}</FilterSelect>
          </div>
        </div>

        {/* Chips activos */}
        {chips.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {chips.map((c) => (
              <button key={c.k} onClick={() => setFilter({ [c.k]: undefined } as Partial<DirSearch>)} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: K.tealLight, color: K.tealDeep }}>
                {c.label} <X className="h-3 w-3" />
              </button>
            ))}
            <button onClick={() => navigate({ search: { ciudad: sp.ciudad } })} className="text-[11px] font-semibold underline" style={{ color: K.muted }}>Limpiar todo</button>
          </div>
        )}

        {/* Resultados */}
        <div className="mt-6 flex flex-col gap-3" aria-busy={isFetching}>
          {isLoading && [0, 1, 2, 3].map((i) => <CardSkeleton key={i} />)}

          {isError && !isLoading && (
            <div className="rounded-2xl border px-6 py-12 text-center" style={{ borderColor: K.line, background: "#FFFFFF" }}>
              <p className="text-sm font-semibold" style={{ color: K.ink }}>No pudimos cargar los agentes</p>
              <button onClick={() => refetch()} className="mt-4 rounded-xl px-5 py-2.5 text-sm font-semibold text-white" style={{ background: K.tealDeep }}>Reintentar</button>
            </div>
          )}

          {!isLoading && !isError && items.length === 0 && (
            <div className="rounded-2xl border px-6 py-12 text-center" style={{ borderColor: K.line, background: "#FFFFFF" }}>
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full" style={{ background: K.tealLight }}><Users className="h-6 w-6" style={{ color: K.teal }} /></div>
              <p className="text-sm font-semibold" style={{ color: K.ink }}>No hay agentes con estos filtros</p>
              <p className="mx-auto mt-1 max-w-xs text-xs" style={{ color: K.muted }}>Prueba limpiar filtros o ampliar la zona.</p>
              <button onClick={() => navigate({ search: { ciudad: sp.ciudad } })} className="mt-4 rounded-xl px-5 py-2.5 text-sm font-semibold text-white" style={{ background: K.tealDeep }}>Limpiar filtros</button>
            </div>
          )}

          {items.map((a) => <AgentCard key={a.id} a={a} />)}
        </div>

        {/* Paginación */}
        {total > PAGE_SIZE && (
          <div className="mt-6 flex items-center justify-between gap-3">
            <span data-i18n-skip="true" className="text-xs" style={{ color: K.muted }}>Mostrando {desde}–{hasta} de {total}</span>
            <div className="flex items-center gap-1">
              <button disabled={pg <= 1} onClick={() => setFilter({ pg: pg - 1 })} className="rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-40" style={{ border: `1px solid ${K.line}`, color: K.ink }}>Anterior</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).filter((n) => Math.abs(n - pg) <= 2 || n === 1 || n === totalPages).map((n, idx, arr) => (
                <span key={n} className="flex items-center">
                  {idx > 0 && arr[idx - 1] !== n - 1 && <span className="px-1 text-xs" style={{ color: K.muted }}>…</span>}
                  <button onClick={() => setFilter({ pg: n })} className="min-w-[32px] rounded-lg px-2 py-1.5 text-sm font-semibold" style={n === pg ? { background: K.tealDeep, color: "#FFFFFF" } : { border: `1px solid ${K.line}`, color: K.ink }}>{n}</button>
                </span>
              ))}
              <button disabled={pg >= totalPages} onClick={() => setFilter({ pg: pg + 1 })} className="rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-40" style={{ border: `1px solid ${K.line}`, color: K.ink }}>Siguiente</button>
            </div>
          </div>
        )}

        {/* Bloque inferior (sin sidebar) */}
        <div className="mt-16 border-t pt-10" style={{ borderColor: K.line }}>
          <h2 className="text-lg font-bold" style={{ fontFamily: K.serif, color: K.ink }}>Zonas populares en {ciudadLabel}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {ZONAS_POPULARES.map((z) => (
              <Link key={z} to="/agentes" search={{ ciudad: sp.ciudad, zona: z }} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold transition hover:opacity-80" style={{ background: K.tealLight, color: K.tealDeep }}>
                <MapPin className="h-3.5 w-3.5" /> {z}
              </Link>
            ))}
          </div>

          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            <div>
              <h2 className="text-lg font-bold" style={{ fontFamily: K.serif, color: K.ink }}>Cómo elegir un buen agente</h2>
              <ul className="mt-2 space-y-1.5 text-[13px] leading-relaxed" style={{ color: K.muted }}>
                <li>• Revisa reseñas reales de otros usuarios, no solo la calificación.</li>
                <li>• Prioriza a quien conoce tu zona — un agente con exclusividad en el barrio suele tener mejor lectura del mercado.</li>
                <li>• Compara al menos dos o tres antes de decidir; contactarlos es gratis.</li>
                <li>• Si eres extranjero, filtra por idioma para evitar fricción en el proceso.</li>
              </ul>
            </div>
            <div className="flex flex-col justify-center rounded-2xl p-6" style={{ background: K.tealLight, border: `1px solid ${K.teal}` }}>
              <div className="mx-auto mb-2 grid h-11 w-11 place-items-center rounded-full" style={{ background: "#FFFFFF" }}><HelpCircle className="h-6 w-6" style={{ color: K.teal }} /></div>
              <h2 className="text-center text-lg font-bold" style={{ fontFamily: K.serif, color: K.ink }}>¿Eres agente?</h2>
              <p className="mx-auto mt-1 max-w-xs text-center text-sm" style={{ color: K.muted }}>Reclama la exclusividad de tu zona y aparece primero ante compradores de tu barrio.</p>
              <Link to="/planes" className="mx-auto mt-4 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90" style={{ background: K.tealDeep }}>
                Reclama tu zona <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </ComunidadLayout>
  );
}
