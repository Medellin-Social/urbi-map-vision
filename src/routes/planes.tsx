import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Lock } from "lucide-react";
import { auth } from "@/lib/auth";
import { getToken } from "@/lib/apiClient";
import { API_ENDPOINTS } from "@/config/api";
import { ComunidadLayout } from "@/components/comunidad/ComunidadLayout";
import { GHL, ghlRedirect } from "@/config/ghl";

const K = {
  paper:     "#FAF7F2",
  ink:       "#1A1208",
  muted:     "#6B5B45",
  teal:      "#1D9E75",
  tealDeep:  "#085041",
  tealMid:   "#0D6E50",
  tealLight: "#E8F5F0",
  coral:     "#D85A30",
  coralLight:"#FFF0ED",
  line:      "#E8E0D0",
  serif:     "'Fraunces', Georgia, serif" as const,
};

const TRM = 3_300;

// ── Features ──────────────────────────────────────────────────────────────────

const FREE_OWNER = [
  "Mapa con 54,000+ propiedades para estudiar el mercado",
  "Ver precios reales de venta y arriendo en tu barrio",
  "Filtros por tipo, precio, área, habitaciones, estrato",
  "Publicar tu propiedad sin costo",
  "Recibir contactos de compradores e interesados",
];

const LISTING_FEATURES = [
  "Todo lo anterior incluido",
  "Rango de precios real del barrio: barato, típico y caro",
  "Recomendación: vender rápido / precio justo / precio máximo",
  "Historial de precios del sector",
  "Cómo posicionar la propiedad para compradores en USD",
  "Tu propiedad destacada en el mapa del barrio",
  "Estadísticas: vistas, guardados y contactos de tu listing",
  "Estimado de liquidez: cuánto tarda en venderse",
];

const FREE_AGENT = [
  "Mapa completo con 54,000+ propiedades del Valle de Aburrá",
  "Filtros avanzados para encontrar oportunidades",
  "Ver precios por barrio y comuna",
  "Publicar propiedades de clientes sin costo",
  "Comunas y barrios con datos de mercado básicos",
];

const AGENTE_FEATURES = [
  "Todo lo anterior incluido",
  "Aparecer como contacto #1 en todos los listings de tu zona",
  "1 cupo exclusivo por barrio — quien llega primero se queda",
  "Perfil verificado con distintivo de agente de zona",
  "Dashboard: contactos recibidos, vistas y desempeño de zona",
  "Visibilidad directa a compradores e inversores que buscan en esa zona",
];

// ── FAQ ───────────────────────────────────────────────────────────────────────

const FAQ_OWNER = [
  {
    q: "¿El Listing Destacado es un pago único o mensual?",
    a: "Pago único por listing. Pagas una vez y tu propiedad queda destacada con análisis completo hasta que se venda o arriende.",
  },
  {
    q: "¿Qué pasa si mi propiedad no se vende?",
    a: "El listing queda activo mientras quieras. No hay fecha de vencimiento ni cobro adicional.",
  },
  {
    q: "¿Puedo publicar sin el plan Destacado?",
    a: "Sí. El plan gratuito te permite publicar y recibir contactos. El Listing Destacado agrega el análisis de mercado y la posición destacada en el mapa.",
  },
];

