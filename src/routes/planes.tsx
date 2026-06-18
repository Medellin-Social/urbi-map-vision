import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Check, Lock, X } from "lucide-react";
import { auth } from "@/lib/auth";
import { getToken } from "@/lib/apiClient";
import { API_ENDPOINTS } from "@/config/api";
import { ComunidadLayout } from "@/components/comunidad/ComunidadLayout";

const K = {
  paper:     "#FAF7F2",
  ink:       "#1A1208",
  muted:     "#6B5B45",
  teal:      "#1D9E75",
  tealDeep:  "#085041",
  tealLight: "#E8F5F0",
  coral:     "#D85A30",
  coralLight:"#FFF0ED",
  line:      "#E8E0D0",
  amber:     "#F59E0B",
  serif:     "'Fraunces', Georgia, serif" as const,
};

const FREE_FEATURES = [
  "Mapa interactivo con 54,000+ propiedades",
  "Filtros de búsqueda (precio, tipo, área, habitaciones, baños, antigüedad)",
  "Ver propiedades en venta y arriendo",
  "Comunas y barrios del Valle de Aburrá",
  "Eventos y negocios locales",
  "Publicar tu propiedad en el portal (3% comisión solo si se cierra la venta)",
];

const FREE_LOCKED_FEATURES = [
  "Análisis de precio por barrio",
  "Historial de precios",
  "Recomendaciones por perfil",
];

interface Plan {
  id: string;
  nombre: string;
  descripcion: string;
  precio: number;
  moneda: string;
  precio_cop: number;
  precio_usd: number;
  features: string[];
  requiere_verificacion: boolean;
  pago_disponible: boolean;
}

interface PlanesModo {
  modo_manual?: boolean;
  mensaje?: string;
  whatsapp?: string;
  admin_email?: string;
  checkout_url?: string | null;
  requiere_verificacion?: boolean;
  redirect?: string;
}

const FAQ_ITEMS = [
  {
    q: "¿Puedo cancelar cuando quiera?",
    a: "Sí. Sin permanencia. Cancelas en cualquier momento desde tu perfil.",
  },
  {
    q: "¿Cómo funciona la comisión del 3%?",
    a: "Solo se cobra si vendes o arriendas tu propiedad a través de Medellín Social. Publicar es siempre gratis.",
  },
  {
    q: "¿Qué es la verificación de agente?",
    a: "Revisamos tu cédula, RUT y referencias en 24-48 horas. Solo para el plan Agente.",
  },
];

export const Route = createFileRoute("/planes")({
  component: PlanesPage,
});

