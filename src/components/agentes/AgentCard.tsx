// Tarjeta de agente horizontal — compartida por el directorio /agentes y la
// sección "otros agentes en la zona" del perfil. Campos enriquecidos opcionales:
// oculta la métrica que no tengamos (nunca un valor falso).
import { Link } from "@tanstack/react-router";
import { Name } from "@/lib/i18n";
import { MapPin, ShieldCheck, MessageCircle, Phone, Globe2, Home, CheckCircle, Briefcase, Star } from "@/lib/icons";
import { K } from "@/design/tokens";
import { Stars, waFromTel, perfilHref, rangoPrecio } from "@/components/agentes/agenteShared";

export type AgenteCardData = {
  id: string; slug: string | null; nombre: string; foto_url: string | null;
  telefono: string | null;
  agencia_nombre?: string | null; agencia_verificada?: boolean; agencia_logo?: string | null;
  verificado?: boolean;
  rating_promedio: number | null; n_resenas: number;
  zonas: string[];
  exclusivo?: boolean; destacado?: boolean;
  bio_corta?: string | null;
  idiomas?: string[]; especialidades?: string[];
  anios_experiencia?: number | null;
  n_activos?: number; cerradas_12m?: number;
  precio_min?: number | null; precio_max?: number | null;
};

function iniciales(n: string) {
  return n.split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();
}

function Metric({ icon: Icon, label, value }: { icon: typeof Home; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="h-4 w-4 shrink-0" style={{ color: K.teal }} />
      <span className="text-[13px]" style={{ color: K.ink }}><span className="font-bold">{value}</span> <span style={{ color: K.muted }}>{label}</span></span>
    </div>
  );
}

export function AgentCard({ a }: { a: AgenteCardData }) {
  const zonas = a.zonas ?? [];
  const zonasVis = zonas.slice(0, 3);
  const zonasResto = zonas.length - zonasVis.length;
  const tel = a.telefono;
  const metrics = [
    (a.n_activos ?? 0) > 0 ? { icon: Home, value: String(a.n_activos), label: "en venta" } : null,
    (a.cerradas_12m ?? 0) > 0 ? { icon: CheckCircle, value: String(a.cerradas_12m), label: "vendidas (12m)" } : null,
    a.precio_min != null && a.precio_max != null ? { icon: MapPin, value: rangoPrecio(a.precio_min, a.precio_max), label: "" } : null,
    a.anios_experiencia != null ? { icon: Briefcase, value: `${a.anios_experiencia}`, label: a.anios_experiencia === 1 ? "año" : "años" } : null,
  ].filter(Boolean) as { icon: typeof Home; value: string; label: string }[];

  return (
    <article className="rounded-2xl p-4 transition hover:shadow-md sm:p-5" style={{ border: `1px solid ${K.line}`, background: "#FFFFFF" }}>
      <div className="flex flex-col gap-4 sm:flex-row">
        {/* Foto */}
        <Link to="/agentes/$id" params={{ id: perfilHref(a) }} aria-label={`Ver perfil de ${a.nombre}`}
          className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-2xl transition hover:opacity-90" style={{ background: K.tealLight }}>
          {a.foto_url ? <img src={a.foto_url} alt={a.nombre} loading="lazy" className="h-full w-full object-cover" />
            : <span className="text-2xl font-bold" style={{ color: K.tealDeep, fontFamily: K.serif }}>{iniciales(a.nombre)}</span>}
        </Link>

        {/* Centro */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/agentes/$id" params={{ id: perfilHref(a) }} className="text-xl font-bold leading-tight tracking-tight transition hover:opacity-70" style={{ color: K.ink, fontFamily: K.serif }}>
              <Name>{a.nombre}</Name>
            </Link>
            {a.verificado && <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: K.tealLight, color: K.tealDeep }}><ShieldCheck className="h-3 w-3" /> Verificado</span>}
            {a.destacado && <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "#FBF3D9", color: K.amber }}><Star width={10} height={10} fill={K.amber} stroke={K.amber} /> Destacado</span>}
          </div>

          {a.agencia_nombre && (
            <div className="mt-0.5 flex items-center gap-1.5 text-[13px]" style={{ color: K.muted }}>
              {a.agencia_logo && <img src={a.agencia_logo} alt="" className="h-4 w-4 rounded object-contain" />}
              {a.agencia_nombre}{a.agencia_verificada && <ShieldCheck className="h-3 w-3" style={{ color: K.teal }} />}
            </div>
          )}

          {a.rating_promedio != null ? (
            <div className="mt-1 flex items-center gap-1.5">
              <Stars value={a.rating_promedio} /><span className="text-xs font-semibold" style={{ color: K.ink }}>{a.rating_promedio.toFixed(1)}</span>
              <span data-i18n-skip="true" className="text-xs" style={{ color: K.muted }}>({a.n_resenas})</span>
            </div>
          ) : <div className="mt-1 text-xs" style={{ color: K.muted }}>Sin reseñas aún</div>}

          {metrics.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">{metrics.map((m, i) => <Metric key={i} {...m} />)}</div>
          )}

          {(zonasVis.length > 0 || a.exclusivo) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {zonasVis.map((z) => (
                <span key={z} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={a.exclusivo ? { background: K.tealDeep, color: "#FFFFFF" } : { background: K.tealLight, color: K.tealDeep }}>
                  <MapPin className="h-3 w-3" /> {z}
                </span>
              ))}
              {zonasResto > 0 && <span className="text-[11px] font-semibold" style={{ color: K.muted }}>+{zonasResto}</span>}
              {a.exclusivo && <span className="text-[11px] font-semibold" style={{ color: K.tealDeep }}>· Exclusivo</span>}
            </div>
          )}

          {a.bio_corta && <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed" style={{ color: K.muted }}>{a.bio_corta}</p>}
          {a.idiomas && a.idiomas.length > 0 && (
            <div className="mt-1.5 inline-flex items-center gap-1 text-[11px]" style={{ color: K.muted }}><Globe2 className="h-3 w-3" /> {a.idiomas.join(", ")}</div>
          )}
        </div>

        {/* Acciones */}
        <div className="flex shrink-0 flex-col gap-2 sm:w-40 sm:justify-center">
          <Link to="/agentes/$id" params={{ id: perfilHref(a) }} className="rounded-xl px-5 py-2.5 text-center text-sm font-semibold text-white transition hover:opacity-90" style={{ background: K.tealDeep }}>Ver perfil</Link>
          {tel && <a href={waFromTel(tel, a.nombre)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition hover:opacity-80" style={{ border: `1px solid ${K.line}`, color: K.ink }}><MessageCircle className="h-4 w-4" /> WhatsApp</a>}
          {tel && <a href={`tel:${tel}`} className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition hover:opacity-80" style={{ border: `1px solid ${K.line}`, color: K.ink }}><Phone className="h-4 w-4" /> Llamar</a>}
        </div>
      </div>
    </article>
  );
}
