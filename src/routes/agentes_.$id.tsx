import { Name } from "@/lib/i18n";
import { seo, SITE_URL } from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  MapPin, MessageCircle, ShieldCheck, Calendar, Home, CheckCircle, ArrowRight,
  Bed, Bath, Maximize2, Briefcase, Clock, Star, Phone, Globe2, GraduationCap, ChevronDown,
} from "@/lib/icons";
import { apiFetch } from "@/lib/apiClient";
import { API_ENDPOINTS } from "@/config/api";
import { ComunidadLayout } from "@/components/comunidad/ComunidadLayout";
import { auth } from "@/lib/auth";
import { K } from "@/design/tokens";
import {
  type AgentePerfil, type PerfilListing, type Agente, type PerfilLicencia,
  Stars, ResenaForm, ContactoAgenteForm, fmtPrecio, rangoPrecio, waFromTel, iniciales, perfilHref,
} from "@/components/agentes/agenteShared";

const ESPECIALIDAD_LABEL: Record<string, string> = {
  compra: "Compra", venta: "Venta", arriendo: "Arriendo",
  inversion: "Inversión", extranjeros: "Compradores extranjeros", airbnb: "Airbnb / renta corta",
};

export const Route = createFileRoute("/agentes_/$id")({
  // Loader = SSR/prefetch: el perfil llega en el HTML (SEO) y siembra TanStack Query.
  // No-throw: si la API falla en SSR, degradamos a head genérico y el cliente reintenta.
  loader: async ({ params }) => {
    try { return await apiFetch<AgentePerfil>(API_ENDPOINTS.agentePerfil(params.id)); }
    catch { return null; }
  },
  head: ({ loaderData }) => {
    const p = loaderData as AgentePerfil | null;
    if (!p) return seo({ title: "Agente inmobiliario · Medellín Social", description: "Perfil de agente inmobiliario en Medellín y el Valle de Aburrá.", path: "/agentes" });
    const zonas = p.zonas.map((z) => z.nombre).filter(Boolean);
    const desc = (p.bio?.trim().slice(0, 155))
      || `${p.nombre}, agente inmobiliario${p.agencia_nombre ? ` en ${p.agencia_nombre}` : ""}${zonas.length ? ` · ${zonas.slice(0, 3).join(", ")}` : ""}. ${p.n_activos} propiedades en venta.`;
    const base = seo({ title: `${p.nombre} · Agente inmobiliario · Medellín Social`, description: desc, path: `/agentes/${p.slug || p.id}` });
    const ld = {
      "@context": "https://schema.org", "@type": "RealEstateAgent",
      name: p.nombre, image: p.foto_url || undefined, telephone: p.telefono || undefined,
      url: `${SITE_URL}/agentes/${p.slug || p.id}`,
      worksFor: p.agencia_nombre ? { "@type": "Organization", name: p.agencia_nombre } : undefined,
      areaServed: zonas.length ? zonas : undefined,
      knowsLanguage: p.idiomas.length ? p.idiomas : undefined,
      aggregateRating: p.rating_promedio != null
        ? { "@type": "AggregateRating", ratingValue: p.rating_promedio, reviewCount: p.n_resenas } : undefined,
    };
    return {
      ...base,
      meta: [...base.meta, ...(p.foto_url ? [{ property: "og:image", content: p.foto_url }] : [])],
      scripts: [{ type: "application/ld+json", children: JSON.stringify(ld) }],
    };
  },
  component: AgentePerfilPage,
});

const cap = (s: string | null | undefined) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
const fmtArea = (v: number | null) => (v != null ? `${Math.round(v)} m²` : null);
const licenciaLabel = (l: PerfilLicencia) => typeof l === "string" ? l : [l.entidad, l.numero].filter(Boolean).join(" · ");