function PlanesPage() {
  const navigate = useNavigate();
  const user = typeof window !== "undefined" ? auth.get() : null;

  const [moneda, setMoneda] = useState<"COP" | "USD">("COP");
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [iniciando, setIniciando] = useState<string | null>(null);
  const [modalInfo, setModalInfo] = useState<PlanesModo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const planActual = user?.plan ?? "free";

  useEffect(() => {
    fetch(`${API_ENDPOINTS.suscripcionesPlanes}?moneda=${moneda}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => { if (d.planes) setPlanes(d.planes); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [moneda]);

  async function iniciar(planId: string) {
    if (!user) {
      navigate({ to: "/login", search: { redirect: "/planes" } as never });
      return;
    }
    setIniciando(planId);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("plan", planId);
      fd.append("moneda", moneda);
      const res = await fetch(API_ENDPOINTS.suscripcionesIniciar, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      });
      if (!res.ok) throw new Error(await res.text());
      const data: PlanesModo = await res.json();

      if (data.requiere_verificacion) {
        navigate({ to: data.redirect as never });
        return;
      }
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
        return;
      }
      if (data.modo_manual) {
        setModalInfo(data);
        return;
      }
    } catch {
      setError("Error iniciando suscripción. Intenta de nuevo.");
    } finally {
      setIniciando(null);
    }
  }

  return (
    <ComunidadLayout>
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "48px 20px" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <h1 style={{ fontFamily: K.serif, fontSize: "2.2rem", fontWeight: 900, color: K.ink, marginBottom: 12 }}>
            Elige tu plan
          </h1>
          <p style={{ color: K.muted, fontSize: 15, lineHeight: 1.7, maxWidth: 520, margin: "0 auto 28px" }}>
            Toma mejores decisiones en el mercado inmobiliario del Valle de Aburrá con datos reales.
          </p>

          {/* Currency toggle */}
          <div style={{ display: "inline-flex", border: `1px solid ${K.line}`, borderRadius: 999, overflow: "hidden" }}>
            {(["COP", "USD"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMoneda(m)}
                style={{
                  border: "none",
                  background: moneda === m ? K.teal : "transparent",
                  color: moneda === m ? "#fff" : K.muted,
                  padding: "6px 20px", fontWeight: 700,
                  cursor: "pointer", fontSize: 13, transition: "all 0.15s",
                }}
              >
                {m === "COP" ? "Pesos COP" : "USD $"}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div style={{
            background: K.coralLight, border: `1px solid ${K.coral}`,
            borderRadius: 8, padding: "10px 14px", marginBottom: 20,
            fontSize: 13, color: K.coral, maxWidth: 600, margin: "0 auto 20px",
          }}>
            {error}
          </div>
        )}

        {/* Plan cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24, alignItems: "start" }}>

          {/* FREE card */}
          <PlanCard
            id="free"
            nombre="Explorador"
            descripcion="Para conocer el mercado"
            precio={0}
            moneda={moneda}
            features={FREE_FEATURES}
            lockedFeatures={FREE_LOCKED_FEATURES}
            planActual={planActual}
            requiere_verificacion={false}
            cta={!user ? "Comenzar gratis" : "Tu plan actual"}
            ctaDisabled={!!user}
            popular={false}
            onCTA={() => navigate({ to: "/registro" as never })}
            iniciando={false}
          />

          {/* PRO + AGENTE cards */}
          {loading ? (
            <div style={{ gridColumn: "span 2", textAlign: "center", padding: 40, color: K.muted }}>Cargando planes…</div>
          ) : (
            planes.map((p) => (
              <PlanCard
                key={p.id}
                id={p.id}
                nombre={p.nombre}
                descripcion={p.descripcion}
                precio={moneda === "USD" ? p.precio_usd : p.precio_cop}
                moneda={moneda}
                features={p.features}
                planActual={planActual}
                requiere_verificacion={p.requiere_verificacion}
                popular={p.id === "pro"}
                cta={
                  planActual === p.id ? "Plan actual" :
                  planActual === "agente" && p.id === "pro" ? "Incluido en Agente" :
                  `Suscribirse a ${p.nombre} →`
                }
                ctaDisabled={planActual === p.id || (planActual === "agente" && p.id === "pro")}
                onCTA={() => iniciar(p.id)}
                iniciando={iniciando === p.id}
              />
            ))
          )}
        </div>

        {/* Manual payment modal */}
        {modalInfo && (
          <div style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.45)", display: "flex",
            alignItems: "center", justifyContent: "center", zIndex: 1000,
          }}
            onClick={() => setModalInfo(null)}
          >
            <div
              style={{
                background: "#fff", borderRadius: 16, padding: "32px 28px",
                maxWidth: 440, width: "90%", textAlign: "center",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ fontSize: 40, marginBottom: 12 }}>📞</div>
              <h3 style={{ fontFamily: K.serif, fontSize: "1.3rem", fontWeight: 800, color: K.ink, marginBottom: 10 }}>
                Pago manual
              </h3>
              <p style={{ fontSize: 14, color: K.muted, lineHeight: 1.7, marginBottom: 20 }}>
                {modalInfo.mensaje}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {modalInfo.whatsapp && (
                  <a
                    href={`https://wa.me/${modalInfo.whatsapp.replace(/\D/g, "")}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{
                      background: "#25D366", color: "#fff",
                      padding: "11px 20px", borderRadius: 8,
                      fontWeight: 700, fontSize: 13, textDecoration: "none",
                    }}
                  >
                    Contactar por WhatsApp
                  </a>
                )}
                {modalInfo.admin_email && (
                  <a
                    href={`mailto:${modalInfo.admin_email}`}
                    style={{
                      background: K.teal, color: "#fff",
                      padding: "11px 20px", borderRadius: 8,
                      fontWeight: 700, fontSize: 13, textDecoration: "none",
                    }}
                  >
                    Enviar email
                  </a>
                )}
                <button
                  onClick={() => setModalInfo(null)}
                  style={{
                    background: "none", border: `1px solid ${K.line}`,
                    padding: "9px 20px", borderRadius: 8,
                    fontWeight: 600, fontSize: 13, color: K.muted, cursor: "pointer",
                  }}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* FAQ */}
        <div style={{ marginTop: 56, maxWidth: 600, margin: "56px auto 0" }}>
          {FAQ_ITEMS.map((item) => (
            <div
              key={item.q}
              style={{
                borderBottom: `1px solid ${K.line}`,
                padding: "20px 0",
              }}
            >
              <p style={{ fontWeight: 700, fontSize: 14, color: K.ink, marginBottom: 6 }}>{item.q}</p>
              <p style={{ fontSize: 13, color: K.muted, lineHeight: 1.7, margin: 0 }}>{item.a}</p>
            </div>
          ))}
          <p style={{ textAlign: "center", marginTop: 24, fontSize: 13, color: K.muted }}>
            ¿Más preguntas?{" "}
            <a href="mailto:hola@medellin.social" style={{ color: K.teal }}>hola@medellin.social</a>
          </p>
        </div>
      </div>
    </ComunidadLayout>
  );
}

