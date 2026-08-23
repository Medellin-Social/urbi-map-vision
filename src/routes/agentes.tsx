import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { MapPin, MessageCircle, Users, ArrowRight, Search, Star, ShieldCheck, HelpCircle } from "lucide-react";
import { apiFetch } from "@/lib/apiClient";
import { API_ENDPOINTS } from "@/config/api";
import { ComunidadLayout } from "@/components/comunidad/ComunidadLayout";
import { auth } from "@/lib/auth";

export const Route = createFileRoute("/agentes")({
  component: AgentesPage,
});

type Agente = {
  id: string;
  nombre: string;
  foto_url: string | null;
  telefono: string;
  email: string;
  zonas: string[];
  agencia_nombre: string | null;
  agencia_verificada: boolean;
  rating_promedio: number | null; // null = sin reseñas — nunca un 0 inventado
  n_resenas: number;
};

const K = {
  paper: "#FAF7F2", ink: "#1A1208", muted: "#6B5B45", line: "#E8E0D0",
  teal: "#1D9E75", tealDeep: "#085041", tealLight: "#E1F5EE",
  serif: "'Fraunces', Georgia, serif" as const,
};

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
  const tel = a.telefono.replace(/\D/g, "");
  const num = tel.startsWith("57") ? tel : `57${tel}`;
  const text = encodeURIComponent(`Hola ${a.nombre}, quiero información sobre propiedades.`);
  return `https://wa.me/+${num}?text=${text}`;
}

function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          width={size}
          height={size}
          fill={i <= Math.round(value) ? K.teal : "none"}
          stroke={i <= Math.round(value) ? K.teal : "#C8BFB0"}
          strokeWidth={1.5}
        />
      ))}
    </span>
  );
}

function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <span className="inline-flex gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          aria-label={`${i} estrella${i === 1 ? "" : "s"}`}
          onClick={() => onChange(i)}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(0)}
          className="p-0.5"
        >
          <Star width={22} height={22} fill={shown >= i ? K.teal : "none"} stroke={shown >= i ? K.teal : "#C8BFB0"} strokeWidth={1.5} />
        </button>
      ))}
    </span>
  );
}

// Formulario inline para dejar/actualizar tu reseña — login-gated (el endpoint
// exige token). Un usuario, una reseña por agente: reenviar actualiza la propia,
// no crea una segunda (constraint UNIQUE agent_id+user_id en el backend).
function ResenaForm({ agentId, onDone }: { agentId: string; onDone: () => void }) {
  const [calificacion, setCalificacion] = useState(0);
  const [comentario, setComentario] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();

  async function submit() {
    if (!calificacion) { setError("Elige una calificación"); return; }
    setSending(true);
    setError(null);
    try {
      await apiFetch(API_ENDPOINTS.agenteResenas(agentId), {
        method: "POST",
        body: JSON.stringify({ calificacion, comentario: comentario.trim() || null }),
      });
      await qc.invalidateQueries({ queryKey: ["agentes-directorio"] });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar la reseña");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl p-3" style={{ background: K.paper, border: `1px solid ${K.line}` }}>
      <StarPicker value={calificacion} onChange={setCalificacion} />
      <textarea
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
        placeholder="¿Cómo fue tu experiencia? (opcional)"
        rows={2}
        className="mt-2 w-full resize-none rounded-lg p-2 text-sm outline-none"
        style={{ border: `1px solid ${K.line}`, background: "#FFFFFF", color: K.ink }}
      />
      {error && <p className="mt-1 text-xs" style={{ color: "#C0392B" }}>{error}</p>}
      <div className="mt-2 flex gap-2">
        <button
          onClick={submit}
          disabled={sending}
          className="rounded-lg px-4 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          style={{ background: K.tealDeep }}
        >
          {sending ? "Enviando…" : "Enviar reseña"}
        </button>
        <button onClick={onDone} className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ color: K.muted }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

function AgenteRow({ a }: { a: Agente }) {
  const iniciales = a.nombre.split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  const [zonaPrincipal, ...zonasExtra] = a.zonas;
  const [reseñando, setReseñando] = useState(false);
  const logueado = typeof window !== "undefined" && !!auth.get();

  return (
    <div
      className="flex flex-col overflow-hidden rounded-2xl border-l-4 p-5"
      style={{ borderColor: K.teal, borderTop: `1px solid ${K.line}`, borderRight: `1px solid ${K.line}`, borderBottom: `1px solid ${K.line}`, background: "#FFFFFF" }}
    >
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-2xl" style={{ background: K.tealLight }}>
          {a.foto_url
            ? <img src={a.foto_url} alt={a.nombre} className="h-full w-full object-cover" />
            : iniciales
            ? <span className="text-2xl font-bold" style={{ color: K.tealDeep, fontFamily: K.serif }}>{iniciales}</span>
            : <Users className="h-9 w-9" style={{ color: K.teal }} />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-2xl font-bold leading-tight tracking-tight" style={{ color: K.ink, fontFamily: K.serif }}>{a.nombre}</div>

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
                  style={a.agencia_verificada ? { background: K.tealLight, color: K.tealDeep } : { background: "#F5F0E8", color: K.muted }}
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

        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto">
          <a
            href={waLink(a)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
            style={{ background: K.tealDeep }}
          >
            <MessageCircle className="h-4 w-4" /> Contactar por WhatsApp
          </a>
          {!reseñando && (
            logueado ? (
              <button onClick={() => setReseñando(true)} className="text-xs font-semibold transition hover:opacity-70" style={{ color: K.tealDeep }}>
                Escribir una reseña
              </button>
            ) : (
              <Link to="/login" className="text-center text-xs font-semibold transition hover:opacity-70" style={{ color: K.muted }}>
                Inicia sesión para dejar una reseña
              </Link>
            )
          )}
        </div>
      </div>

      {reseñando && <ResenaForm agentId={a.id} onDone={() => setReseñando(false)} />}
    </div>
  );
}

function AgenteRowSkeleton() {
  return (
    <div className="flex animate-pulse items-center gap-4 rounded-2xl border-l-4 p-5" style={{ borderColor: K.line, borderTop: `1px solid ${K.line}`, borderRight: `1px solid ${K.line}`, borderBottom: `1px solid ${K.line}`, background: "#FFFFFF" }}>
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

  const [busqueda, setBusqueda] = useState("");
  const [zonaFiltro, setZonaFiltro] = useState("");
  const [orden, setOrden] = useState<SortKey>("nombre");

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
  }, [agentes, busqueda, zonaFiltro, orden]);

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
          {/* Columna 1: buscar + filtrar + ordenar */}
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

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: K.muted }}>Ordenar por</label>
              <select value={orden} onChange={(e) => setOrden(e.target.value as SortKey)} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle}>
                <option value="nombre">Nombre</option>
                <option value="rating">Mejor calificados</option>
                <option value="verificado">Agencias verificadas primero</option>
              </select>
            </div>

            {!isLoading && (
              <div className="h-px" style={{ background: K.line }} />
            )}
            {!isLoading && (
              visibles.length === 0 ? (
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: K.teal }}>Sin resultados</span>
              ) : (
                <span data-i18n-skip="true" className="text-xs font-semibold uppercase tracking-wide" style={{ color: K.teal }}>
                  {visibles.length} agente{visibles.length === 1 ? "" : "s"}
                </span>
              )
            )}
          </aside>

          {/* Columna 2: resultados */}
          <div>
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