function ListingCard({ l, cerrado }: { l: PerfilListing; cerrado?: boolean }) {
  const specs = [
    l.habitaciones != null ? { icon: Bed, txt: `${l.habitaciones}` } : null,
    l.banos != null ? { icon: Bath, txt: `${l.banos}` } : null,
    fmtArea(l.area_m2) ? { icon: Maximize2, txt: fmtArea(l.area_m2)! } : null,
  ].filter(Boolean) as { icon: typeof Bed; txt: string }[];
  const tipoOp = [cap(l.tipo_inmueble), l.operacion ? `en ${l.operacion}` : ""].filter(Boolean).join(" ");
  // Solo los activos están vivos en el mapa (los vendidos salen del cache). Abre en
  // OTRA pestaña para no perder de vista el perfil del agente.
  const mapHref = !cerrado && l.map_id != null ? `/map?listing=${l.map_id}` : null;

  const inner = (
    <>
      <div className="relative aspect-[4/3] w-full" style={{ background: K.tealLight }}>
        {l.foto_portada
          ? <img src={l.foto_portada} alt={l.titulo ?? ""} loading="lazy" className="h-full w-full object-cover" />
          : <div className="grid h-full w-full place-items-center"><Home className="h-8 w-8" style={{ color: K.teal }} /></div>}
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
          style={{ background: cerrado ? K.tealDeep : "rgba(17,20,24,0.72)" }}>
          {cerrado ? <><CheckCircle className="h-3 w-3" /> Vendido</> : cap(l.operacion) || "En venta"}
        </span>
        {mapHref && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-bold opacity-0 shadow-sm transition group-hover:opacity-100" style={{ color: K.tealDeep }}>
            <MapPin className="h-3 w-3" /> Ver en el mapa ↗
          </span>
        )}
      </div>
      <div className="p-3">
        <div className="text-sm font-bold" style={{ color: K.ink }}>{fmtPrecio(l.precio, l.moneda) || "Precio a consultar"}</div>
        {specs.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]" style={{ color: K.ink }}>
            {specs.map((s, i) => <span key={i} className="inline-flex items-center gap-1"><s.icon className="h-3.5 w-3.5" style={{ color: K.muted }} /> {s.txt}</span>)}
          </div>
        )}
        {tipoOp && <div className="mt-1 truncate text-[11px]" style={{ color: K.muted }}>{tipoOp}</div>}
        <div className="mt-1 flex items-center gap-1 text-[11px]" style={{ color: K.muted }}>
          <MapPin className="h-3 w-3" /> {[l.barrio, l.municipio].filter(Boolean).join(", ") || "Medellín"}
        </div>
      </div>
    </>
  );

  return mapHref ? (
    <a href={mapHref} target="_blank" rel="noopener noreferrer" title="Ver este inmueble en el mapa (nueva pestaña)"
      className="group block overflow-hidden rounded-xl transition hover:shadow-md" style={{ border: `1px solid ${K.line}`, background: "#FFFFFF" }}>
      {inner}
    </a>
  ) : (
    <div className="overflow-hidden rounded-xl" style={{ border: `1px solid ${K.line}`, background: "#FFFFFF" }}>{inner}</div>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon?: typeof Bed }) {
  return (
    <div className="rounded-xl px-3 py-2.5 text-center" style={{ background: K.paper, border: `1px solid ${K.line}` }}>
      <div className="flex items-center justify-center gap-1 text-base font-bold leading-tight break-words sm:text-lg" style={{ color: K.tealDeep, fontFamily: K.serif }}>
        {Icon && <Icon className="h-4 w-4" style={{ color: K.teal }} />} {value}
      </div>
      <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: K.muted }}>{label}</div>
    </div>
  );
}

function Seccion({ titulo, sub, children }: { titulo: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="mt-7 first:mt-0 scroll-mt-24">
      <h2 className="text-lg font-bold" style={{ color: K.ink, fontFamily: K.serif }}>{titulo}</h2>
      {sub && <p className="mb-3 mt-0.5 text-xs" style={{ color: K.muted }}>{sub}</p>}
      <div className={sub ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: K.tealLight, color: K.tealDeep }}>{children}</span>;
}