function PlanCard({
  id, nombre, descripcion, precio, moneda, features, lockedFeatures,
  planActual, popular, cta, ctaDisabled, onCTA, iniciando, requiere_verificacion,
}: {
  id: string;
  nombre: string;
  descripcion: string;
  precio: number;
  moneda: "COP" | "USD";
  features: string[];
  lockedFeatures?: string[];
  planActual: string;
  popular: boolean;
  cta: string;
  ctaDisabled: boolean;
  onCTA: () => void;
  iniciando: boolean;
  requiere_verificacion: boolean;
}) {
  const isActive = planActual === id;
  const precioFmt = moneda === "COP"
    ? `$${precio.toLocaleString("es-CO")}`
    : `$${precio}`;

  return (
    <div style={{
      background: "#fff",
      border: `2px solid ${popular ? K.teal : isActive ? K.tealDeep : K.line}`,
      borderRadius: 16,
      overflow: "hidden",
      position: "relative",
      boxShadow: popular ? `0 4px 24px ${K.teal}33` : "none",
      transition: "box-shadow 0.2s",
    }}>
      {popular && (
        <div style={{
          background: K.teal, color: "#fff",
          textAlign: "center", padding: "5px 0",
          fontSize: 11, fontWeight: 800, letterSpacing: "0.5px",
        }}>
          MÁS POPULAR
        </div>
      )}

      <div style={{ padding: "24px 24px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <h2 style={{ fontFamily: K.serif, fontSize: "1.3rem", fontWeight: 900, color: K.ink, margin: 0 }}>
            {nombre}
          </h2>
          {isActive && (
            <span style={{
              background: K.tealLight, color: K.tealDeep,
              borderRadius: 999, padding: "3px 10px", fontSize: 10, fontWeight: 700,
            }}>
              Tu plan
            </span>
          )}
        </div>

        <p style={{ color: K.muted, fontSize: 13, lineHeight: 1.5, marginBottom: 16 }}>{descripcion}</p>

        {/* Price */}
        <div style={{ marginBottom: 20 }}>
          {id === "free" ? (
            <>
              <span style={{ fontFamily: K.serif, fontSize: "2rem", fontWeight: 900, color: K.ink }}>$0</span>
              <span style={{ fontSize: 13, color: K.muted }}> — Gratis siempre</span>
            </>
          ) : (
            <>
              <span style={{ fontFamily: K.serif, fontSize: "2rem", fontWeight: 900, color: K.ink }}>{precioFmt}</span>
              <span style={{ fontSize: 13, color: K.muted }}> {moneda}/mes</span>
            </>
          )}
        </div>

        {/* CTA */}
        {id === "free" ? (
          ctaDisabled ? (
            <div style={{
              background: K.paper, border: `1px solid ${K.line}`,
              borderRadius: 8, padding: "10px 0",
              textAlign: "center", fontSize: 13, color: K.muted, fontWeight: 600,
            }}>
              Tu plan actual
            </div>
          ) : (
            <button
              onClick={onCTA}
              style={{
                width: "100%",
                background: K.teal, color: "#fff",
                border: "none", borderRadius: 8,
                padding: "11px 0", fontWeight: 700, fontSize: 13,
                cursor: "pointer", transition: "background 0.15s",
              }}
            >
              Comenzar gratis
            </button>
          )
        ) : (
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
              transition: "background 0.15s",
            }}
          >
            {iniciando ? "Procesando…" : cta}
          </button>
        )}

        {requiere_verificacion && !ctaDisabled && (
          <p style={{ fontSize: 11, color: K.muted, textAlign: "center", marginTop: 6 }}>
            <Lock style={{ display: "inline", width: 10, height: 10 }} /> Requiere verificación de agente (24-48h)
          </p>
        )}
      </div>

      {/* Features */}
      <div style={{ borderTop: `1px solid ${K.line}`, padding: "16px 24px 24px" }}>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {features.map((f) => (
            <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: K.ink }}>
              <Check style={{ flexShrink: 0, marginTop: 1 }} size={14} color={K.teal} />
              {f}
            </li>
          ))}
          {lockedFeatures?.map((f) => (
            <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: K.muted }}>
              <X style={{ flexShrink: 0, marginTop: 1 }} size={14} color={K.muted} />
              {f}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