const FAQ_AGENT = [
  {
    q: "¿Qué significa 1 cupo exclusivo por zona?",
    a: "Solo puede haber un agente patrocinado por barrio y uno por comuna. Mientras esté activo, apareces como el contacto principal en cada propiedad de esa zona.",
  },
  {
    q: "¿Qué es la verificación de agente?",
    a: "Revisamos tu cédula, RUT y referencias profesionales en 24-48 horas. Es obligatoria para garantizar la calidad del directorio.",
  },
  {
    q: "¿Puedo cancelar la zona patrocinada?",
    a: "Sí. Sin permanencia mínima. Si cancelas, la zona queda disponible para otro agente.",
  },
  {
    q: "¿Puedo tener más de una zona?",
    a: "Sí. Puedes patrocinar varios barrios o comunas a la vez. Cada zona se gestiona y cobra por separado.",
  },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlanesModo {
  modo_manual?: boolean;
  mensaje?: string;
  whatsapp?: string;
  admin_email?: string;
  checkout_url?: string | null;
  requiere_verificacion?: boolean;
  redirect?: string;
}

type Audiencia = "propietario" | "agente";

export const Route = createFileRoute("/planes")({
  component: PlanesPage,
});

// ── Page ──────────────────────────────────────────────────────────────────────

function PlanesPage() {
  const navigate = useNavigate();
  const user = typeof window !== "undefined" ? auth.get() : null;

  const [audiencia, setAudiencia] = useState<Audiencia>("propietario");
  const [moneda, setMoneda] = useState<"COP" | "USD">("COP");
  const [iniciando, setIniciando] = useState(false);
  const [modalInfo, setModalInfo] = useState<PlanesModo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const planActual = user?.plan ?? "free";

  const fmt = (usd: number) =>
    moneda === "USD"
      ? `$${usd.toLocaleString("en-US")} USD`
      : `$${(usd * TRM).toLocaleString("es-CO")} COP`;

  async function iniciarAgente() {
    // GHL link disponible → directo al checkout
    if (GHL.agente_barrio) {
      ghlRedirect(GHL.agente_barrio, { moneda, ...(user?.email ? { email: user.email } : {}) });
      return;
    }
    // Fallback: flujo manual/Stripe existente
    if (!user) {
      navigate({ to: "/login", search: { redirect: "/planes" } as never });
      return;
    }
    setIniciando(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("plan", "agente");
      fd.append("moneda", moneda);
      const res = await fetch(API_ENDPOINTS.suscripcionesIniciar, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      });
      if (!res.ok) throw new Error(await res.text());
      const data: PlanesModo = await res.json();
      if (data.requiere_verificacion) { navigate({ to: data.redirect as never }); return; }
      if (data.checkout_url) { window.location.href = data.checkout_url; return; }
      if (data.modo_manual) { setModalInfo(data); return; }
    } catch {
      setError("Error iniciando el proceso. Intenta de nuevo.");
    } finally {
      setIniciando(false);
    }
  }

  const faqItems = audiencia === "propietario" ? FAQ_OWNER : FAQ_AGENT;

  return (
    <ComunidadLayout>
      {/* Hero */}
      <div style={{
        background: `linear-gradient(135deg, ${K.tealDeep} 0%, ${K.tealMid} 50%, ${K.teal} 100%)`,
        padding: "52px 20px 44px",
        textAlign: "center",
      }}>
        <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", marginBottom: 10 }}>
          ¿Quién eres?
        </p>
        <h1 style={{ fontFamily: K.serif, fontSize: "clamp(1.6rem, 4vw, 2.3rem)", fontWeight: 900, color: "#fff", marginBottom: 20 }}>
          {audiencia === "propietario" ? "Vende o arrienda mejor" : "Domina tu zona"}
        </h1>

        {/* Audience toggle */}
        <div style={{ display: "inline-flex", background: "rgba(0,0,0,0.25)", borderRadius: 999, padding: 4, marginBottom: 24, gap: 4 }}>
          {([
            { key: "propietario", label: "🏠 Soy propietario" },
            { key: "agente",      label: "🤝 Soy agente inmobiliario" },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setAudiencia(key)}
              style={{
                border: "none",
                background: audiencia === key ? "#fff" : "transparent",
                color: audiencia === key ? K.tealDeep : "rgba(255,255,255,0.85)",
                padding: "8px 18px", fontWeight: 700, borderRadius: 999,
                cursor: "pointer", fontSize: 13, transition: "all 0.15s",
                fontFamily: "inherit",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Currency toggle */}
        <div>
          <div style={{ display: "inline-flex", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 999, overflow: "hidden" }}>
            {(["COP", "USD"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMoneda(m)}
                style={{
                  border: "none",
                  background: moneda === m ? "#fff" : "transparent",
                  color: moneda === m ? K.tealDeep : "rgba(255,255,255,0.7)",
                  padding: "5px 16px", fontWeight: 700,
                  cursor: "pointer", fontSize: 12, transition: "all 0.15s",
                  fontFamily: "inherit",
                }}
              >
                {m === "COP" ? "Pesos COP" : "USD $"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ background: K.paper, minHeight: "60vh" }}>
        <div style={{ maxWidth: 840, margin: "0 auto", padding: "48px 20px" }}>

          {error && (
            <div style={{
              background: K.coralLight, border: `1px solid ${K.coral}`,
              borderRadius: 8, padding: "10px 14px",
              fontSize: 13, color: K.coral, marginBottom: 28, textAlign: "center",
            }}>
              {error}
            </div>
          )}

          {/* Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24, alignItems: "start" }}>

            {audiencia === "propietario" ? (
              <>
                <PlanCard
                  id="free"
                  nombre="Gratis"
                  tagline="Para conocer el mercado"
                  precioLabel="$0"
                  periodicidad="Siempre gratis"
                  features={FREE_OWNER}
                  isActive={planActual === "free"}
                  popular={false}
                  cta={!user ? "Comenzar gratis" : "Tu plan actual"}
                  ctaDisabled={!!user && planActual === "free"}
                  onCTA={() => navigate({ to: "/register" })}
                  iniciando={false}
                />
                <PlanCard
                  id="listing"
                  nombre="Listing Destacado"
                  tagline="Para vender o arrendar al mejor precio"
                  precioLabel={fmt(1_000)}
                  periodicidad="pago único · por listing"
                  features={LISTING_FEATURES}
                  isActive={false}
                  popular={true}
                  badge="MEJOR VALOR"
                  cta="Publicar con destacado →"
                  ctaDisabled={false}
                  onCTA={() => ghlRedirect(GHL.listing, user?.email ? { email: user.email } : {}, "/publicar")}
                  iniciando={false}
                />
              </>
            ) : (
              <>
                <PlanCard
                  id="free"
                  nombre="Gratis"
                  tagline="Para prospectar y publicar clientes"
                  precioLabel="$0"
                  periodicidad="Siempre gratis"
                  features={FREE_AGENT}
                  isActive={planActual === "free"}
                  popular={false}
                  cta={!user ? "Crear cuenta" : "Tu plan actual"}
                  ctaDisabled={!!user && planActual === "free"}
                  onCTA={() => navigate({ to: "/register" })}
                  iniciando={false}
                />
                <PlanCard
                  id="agente"
                  nombre="Agente de Zona"
                  tagline="Cupo exclusivo en tu barrio o comuna"
                  precioLabel={`desde ${fmt(200)}`}
                  periodicidad="por barrio · mes"
                  note={`${fmt(1_000)} / comuna · mes`}
                  features={AGENTE_FEATURES}
                  isActive={planActual === "agente"}
                  popular={true}
                  badge="EXCLUSIVO"
                  cta={planActual === "agente" ? "Plan activo" : "Solicitar zona →"}
                  ctaDisabled={planActual === "agente"}
                  onCTA={iniciarAgente}
                  iniciando={iniciando}
                  requiere_verificacion
                />
              </>
            )}
          </div>

          {/* FAQ */}
          <div style={{ marginTop: 64, maxWidth: 560, margin: "64px auto 0" }}>
            <h2 style={{ fontFamily: K.serif, fontSize: "1.3rem", fontWeight: 800, color: K.ink, marginBottom: 20, textAlign: "center" }}>
              Preguntas frecuentes
            </h2>
            {faqItems.map((item) => (
              <div key={item.q} style={{ borderBottom: `1px solid ${K.line}`, padding: "18px 0" }}>
                <p style={{ fontWeight: 700, fontSize: 14, color: K.ink, marginBottom: 6 }}>{item.q}</p>
                <p style={{ fontSize: 13, color: K.muted, lineHeight: 1.7, margin: 0 }}>{item.a}</p>
              </div>
            ))}
            <p style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: K.muted }}>
              ¿Más preguntas?{" "}
              <a href="mailto:hola@medellin.social" style={{ color: K.teal }}>hola@medellin.social</a>
            </p>
          </div>
        </div>
      </div>

      {/* Manual payment modal */}
      {modalInfo && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => setModalInfo(null)}
        >
          <div
            style={{ background: "#fff", borderRadius: 16, padding: "32px 28px", maxWidth: 440, width: "90%", textAlign: "center" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 40, marginBottom: 12 }}>📞</div>
            <h3 style={{ fontFamily: K.serif, fontSize: "1.3rem", fontWeight: 800, color: K.ink, marginBottom: 10 }}>
              Solicitud de zona
            </h3>
            <p style={{ fontSize: 14, color: K.muted, lineHeight: 1.7, marginBottom: 20 }}>{modalInfo.mensaje}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {modalInfo.whatsapp && (
                <a
                  href={`https://wa.me/${modalInfo.whatsapp.replace(/\D/g, "")}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ background: "#25D366", color: "#fff", padding: "11px 20px", borderRadius: 8, fontWeight: 700, fontSize: 13, textDecoration: "none" }}
                >
                  Contactar por WhatsApp
                </a>
              )}
              {modalInfo.admin_email && (
                <a
                  href={`mailto:${modalInfo.admin_email}`}
                  style={{ background: K.teal, color: "#fff", padding: "11px 20px", borderRadius: 8, fontWeight: 700, fontSize: 13, textDecoration: "none" }}
                >
                  Enviar email
                </a>
              )}
              <button
                onClick={() => setModalInfo(null)}
                style={{ background: "none", border: `1px solid ${K.line}`, padding: "9px 20px", borderRadius: 8, fontWeight: 600, fontSize: 13, color: K.muted, cursor: "pointer" }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </ComunidadLayout>
  );
}

// ── PlanCard ──────────────────────────────────────────────────────────────────

function PlanCard({
  id, nombre, tagline, precioLabel, periodicidad, note, features,
  isActive, popular, badge, cta, ctaDisabled, onCTA, iniciando, requiere_verificacion,
}: {
  id: string;
  nombre: string;
  tagline: string;
  precioLabel: string;
  periodicidad: string;
  note?: string;
  features: string[];
  isActive: boolean;
  popular: boolean;
  badge?: string;
  cta: string;
  ctaDisabled: boolean;
  onCTA: () => void;
  iniciando: boolean;
  requiere_verificacion?: boolean;
}) {
  return (
    <div style={{
      background: "#fff",
      border: `2px solid ${popular ? K.teal : isActive ? K.tealDeep : K.line}`,
      borderRadius: 16,
      overflow: "hidden",
      boxShadow: popular ? `0 4px 24px ${K.teal}33` : "none",
    }}>
      {badge && (
        <div style={{
          background: popular ? K.teal : K.tealMid, color: "#fff",
          textAlign: "center", padding: "5px 0",
          fontSize: 11, fontWeight: 800, letterSpacing: "0.5px",
        }}>
          {badge}
        </div>
      )}

      <div style={{ padding: "24px 24px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
          <h2 style={{ fontFamily: K.serif, fontSize: "1.25rem", fontWeight: 900, color: K.ink, margin: 0 }}>
            {nombre}
          </h2>
          {isActive && (
            <span style={{ background: K.tealLight, color: K.tealDeep, borderRadius: 999, padding: "3px 10px", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}>
              Tu plan
            </span>
          )}
        </div>

        <p style={{ color: K.muted, fontSize: 13, lineHeight: 1.5, marginBottom: 16 }}>{tagline}</p>

        <div style={{ marginBottom: 20 }}>
          <span style={{ fontFamily: K.serif, fontSize: id === "free" ? "2rem" : "1.55rem", fontWeight: 900, color: K.ink }}>
            {precioLabel}
          </span>
          <span style={{ fontSize: 12, color: K.muted, display: "block", marginTop: 2 }}>{periodicidad}</span>
          {note && <span style={{ fontSize: 11, color: K.muted, marginTop: 4, display: "block" }}>{note}</span>}
        </div>

        <button
          disabled={ctaDisabled || iniciando}
          onClick={onCTA}
          style={{
            width: "100%",
            background: ctaDisabled ? K.tealLight : K.teal,
            color: ctaDisabled ? K.tealDeep : "#fff",
            border: "none", borderRadius: 8,
            padding: "11px 0", fontWeight: 700, fontSize: 13,
            cursor: ctaDisabled ? "not-allowed" : "pointer",
            transition: "background 0.15s", fontFamily: "inherit",
          }}
        >
          {iniciando ? "Procesando…" : cta}
        </button>

        {requiere_verificacion && !ctaDisabled && (
          <p style={{ fontSize: 11, color: K.muted, textAlign: "center", marginTop: 6, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
            <Lock size={10} /> Requiere verificación (24-48 h)
          </p>
        )}
      </div>

      <div style={{ borderTop: `1px solid ${K.line}`, padding: "16px 24px 24px" }}>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {features.map((f) => (
            <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: K.ink }}>
              <Check style={{ flexShrink: 0, marginTop: 1 }} size={14} color={K.teal} />
              {f}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