function AgenteMiniCard({ a }: { a: Agente }) {
  return (
    <Link to="/agentes/$id" params={{ id: perfilHref(a) }} className="flex items-center gap-3 rounded-xl p-3 transition hover:shadow-sm" style={{ border: `1px solid ${K.line}`, background: "#FFFFFF" }}>
      <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl" style={{ background: K.tealLight }}>
        {a.foto_url ? <img src={a.foto_url} alt={a.nombre} loading="lazy" className="h-full w-full object-cover" /> : <span className="text-sm font-bold" style={{ color: K.tealDeep, fontFamily: K.serif }}>{iniciales(a.nombre)}</span>}
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-bold" style={{ color: K.ink }}><Name>{a.nombre}</Name></div>
        {a.rating_promedio != null ? (
          <div className="mt-0.5 flex items-center gap-1"><Stars value={a.rating_promedio} size={11} /><span className="text-[11px]" style={{ color: K.muted }}>{a.rating_promedio.toFixed(1)}</span></div>
        ) : a.agencia_nombre ? <div className="truncate text-[11px]" style={{ color: K.muted }}>{a.agencia_nombre}</div> : null}
      </div>
    </Link>
  );
}

function AgentePerfilPage() {
  const { id } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const { data: p, isLoading, isError } = useQuery<AgentePerfil>({
    queryKey: ["agente-perfil", id],
    queryFn: () => apiFetch<AgentePerfil>(API_ENDPOINTS.agentePerfil(id)),
    initialData: loaderData ?? undefined,
    staleTime: 60_000,
  });
  const { data: similares } = useQuery<Agente[]>({
    queryKey: ["agente-similares", id],
    queryFn: () => apiFetch<Agente[]>(API_ENDPOINTS.agenteSimilares(id)),
    enabled: !!p,
  });
  const [reseñando, setReseñando] = useState(false);
  const [bioOpen, setBioOpen] = useState(false);
  const logueado = typeof window !== "undefined" && !!auth.get();

  const d = useMemo(() => {
    if (!p) return null;
    const anio = p.miembro_desde ? new Date(p.miembro_desde).getFullYear() : null;
    const dist = [5, 4, 3, 2, 1].map((star) => ({ star, n: p.resenas.filter((r) => Math.round(r.calificacion) === star).length }));
    const maxN = Math.max(1, ...dist.map((x) => x.n));
    const bioLong = (p.bio?.length ?? 0) > 280;
    return { anio, dist, maxN, bioLong };
  }, [p]);

  const scrollToContacto = () => document.getElementById("contacto")?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <ComunidadLayout>
      <div className="mx-auto max-w-5xl px-4 pb-24 pt-6 lg:pb-16">
        <Link to="/agentes" className="inline-flex items-center gap-1 text-sm font-semibold transition hover:opacity-70" style={{ color: K.tealDeep }}>
          <ArrowRight className="h-4 w-4" style={{ transform: "rotate(180deg)" }} /> Agentes
        </Link>

        {isLoading && !p && <div className="mt-10 text-center text-sm" style={{ color: K.muted }}>Cargando perfil…</div>}
        {isError && !p && (
          <div className="mt-10 rounded-2xl border px-6 py-12 text-center" style={{ borderColor: K.line, background: "#FFFFFF" }}>
            <p className="text-sm font-semibold" style={{ color: K.ink }}>No se pudo cargar este agente</p>
            <Link to="/agentes" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: K.tealDeep }}>Volver al directorio <ArrowRight className="h-4 w-4" /></Link>
          </div>
        )}

        {p && d && (
          <>
            {/* Header */}
            <div className="mt-4 rounded-2xl p-5 sm:p-6" style={{ background: "#FFFFFF", border: `1px solid ${K.line}` }}>
              <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
                <div className="grid h-28 w-28 shrink-0 place-items-center overflow-hidden rounded-2xl" style={{ background: K.tealLight }}>
                  {p.foto_url ? <img src={p.foto_url} alt={p.nombre} className="h-full w-full object-cover" /> : <span className="text-3xl font-bold" style={{ color: K.tealDeep, fontFamily: K.serif }}>{iniciales(p.nombre)}</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-3xl font-bold leading-tight tracking-tight break-words" style={{ color: K.ink, fontFamily: K.serif }}><Name>{p.nombre}</Name></h1>
                    {p.verificado && (
                      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: K.tealLight, color: K.tealDeep }}>
                        <ShieldCheck className="h-3.5 w-3.5" /> Agente verificado
                      </span>
                    )}
                  </div>
                  {p.titulo && <div className="mt-0.5 text-sm font-semibold" style={{ color: K.tealDeep }}>{p.titulo}</div>}
                  {p.rating_promedio != null ? (
                    <div className="mt-1 flex items-center gap-1.5">
                      <Stars value={p.rating_promedio} /><span className="text-sm font-semibold" style={{ color: K.ink }}>{p.rating_promedio.toFixed(1)}</span>
                      <span data-i18n-skip="true" className="text-sm" style={{ color: K.muted }}>({p.n_resenas} reseña{p.n_resenas === 1 ? "" : "s"})</span>
                    </div>
                  ) : <div className="mt-1 text-sm" style={{ color: K.muted }}>Sin reseñas aún</div>}
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    {p.agencia_nombre && (
                      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={p.agencia_verificada ? { background: K.tealLight, color: K.tealDeep } : { background: K.surface, color: K.muted }}>
                        {p.agencia_logo && <img src={p.agencia_logo} alt="" className="h-4 w-4 rounded object-contain" />}
                        {p.agencia_verificada && !p.agencia_logo && <ShieldCheck className="h-3 w-3" />} {p.agencia_nombre}
                      </span>
                    )}
                    {p.responde_rapido && <Chip><Clock className="h-3 w-3" /> Responde rápido{p.mediana_resp_horas != null ? ` (~${Math.round(p.mediana_resp_horas)}h)` : ""}</Chip>}
                    {p.idiomas.length > 0 && <Chip><Globe2 className="h-3 w-3" /> {p.idiomas.join(", ")}</Chip>}
                    {d.anio && <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: K.muted }}><Calendar className="h-3 w-3" /> En Medellín Social desde {d.anio}</span>}
                  </div>
                  {/* Acciones rápidas (desktop) */}
                  <div className="mt-4 hidden flex-wrap gap-2 sm:flex">
                    <button onClick={scrollToContacto} className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90" style={{ background: K.tealDeep }}>Contactar</button>
                    {p.telefono && <a href={`tel:${p.telefono}`} className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition hover:opacity-80" style={{ border: `1px solid ${K.line}`, color: K.ink }}><Phone className="h-4 w-4" /> Llamar</a>}
                    {p.telefono && <a href={waFromTel(p.telefono, p.nombre)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition hover:opacity-80" style={{ border: `1px solid ${K.line}`, color: K.ink }}><MessageCircle className="h-4 w-4" /> WhatsApp</a>}
                  </div>
                </div>
              </div>

              {/* Métricas — solo cards con dato real */}
              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="En venta" value={String(p.n_activos)} icon={Home} />
                <Stat label="Vendidas (12m)" value={String(p.vendidas_12m)} icon={CheckCircle} />
                {p.precio_min != null && p.precio_max != null && <Stat label="Rango de precios" value={rangoPrecio(p.precio_min, p.precio_max)} />}
                {p.anios_experiencia != null && <Stat label="Experiencia" value={`${p.anios_experiencia} año${p.anios_experiencia === 1 ? "" : "s"}`} icon={Briefcase} />}
              </div>
            </div>

            {/* 2 columnas */}
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
              <div>
                <Seccion titulo="Acerca de">
                  <p className="text-sm leading-relaxed" style={{ color: p.bio ? K.ink : K.muted }}>
                    {p.bio ? (d.bioLong && !bioOpen ? p.bio.slice(0, 280) + "…" : p.bio) : "Este agente aún no agregó una descripción."}
                  </p>
                  {d.bioLong && (
                    <button onClick={() => setBioOpen((o) => !o)} className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold" style={{ color: K.tealDeep }}>
                      {bioOpen ? "Ver menos" : "Ver más"} <ChevronDown className="h-3.5 w-3.5" style={{ transform: bioOpen ? "rotate(180deg)" : "none" }} />
                    </button>
                  )}
                  {p.especialidades.length > 0 && (
                    <div className="mt-4">
                      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: K.muted }}>Especialidades</div>
                      <div className="flex flex-wrap gap-1.5">{p.especialidades.map((e) => <Chip key={e}>{ESPECIALIDAD_LABEL[e] ?? cap(e)}</Chip>)}</div>
                    </div>
                  )}
                  {p.licencias.length > 0 && (
                    <div className="mt-4">
                      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: K.muted }}>Certificaciones y licencias</div>
                      <div className="flex flex-wrap gap-1.5">{p.licencias.map((l, i) => <Chip key={i}><GraduationCap className="h-3 w-3" /> {licenciaLabel(l)}</Chip>)}</div>
                    </div>
                  )}
                </Seccion>

                {p.zonas.length > 0 && (
                  <Seccion titulo="Zonas de servicio" sub="Dónde el agente está activo">
                    <div className="flex flex-wrap gap-1.5">
                      {p.zonas.map((z) => (
                        <span key={`${z.nivel}-${z.nombre}`} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={z.exclusivo ? { background: K.tealDeep, color: "#FFFFFF" } : { background: K.tealLight, color: K.tealDeep }}>
                          {z.exclusivo && <Star width={11} height={11} fill="#FFFFFF" stroke="#FFFFFF" />} <MapPin className="h-3 w-3" /> <Name>{z.nombre ?? ""}</Name>{z.exclusivo ? " · exclusivo" : ""}
                        </span>
                      ))}
                    </div>
                    {/* ponytail: mapa Mapbox de polígonos pendiente — incremento aparte; chips ya comunican la cobertura. */}
                  </Seccion>
                )}

                {p.tasa_respuesta != null && (
                  <Seccion titulo="Desempeño" sub={`Sobre ${p.n_leads} contacto${p.n_leads === 1 ? "" : "s"} de los últimos 6 meses`}>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <Stat label="Tasa de respuesta" value={`${Math.round(p.tasa_respuesta)}%`} />
                      <Stat label="Llegó a oferta" value={`${Math.round(p.tasa_oferta ?? 0)}%`} />
                      <Stat label="Conversión" value={`${Math.round(p.tasa_conversion ?? 0)}%`} />
                    </div>
                  </Seccion>
                )}

                <Seccion titulo={`En venta${p.n_activos ? ` (${p.n_activos})` : ""}`}>
                  {p.activos.length > 0
                    ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{p.activos.map((l) => <ListingCard key={l.id} l={l} />)}</div>
                    : <p className="text-xs" style={{ color: K.muted }}>Sin propiedades publicadas por ahora.</p>}
                </Seccion>

                <Seccion titulo={`Vendidas${p.n_cierres ? ` (${p.n_cierres})` : ""}`} sub="Propiedades que cerró en la plataforma">
                  {p.cierres.length > 0
                    ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{p.cierres.map((l) => <ListingCard key={l.id} l={l} cerrado />)}</div>
                    : <p className="text-xs" style={{ color: K.muted }}>Aún no registra cierres en la plataforma.</p>}
                </Seccion>

                <Seccion titulo="Reseñas">
                  {p.rating_promedio != null ? (
                    <div className="mb-4 flex flex-col gap-4 rounded-xl p-4 sm:flex-row sm:items-center" style={{ background: K.paper, border: `1px solid ${K.line}` }}>
                      <div className="text-center sm:w-32 sm:shrink-0">
                        <div className="text-4xl font-bold leading-none" style={{ color: K.tealDeep, fontFamily: K.serif }}>{p.rating_promedio.toFixed(1)}</div>
                        <div className="mt-1 flex justify-center"><Stars value={p.rating_promedio} /></div>
                        <div data-i18n-skip="true" className="mt-1 text-[11px]" style={{ color: K.muted }}>{p.n_resenas} reseña{p.n_resenas === 1 ? "" : "s"}</div>
                      </div>
                      <div className="flex-1 space-y-1">
                        {d.dist.map(({ star, n }) => (
                          <div key={star} className="flex items-center gap-2">
                            <span className="inline-flex w-10 items-center gap-0.5 text-[11px] font-semibold" style={{ color: K.muted }}>{star} <Star width={10} height={10} fill={K.teal} stroke={K.teal} /></span>
                            <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: K.surface }}><div className="h-full rounded-full" style={{ width: `${(n / d.maxN) * 100}%`, background: K.teal }} /></div>
                            <span data-i18n-skip="true" className="w-5 text-right text-[11px]" style={{ color: K.muted }}>{n}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : <p className="mb-3 text-xs" style={{ color: K.muted }}>Aún sin reseñas. Sé el primero en dejar una.</p>}
                  {p.resenas.length > 0 && (
                    <div className="flex flex-col gap-3">
                      {p.resenas.map((r, i) => (
                        <div key={i} className="rounded-xl p-3" style={{ background: "#FFFFFF", border: `1px solid ${K.line}` }}>
                          <div className="flex items-center gap-2">
                            <Stars value={r.calificacion} size={12} /><span className="text-xs font-semibold" style={{ color: K.ink }}>{r.autor}</span>
                            {r.created_at && <span className="text-[11px]" style={{ color: K.muted }}>· {new Date(r.created_at).toLocaleDateString("es-CO", { year: "numeric", month: "short" })}</span>}
                          </div>
                          {r.comentario && <p className="mt-1 text-[13px] leading-relaxed" style={{ color: K.muted }}>{r.comentario}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-3">
                    {reseñando ? <ResenaForm agentId={p.id} onDone={() => setReseñando(false)} />
                      : logueado ? <button onClick={() => setReseñando(true)} className="text-xs font-semibold" style={{ color: K.tealDeep }}>Escribir una reseña</button>
                      : <Link to="/login" className="text-xs font-semibold" style={{ color: K.muted }}>Inicia sesión para dejar una reseña</Link>}
                  </div>
                </Seccion>

                {similares && similares.length > 0 && (
                  <Seccion titulo="Otros agentes en la zona">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{similares.map((a) => <AgenteMiniCard key={a.id} a={a} />)}</div>
                  </Seccion>
                )}
              </div>

              {/* Columna lateral sticky */}
              <aside className="lg:sticky lg:top-24 lg:self-start">
                <div id="contacto" className="scroll-mt-24 rounded-2xl p-5" style={{ background: "#FFFFFF", border: `1px solid ${K.line}` }}>
                  <h2 className="text-base font-bold" style={{ color: K.ink, fontFamily: K.serif }}>Contactar a {p.nombre.split(" ")[0]}</h2>
                  <p className="mb-3 mt-0.5 text-xs" style={{ color: K.muted }}>Déjale tu info y te contacta — o escríbele directo.</p>
                  <ContactoAgenteForm agentId={p.id} agentNombre={p.nombre} />
                  {p.telefono && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <a href={`tel:${p.telefono}`} className="inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition hover:opacity-80" style={{ border: `1px solid ${K.line}`, color: K.ink }}><Phone className="h-4 w-4" /> Llamar</a>
                      <a href={waFromTel(p.telefono, p.nombre)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-white transition hover:opacity-90" style={{ background: K.tealDeep }}><MessageCircle className="h-4 w-4" /> WhatsApp</a>
                    </div>
                  )}
                </div>

                {/* CTA secundario */}
                <Link to="/vender" className="mt-3 flex items-center gap-3 rounded-2xl p-4 transition hover:shadow-sm" style={{ background: K.tealLight, border: `1px solid ${K.teal}` }}>
                  <Home className="h-5 w-5 shrink-0" style={{ color: K.tealDeep }} />
                  <div>
                    <div className="text-sm font-bold" style={{ color: K.ink }}>¿Quieres vender?</div>
                    <div className="text-xs" style={{ color: K.muted }}>Estima el precio de tu propiedad gratis</div>
                  </div>
                </Link>
              </aside>
            </div>
          </>
        )}
      </div>

      {/* Barra fija inferior (móvil) */}
      {p && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex gap-2 border-t p-3 lg:hidden" style={{ background: "#FFFFFF", borderColor: K.line }}>
          {p.telefono && <a href={`tel:${p.telefono}`} className="flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition hover:opacity-80" style={{ border: `1px solid ${K.line}`, color: K.ink }}><Phone className="h-4 w-4" /> Llamar</a>}
          <button onClick={scrollToContacto} className="flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90" style={{ background: K.tealDeep }}><MessageCircle className="h-4 w-4" /> Contactar</button>
        </div>
      )}
    </ComunidadLayout>
  );
}
