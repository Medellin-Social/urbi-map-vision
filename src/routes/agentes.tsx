import { Name, useLang } from "@/lib/i18n";
import { seo } from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { MapPin, MessageCircle, Users, ArrowRight, Search, ShieldCheck, HelpCircle, Star, User, Home } from "@/lib/icons";
import { apiFetch } from "@/lib/apiClient";
import { API_ENDPOINTS } from "@/config/api";
import { ComunidadLayout } from "@/components/comunidad/ComunidadLayout";
import { K as TOKENS } from "@/design/tokens";
import { type Agente, Stars, waFromTel, iniciales, perfilHref, AgenteTipoBadges } from "@/components/agentes/agenteShared";
import { AGENTE_TIPOS, AGENTE_TIPO_STYLE, AGENTE_TIPO_DESC, agenteTipoLabel, type AgenteTipo } from "@/lib/agenteTipos";

export const Route = createFileRoute("/agentes")({
  head: () => seo({ title: "Agentes inmobiliarios · Medellín Social", description: "Encuentra agentes inmobiliarios verificados por zona en Medellín y el Valle de Aburrá.", path: "/agentes" }),
  component: AgentesPage,
});

const K = TOKENS;

type SortKey = "nombre" | "rating" | "verificado";

// Mismo número de WhatsApp del equipo que ya usan ListingDrawer/MapView como
// contacto genérico cuando no hay un agente puntual asignado.
const WA_EQUIPO = "https://wa.me/+573122502394?text=" + encodeURIComponent("Hola, quiero ayuda para encontrar un agente en Medellín.");

const FAQ: { q: string; a: string }[] = [
  {
    q: "¿Cuánto cuesta contactar a un agente?",
    a: "Nada. Hablar con cualquier agente del directorio es gratis y directo por WhatsApp, sin intermediarios ni formularios.",
  },
  {
    q: "¿Los agentes están verificados?",
    a: "Cada agente pasa por una revisión antes de aparecer en el directorio. Cuando trabaja con una agencia que además tiene el sello ✓ verificada, esa agencia fue revisada aparte.",
  },
  {
    q: "¿Las reseñas son reales?",
    a: "Sí. Solo usuarios con cuenta pueden dejar una reseña, y cada uno puede dejar una sola por agente — no hay reseñas anónimas ni repetidas.",
  },
  {
    q: "¿Cómo elijo el agente correcto?",
    a: "Filtra por sector para encontrar a quien conoce tu zona, revisa sus reseñas y no dudes en contactar a más de uno para comparar.",
  },
  {
    q: "¿Qué pasa si no encuentro un agente en mi zona?",
    a: "Escríbenos y te ayudamos a conseguir uno — ver sección de arriba.",
  },
];

function waLink(a: Agente): string {
  return waFromTel(a.telefono, a.nombre);
}

