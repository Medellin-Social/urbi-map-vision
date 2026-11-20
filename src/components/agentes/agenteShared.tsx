// Piezas compartidas entre el directorio (/agentes) y la página de perfil
// (/agentes/$id). Tipos + helpers + estrellas — una sola fuente, sin duplicar.
import { useState } from "react";
import { z } from "zod";
import { Star } from "@/lib/icons";
import { formatMoney } from "@/lib/format";
import { apiFetch } from "@/lib/apiClient";
import { API_ENDPOINTS } from "@/config/api";
import { useQueryClient } from "@tanstack/react-query";
import { K } from "@/design/tokens";

// ── Tipos ────────────────────────────────────────────────────────────────────
export type Agente = {
  id: string;
  slug: string | null;
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

// Ruta del perfil: usa slug si existe, si no el UUID (el endpoint resuelve ambos).
export const perfilHref = (a: { slug: string | null; id: string }) => a.slug || a.id;

export type PerfilListing = {
  id: string; map_id: number | null; slug: string | null; titulo: string | null; precio: number | null;
  moneda: string; operacion: string | null; tipo_inmueble: string | null;
  area_m2: number | null; habitaciones: number | null; banos: number | null;
  municipio: string | null; barrio: string | null; foto_portada: string | null;
};
export type PerfilResena = { calificacion: number; comentario: string | null; autor: string; created_at: string | null };
export type PerfilZona = { nivel: string; nombre: string | null; exclusivo: boolean };
export type PerfilLicencia = { entidad?: string; numero?: string } | string;
export type AgentePerfil = {
  id: string; slug: string | null; ciudad_id: number;
  nombre: string; foto_url: string | null; bio: string | null;
  titulo: string | null; verificado: boolean;
  anios_experiencia: number | null; idiomas: string[]; especialidades: string[]; licencias: PerfilLicencia[];
  telefono: string | null; agencia_nombre: string | null; agencia_verificada: boolean; agencia_logo: string | null;
  miembro_desde: string | null; rating_promedio: number | null; n_resenas: number;
  responde_rapido?: boolean; mediana_resp_horas?: number | null;
  n_leads?: number; tasa_respuesta?: number | null; tasa_oferta?: number | null; tasa_conversion?: number | null;
  zonas: PerfilZona[]; activos: PerfilListing[]; cierres: PerfilListing[];
  n_activos: number; n_cierres: number; vendidas_12m: number;
  precio_min: number | null; precio_max: number | null;
  resenas: PerfilResena[];
};

// ── Helpers ──────────────────────────────────────────────────────────────────
export function iniciales(nombre: string): string {
  return nombre.split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();
}

export function fmtPrecio(v: number | null | undefined, moneda = "COP"): string {
  if (v == null) return "";
  return formatMoney(v, moneda === "USD" ? "USD" : "COP", undefined, { suffix: moneda === "USD" });
}

export function rangoPrecio(min: number | null, max: number | null): string {
  if (min == null || max == null) return "—";
  return min === max ? fmtPrecio(min) : `${fmtPrecio(min)} – ${fmtPrecio(max)}`;
}

function waFromTel(telefono: string, nombre: string): string {
  const tel = telefono.replace(/\D/g, "");
  const num = tel.startsWith("57") ? tel : `57${tel}`;
  const text = encodeURIComponent(`Hola ${nombre}, quiero información sobre propiedades.`);
  return `https://wa.me/+${num}?text=${text}`;
}
export { waFromTel };

// ── Estrellas ────────────────────────────────────────────────────────────────
export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          width={size}
          height={size}
          fill={i <= Math.round(value) ? K.teal : "none"}
          stroke={i <= Math.round(value) ? K.teal : "#C9C4B8"}
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
          <Star width={22} height={22} fill={shown >= i ? K.teal : "none"} stroke={shown >= i ? K.teal : "#C9C4B8"} strokeWidth={1.5} />
        </button>
      ))}
    </span>
  );
}

// ── Formulario de contacto público del agente ────────────────────────────────
// El usuario contacta al agente y/o deja su info para que lo contacten. Valida
// con zod (sin react-hook-form: no está instalado) y POSTea a FastAPI, que escribe
// el lead en la agenda del agente. El navegador nunca toca GHL.
export const INTERESES = [
  { v: "comprar", label: "Comprar" },
  { v: "vender", label: "Vender" },
  { v: "arrendar", label: "Arrendar" },
] as const;

export const contactoSchema = z
  .object({
    nombre: z.string().trim().min(1, "Escribe tu nombre"),
    email: z.string().trim().email("Email inválido").or(z.literal("")),
    telefono: z.string().trim().max(40).or(z.literal("")),
    interes: z.enum(["comprar", "vender", "arrendar"]),
    mensaje: z.string().trim().max(2000).or(z.literal("")),
    consentimiento: z.boolean(),
  })
  .refine((d) => d.consentimiento === true, { path: ["consentimiento"], message: "Debes aceptar el tratamiento de datos" })
  .refine((d) => !!d.email || !!d.telefono, { path: ["email"], message: "Deja un email o un teléfono" });

export type ContactoValues = z.infer<typeof contactoSchema>;