// Tarjeta densa estilo realtor.com: foto | nombre+rating+agencia+zonas | contacto.
// La tarjeta completa NO es un <Link> (rompería los <a> internos de WhatsApp);
// foto, nombre y "Ver perfil" navegan al perfil, WhatsApp va aparte.
function AgenteRow({ a }: { a: Agente }) {
  const [zonaPrincipal, ...zonasExtra] = a.zonas;
  const perfilLink = { to: "/agentes/$id", params: { id: perfilHref(a) } } as const;

  return (
    <div
      className="rounded-2xl border-l-4 p-4 transition hover:shadow-sm sm:p-5"
      style={{ borderLeftColor: K.teal, borderTop: `1px solid ${K.line}`, borderRight: `1px solid ${K.line}`, borderBottom: `1px solid ${K.line}`, background: "#FFFFFF" }}
    >
      <div className="grid grid-cols-[auto_1fr] gap-4 sm:grid-cols-[auto_1fr_auto]">
        <Link {...perfilLink} aria-label={`Ver perfil de ${a.nombre}`} className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl transition hover:opacity-90 sm:h-24 sm:w-24" style={{ background: K.tealLight }}>
          {a.foto_url
            ? <img src={a.foto_url} alt={a.nombre} className="h-full w-full object-cover" />
            : iniciales(a.nombre)
            ? <span className="text-xl font-bold sm:text-2xl" style={{ color: K.tealDeep, fontFamily: K.serif }}>{iniciales(a.nombre)}</span>
            : <Users className="h-9 w-9" style={{ color: K.teal }} />}
        </Link>

        <div className="min-w-0">
          <Link {...perfilLink} className="max-w-full break-words text-left text-xl font-bold leading-tight tracking-tight transition hover:opacity-70 sm:text-2xl" style={{ color: K.ink, fontFamily: K.serif }}>
            <Name>{a.nombre}</Name>
          </Link>

          <AgenteTipoBadges tipos={a.tipos} className="mt-1" />

          {a.rating_promedio != null ? (
            <div className="mt-0.5 flex items-center gap-1.5">
              <Stars value={a.rating_promedio} />
              <span className="text-xs font-semibold" style={{ color: K.ink }}>{a.rating_promedio.toFixed(1)}</span>
              <span data-i18n-skip="true" className="text-xs" style={{ color: K.muted }}>({a.n_resenas} reseña{a.n_resenas === 1 ? "" : "s"})</span>
            </div>
          ) : (
            <div className="mt-0.5 text-xs" style={{ color: K.muted }}>Sin reseñas aún</div>
          )}

          {zonaPrincipal ? (
            <div className="mt-1.5 flex items-center gap-1 text-[13px] font-semibold" style={{ color: K.tealDeep }}>
              <MapPin className="h-3.5 w-3.5" /> Especialista en {zonaPrincipal}
            </div>
          ) : (
            <div className="mt-1.5 text-xs font-medium uppercase tracking-wide" style={{ color: K.muted }}>Agente inmobiliario</div>
          )}

          {(zonasExtra.length > 0 || a.agencia_nombre) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {a.agencia_nombre && (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                  style={a.agencia_verificada ? { background: K.tealLight, color: K.tealDeep } : { background: K.surface, color: K.muted }}
                >
                  {a.agencia_verificada && <ShieldCheck className="h-3 w-3" />} {a.agencia_nombre}
                </span>
              )}
              {zonasExtra.map((z) => (
                <span key={z} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: K.tealLight, color: K.tealDeep }}>
                  <MapPin className="h-3 w-3" /> {z}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Contacto — abajo full-width en móvil, columna derecha en desktop */}
        <div className="col-span-2 flex flex-col gap-2 sm:col-span-1 sm:w-44 sm:justify-center">
          <a
            href={waLink(a)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            style={{ background: K.tealDeep }}
          >
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </a>
          <Link {...perfilLink} className="text-center text-xs font-semibold transition hover:opacity-70" style={{ color: K.tealDeep }}>
            Ver perfil completo →
          </Link>
        </div>
      </div>
    </div>
  );
}

const TIPO_ICON: Record<AgenteTipo, typeof Star> = { preferred: Star, certified: ShieldCheck, member: User, casa: Home };

// Filtro por tipo de agente, compacto: píldoras en una línea (ícono + nombre +
// conteo) que envuelven. Multi-selección en OR; "Todos" limpia. La descripción
// de cada tipo va en el tooltip (title) para no ocupar espacio.
function TipoAgenteFiltro({ value, onToggle, onClear, conteo, total, lang }: {
  value: AgenteTipo[];
  onToggle: (t: AgenteTipo) => void;
  onClear: () => void;
  conteo: Record<AgenteTipo, number>;
  total: number;
  lang: string;
}) {
  const en = lang === "en";
  const todos = value.length === 0;
  const Pill = ({ id, on, onClick, icon: Icon, label, desc, n, color }: {
    id: string; on: boolean; onClick: () => void; icon: typeof Star;
    label: string; desc: string; n: number; color: { bg: string; fg: string; border: string };
  }) => (
    <button
      type="button"
      data-testid={`tipo-agente-${id}`}
      aria-pressed={on}
      title={desc}
      onClick={onClick}
      className="inline-flex h-8 items-center gap-1.5 rounded-full pl-2 pr-2.5 text-xs font-semibold transition hover:shadow-sm focus:outline-none focus-visible:ring-2"
      style={{
        background: on ? color.bg : "#FFFFFF",
        color: on ? color.fg : K.ink,
        border: `1px solid ${on ? color.border : K.line}`,
      }}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: on ? color.fg : color.border }} />
      <span>{label}</span>
      <span className="tabular-nums" style={{ color: on ? color.fg : K.muted, opacity: on ? 0.75 : 1 }}>{n}</span>
    </button>
  );

  return (
    <div data-i18n-skip>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: K.muted }}>
          {en ? "Agent type" : "Tipo de agente"}
        </span>
        {!todos && (
          <button type="button" onClick={onClear} className="text-xs font-semibold transition hover:opacity-70" style={{ color: K.tealDeep }}>
            {en ? "Clear" : "Limpiar"}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={en ? "Agent type" : "Tipo de agente"}>
        <Pill
          id="todos" on={todos} onClick={onClear} icon={Users}
          label={en ? "All" : "Todos"} desc={en ? "The whole directory" : "Todo el directorio"}
          n={total} color={{ bg: K.tealLight, fg: K.tealDeep, border: K.teal }}
        />
        {AGENTE_TIPOS.map((t) => (
          <Pill
            key={t} id={t} on={value.includes(t)} onClick={() => onToggle(t)} icon={TIPO_ICON[t]}
            label={agenteTipoLabel(t, lang)} desc={AGENTE_TIPO_DESC[t][en ? "en" : "es"]}
            n={conteo[t]} color={AGENTE_TIPO_STYLE[t]}
          />
        ))}
      </div>
    </div>
  );
}

function AgenteRowSkeleton() {
  return (
    <div className="flex animate-pulse items-center gap-4 rounded-2xl border-l-4 p-5" style={{ borderLeftColor: K.line, borderTop: `1px solid ${K.line}`, borderRight: `1px solid ${K.line}`, borderBottom: `1px solid ${K.line}`, background: "#FFFFFF" }}>
      <div className="h-24 w-24 shrink-0 rounded-2xl" style={{ background: K.tealLight }} />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-40 rounded" style={{ background: K.line }} />
        <div className="h-3 w-24 rounded" style={{ background: K.line }} />
      </div>
      <div className="hidden h-11 w-40 rounded-xl sm:block" style={{ background: K.line }} />
    </div>
  );
}

function AgentesPage() {
  const { data, isLoading } = useQuery<Agente[]>({
    queryKey: ["agentes-directorio"],
    queryFn: () => apiFetch<Agente[]>(API_ENDPOINTS.agentesDirectorio),
  });
  const agentes = data ?? [];

  const { lang } = useLang();
  const [busqueda, setBusqueda] = useState("");
  const [zonaFiltro, setZonaFiltro] = useState("");
  // Tipos seleccionados (OR). Vacío = todos. Un agente puede tener varios tipos.
  const [tiposFiltro, setTiposFiltro] = useState<AgenteTipo[]>([]);
  const [orden, setOrden] = useState<SortKey>("nombre");
  const toggleTipo = (t: AgenteTipo) =>
    setTiposFiltro((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  const conteoTipo = useMemo(() => {
    const c: Record<AgenteTipo, number> = { member: 0, certified: 0, preferred: 0, casa: 0 };
    for (const a of agentes) for (const t of a.tipos ?? []) if (t in c) c[t as AgenteTipo]++;
    return c;
  }, [agentes]);

  const zonasDisponibles = useMemo(
    () => Array.from(new Set(agentes.flatMap((a) => a.zonas))).sort(),
    [agentes],
  );

  const visibles = useMemo(() => {
    let lista = agentes;
    if (busqueda.trim()) {
      const q = busqueda.trim().toLowerCase();
      lista = lista.filter((a) => a.nombre.toLowerCase().includes(q));
    }
    if (zonaFiltro) {
      lista = lista.filter((a) => a.zonas.includes(zonaFiltro));
    }
    if (tiposFiltro.length > 0) {
      lista = lista.filter((a) => (a.tipos ?? []).some((t) => tiposFiltro.includes(t as AgenteTipo)));
    }
    const orden_ = [...lista];
    if (orden === "rating") {
      orden_.sort((a, b) => {
        if (a.rating_promedio == null && b.rating_promedio == null) return a.nombre.localeCompare(b.nombre);
        if (a.rating_promedio == null) return 1; // sin reseñas va al final, no arriba ni abajo por sesgo
        if (b.rating_promedio == null) return -1;
        return b.rating_promedio - a.rating_promedio || a.nombre.localeCompare(b.nombre);
      });
    } else if (orden === "verificado") {
      orden_.sort((a, b) => Number(b.agencia_verificada) - Number(a.agencia_verificada) || a.nombre.localeCompare(b.nombre));
    } else {
      orden_.sort((a, b) => a.nombre.localeCompare(b.nombre));
    }
    return orden_;
  }, [agentes, busqueda, zonaFiltro, tiposFiltro, orden]);

  const inputStyle: React.CSSProperties = { border: `1px solid ${K.line}`, background: "#FFFFFF", color: K.ink };

  return (
    <ComunidadLayout>
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: K.serif, color: K.ink }}>
            Encuentra un agente
          </h1>
          <p className="mt-2 max-w-lg text-[15px] leading-relaxed" style={{ color: K.muted }}>
            Contacta directamente a un agente que trabaja en Medellín. Sin formularios, sin esperar una llamada.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_1fr]">
          {/* Columna 1: buscar + filtrar */}
          <aside className="flex flex-col gap-5 lg:sticky lg:top-24 lg:self-start">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: K.muted }}>Buscar por nombre</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: K.muted }} />
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Nombre del agente"
                  className="w-full rounded-lg py-2 pl-8 pr-3 text-sm outline-none"
                  style={inputStyle}
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: K.muted }}>Sector</label>
              <select value={zonaFiltro} onChange={(e) => setZonaFiltro(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle}>
                <option value="">Todos los sectores</option>
                {zonasDisponibles.map((z) => <option key={z} value={z}>{z}</option>)}
              </select>
            </div>

            <TipoAgenteFiltro
              value={tiposFiltro}
              onToggle={toggleTipo}
              onClear={() => setTiposFiltro([])}
              conteo={conteoTipo}
              total={agentes.length}
              lang={lang}
            />
          </aside>

          {/* Columna 2: barra de orden + resultados */}
          <div>
            <div className="mb-4 flex items-center justify-between gap-3">
              {!isLoading && (
                visibles.length === 0 ? (
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: K.teal }}>Sin resultados</span>
                ) : (
                  <span data-i18n-skip="true" className="text-sm font-semibold" style={{ color: K.ink }}>
                    {visibles.length} agente{visibles.length === 1 ? "" : "s"}
                  </span>
                )
              )}
              <div className="ml-auto flex items-center gap-2">
                <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: K.muted }}>Ordenar</label>
                <select value={orden} onChange={(e) => setOrden(e.target.value as SortKey)} className="rounded-lg px-3 py-1.5 text-sm outline-none" style={inputStyle}>
                  <option value="nombre">Nombre</option>
                  <option value="rating">Mejor calificados</option>
                  <option value="verificado">Agencias verificadas</option>
                </select>
              </div>
            </div>

            {isLoading && (
              <div className="flex flex-col gap-3">
                {[0, 1, 2].map((i) => <AgenteRowSkeleton key={i} />)}
              </div>
            )}

            {!isLoading && agentes.length === 0 && (
              <div className="rounded-2xl border px-6 py-12 text-center" style={{ borderColor: K.line, background: "#FFFFFF" }}>
                <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full" style={{ background: K.tealLight }}>
                  <Users className="h-6 w-6" style={{ color: K.teal }} />
                </div>
                <p className="text-sm font-semibold" style={{ color: K.ink }}>Aún no tenemos agentes disponibles</p>
                <p className="mx-auto mt-1 max-w-xs text-xs" style={{ color: K.muted }}>Estamos construyendo la red de agentes en Medellín. Vuelve pronto.</p>
                <Link to="/map" className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold transition hover:gap-2.5" style={{ color: K.tealDeep }}>
                  Explora propiedades en el mapa <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            )}

            {!isLoading && agentes.length > 0 && visibles.length === 0 && (
              <div className="rounded-2xl border px-6 py-12 text-center" style={{ borderColor: K.line, background: "#FFFFFF" }}>
                <p className="text-sm font-semibold" style={{ color: K.ink }}>Ningún agente coincide con tu búsqueda</p>
                <p className="mt-1 text-xs" style={{ color: K.muted }}>Prueba con otro nombre o sector.</p>
              </div>
            )}

            {visibles.length > 0 && (
              <div className="flex flex-col gap-3">
                {visibles.map((a) => <AgenteRow key={a.id} a={a} />)}
              </div>
            )}
          </div>
        </div>

        {/* Ayuda para quien no quiere elegir por su cuenta — mismo contacto genérico
            que ya usan ListingDrawer/MapView cuando no hay agente puntual asignado. */}
        <div className="mx-auto mt-16 max-w-xl rounded-2xl px-6 py-10 text-center" style={{ background: K.tealLight, border: `1px solid ${K.teal}` }}>
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full" style={{ background: "#FFFFFF" }}>
            <HelpCircle className="h-6 w-6" style={{ color: K.teal }} />
          </div>
          <h2 className="text-xl font-bold" style={{ fontFamily: K.serif, color: K.ink }}>¿No sabes por dónde empezar?</h2>
          <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed" style={{ color: K.muted }}>
            Cuéntanos qué buscas y en qué zona, y te ayudamos a encontrar el agente correcto.
          </p>
          <a
            href={WA_EQUIPO}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
            style={{ background: K.tealDeep }}
          >
            <MessageCircle className="h-4 w-4" /> Pide ayuda por WhatsApp
          </a>
        </div>

        {/* FAQ */}
        <div className="mx-auto mt-16 max-w-xl">
          <h2 className="mb-5 text-center text-xl font-bold" style={{ fontFamily: K.serif, color: K.ink }}>
            Preguntas frecuentes
          </h2>
          {FAQ.map((item) => (
            <div key={item.q} className="py-4" style={{ borderBottom: `1px solid ${K.line}` }}>
              <p className="mb-1 text-sm font-bold" style={{ color: K.ink }}>{item.q}</p>
              <p className="text-[13px] leading-relaxed" style={{ color: K.muted }}>{item.a}</p>
            </div>
          ))}
          <p className="mt-5 text-center text-[13px]" style={{ color: K.muted }}>
            ¿Más preguntas?{" "}
            <a href="mailto:hola@medellin.social" style={{ color: K.teal }}>hola@medellin.social</a>
          </p>
        </div>
      </div>
    </ComunidadLayout>
  );
}