const field = "w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2";
const fieldStyle = (bad: boolean): React.CSSProperties => ({
  border: `1px solid ${bad ? "#C0392B" : K.line}`, background: "#FFFFFF", color: K.ink,
});

export function ContactoAgenteForm({ agentId, agentNombre }: { agentId: string; agentNombre: string }) {
  const [v, setV] = useState<ContactoValues>({
    nombre: "", email: "", telefono: "", interes: "comprar",
    mensaje: `Hola ${agentNombre}, me gustaría recibir información. ¿Podemos hablar?`,
    consentimiento: false,
  });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [serverErr, setServerErr] = useState<string | null>(null);

  const set = <K2 extends keyof ContactoValues>(k: K2, val: ContactoValues[K2]) =>
    setV((p) => ({ ...p, [k]: val }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setServerErr(null);
    const parsed = contactoSchema.safeParse(v);
    if (!parsed.success) {
      const map: Record<string, string> = {};
      for (const i of parsed.error.issues) map[String(i.path[0])] = i.message;
      setErrs(map);
      return;
    }
    setErrs({});
    setSending(true);
    try {
      await apiFetch(API_ENDPOINTS.agenteContactar(agentId), {
        method: "POST",
        body: JSON.stringify({
          nombre: v.nombre.trim(), email: v.email.trim() || null, telefono: v.telefono.trim() || null,
          interes: v.interes, mensaje: v.mensaje.trim() || null, consentimiento: v.consentimiento,
        }),
      });
      setDone(true);
    } catch (e) {
      setServerErr(e instanceof Error ? e.message : "No se pudo enviar. Intenta de nuevo.");
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-xl p-4 text-center" style={{ background: K.tealLight, border: `1px solid ${K.teal}` }}>
        <p className="text-sm font-bold" style={{ color: K.tealDeep }}>¡Mensaje enviado!</p>
        <p className="mt-1 text-xs" style={{ color: K.muted }}>{agentNombre} recibirá tu solicitud y te contactará pronto.</p>
      </div>
    );
  }

  const Err = ({ k }: { k: string }) => errs[k] ? <p className="mt-1 text-xs" style={{ color: "#C0392B" }}>{errs[k]}</p> : null;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-2.5">
      <div>
        <label htmlFor="c-nombre" className="mb-1 block text-xs font-semibold" style={{ color: K.ink }}>Nombre</label>
        <input id="c-nombre" value={v.nombre} onChange={(e) => set("nombre", e.target.value)}
          aria-invalid={!!errs.nombre} className={field} style={fieldStyle(!!errs.nombre)} placeholder="Tu nombre" />
        <Err k="nombre" />
      </div>
      <div>
        <label htmlFor="c-interes" className="mb-1 block text-xs font-semibold" style={{ color: K.ink }}>Quiero</label>
        <select id="c-interes" value={v.interes} onChange={(e) => set("interes", e.target.value as ContactoValues["interes"])}
          className={field} style={fieldStyle(false)}>
          {INTERESES.map((i) => <option key={i.v} value={i.v}>{i.label}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div>
          <label htmlFor="c-email" className="mb-1 block text-xs font-semibold" style={{ color: K.ink }}>Email</label>
          <input id="c-email" type="email" value={v.email} onChange={(e) => set("email", e.target.value)}
            aria-invalid={!!errs.email} className={field} style={fieldStyle(!!errs.email)} placeholder="tu@email.com" />
        </div>
        <div>
          <label htmlFor="c-tel" className="mb-1 block text-xs font-semibold" style={{ color: K.ink }}>Teléfono</label>
          <input id="c-tel" type="tel" value={v.telefono} onChange={(e) => set("telefono", e.target.value)}
            className={field} style={fieldStyle(false)} placeholder="300 000 0000" />
        </div>
      </div>
      <Err k="email" />
      <div>
        <label htmlFor="c-msg" className="mb-1 block text-xs font-semibold" style={{ color: K.ink }}>Mensaje</label>
        <textarea id="c-msg" rows={3} value={v.mensaje} onChange={(e) => set("mensaje", e.target.value)}
          className={`${field} resize-none`} style={fieldStyle(false)} />
      </div>
      <label className="flex items-start gap-2 text-[11px]" style={{ color: K.muted }}>
        <input type="checkbox" checked={v.consentimiento} onChange={(e) => set("consentimiento", e.target.checked)}
          aria-invalid={!!errs.consentimiento} className="mt-0.5" style={{ accentColor: K.teal }} />
        <span>Autorizo el tratamiento de mis datos para ser contactado, según la política de privacidad.</span>
      </label>
      <Err k="consentimiento" />
      {serverErr && <p className="text-xs" style={{ color: "#C0392B" }}>{serverErr}</p>}
      <button type="submit" disabled={sending}
        className="mt-1 flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
        style={{ background: K.tealDeep }}>
        {sending ? "Enviando…" : "Enviar solicitud"}
      </button>
    </form>
  );
}

// Formulario inline para dejar/actualizar tu reseña — login-gated (el endpoint
// exige token). Un usuario, una reseña por agente: reenviar actualiza la propia
// (constraint UNIQUE agent_id+user_id en el backend).
export function ResenaForm({ agentId, onDone }: { agentId: string; onDone: () => void }) {
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
      await qc.invalidateQueries({ queryKey: ["agente-perfil", agentId] });
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
