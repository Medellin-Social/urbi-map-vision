import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { ComunidadLayout } from "@/components/comunidad/ComunidadLayout";
import { API_ENDPOINTS } from "@/config/api";

export const Route = createFileRoute("/agentes/$slug")({
  component: AgentePerfilRoot,
});

function AgentePerfilRoot() {
  return (
    <ComunidadLayout>
      <AgentePerfilPage />
    </ComunidadLayout>
  );
}

// ── Design tokens ──────────────────────────────────────────────────────────────
const K = {
  paper:     "#FAF7F2",
  surface:   "#F5F0E8",
  line:      "#E9E4D8",
  ink:       "#1A1208",
  muted:     "#6B5B45",
  teal:      "#1D9E75",
  tealDeep:  "#085041",
  tealLight: "#E1F5EE",
  coral:     "#D85A30",
  white:     "#FFFFFF",
  serif:     "'Fraunces', Georgia, serif" as const,
};

// ── Types ──────────────────────────────────────────────────────────────────────
interface AgenteDetalle {
  id: number;
  nombre_completo: string;
  slug: string;
  foto_perfil: string | null;
  especialidad: string[] | null;
  tipo_inmueble: string[] | null;
  anos_experiencia: number | null;
  transacciones_cerradas: number | null;
  inmobiliaria_nombre: string | null;
  es_independiente: boolean;
  precio_rango_min: number | null;
  precio_rango_max: number | null;
  telefono: string | null;
  whatsapp: string | null;
  linkedin: string | null;
  instagram: string | null;
  sitio_web: string | null;
  email: string | null;
  zonas_nombres: string[];
  listings_count: number;
  bio?: string | null;
}

interface ListingCard {
  id: number;
  tipo_operacion: string;
  tipo_inmueble: string;
  precio_cop: number;
  precio_usd: number | null;
  area_m2: number | null;
  habitaciones: number | null;
  banos: number | null;
  fotos: string[];
  descripcion: string | null;
  direccion: string | null;
  barrio_nombre: string | null;
  municipio: string | null;
}

// ── Fallback agents ────────────────────────────────────────────────────────────
const FALLBACK_MAP: Record<string, AgenteDetalle> = {
  "ken-munro": {
    id: -1,
    nombre_completo: "Ken Munro",
    slug: "ken-munro",
    foto_perfil: null,
    especialidad: ["Venta", "Arriendo"],
    tipo_inmueble: ["Apartamento", "Casa"],
    anos_experiencia: 20,
    transacciones_cerradas: null,
    inmobiliaria_nombre: "Medellín Social",
    es_independiente: false,
    precio_rango_min: 200_000_000,
    precio_rango_max: 2_000_000_000,
    telefono: "+57 300 123 4567",
    whatsapp: "573001234567",
    linkedin: null,
    instagram: null,
    sitio_web: "https://medellinsocial.com",
    email: null,
    zonas_nombres: ["El Poblado", "Laureles", "Envigado", "La Estrella"],
    listings_count: 0,
    bio: "Fundador de Medellín Social con más de 20 años de experiencia en el mercado inmobiliario del Valle de Aburrá. Especialista en ayudar a inversores extranjeros a encontrar su hogar ideal en Medellín.",
  },
  "kathy-munro": {
    id: -2,
    nombre_completo: "Kathy Munro",
    slug: "kathy-munro",
    foto_perfil: null,
    especialidad: ["Venta", "Arriendo"],
    tipo_inmueble: ["Apartamento", "Casa", "Lote"],
    anos_experiencia: 15,
    transacciones_cerradas: null,
    inmobiliaria_nombre: "Medellín Social",
    es_independiente: false,
    precio_rango_min: 150_000_000,
    precio_rango_max: 1_500_000_000,
    telefono: "+57 300 123 4568",
    whatsapp: "573001234568",
    linkedin: null,
    instagram: null,
    sitio_web: "https://medellinsocial.com",
    email: null,
    zonas_nombres: ["Sabaneta", "La Estrella", "Itagüí", "Envigado"],
    listings_count: 0,
    bio: "Especialista en propiedades del sur del Valle de Aburrá con enfoque en inversión extranjera y relocalización. Bilingüe español-inglés.",
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

function formatCOP(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${Math.round(n / 1_000_000)}M`;
  return `$${n.toLocaleString("es-CO")}`;
}

// ── Page ───────────────────────────────────────────────────────────────────────
function AgentePerfilPage() {
  const { slug } = Route.useParams();
  const [agente, setAgente] = useState<AgenteDetalle | null>(null);
  const [listings, setListings] = useState<ListingCard[]>([]);
  const [listingsTotal, setListingsTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [contactForm, setContactForm] = useState({ nombre: "", email: "", mensaje: "" });
  const [contactState, setContactState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  useEffect(() => {
    // Try fallback first if slug matches known hardcoded agents
    if (FALLBACK_MAP[slug]) {
      setAgente(FALLBACK_MAP[slug]);
      setLoading(false);
      return;
    }

    fetch(API_ENDPOINTS.agentePorSlug(slug))
      .then((r) => {
        if (r.status === 404) { setNotFound(true); return null; }
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data: AgenteDetalle | null) => {
        if (!data) return;
        setAgente(data);
        // Fetch listings
        if (data.id > 0) {
          return fetch(API_ENDPOINTS.listingsPropiosAgente(data.id))
            .then((r) => r.ok ? r.json() : { items: [], total: 0 })
            .then((d) => { setListings(d.items ?? []); setListingsTotal(d.total ?? 0); });
        }
      })
      .catch(() => {
        // Try fallback on error
        const fallback = Object.values(FALLBACK_MAP).find((a) => a.slug === slug);
        if (fallback) setAgente(fallback);
        else setNotFound(true);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  async function sendContacto(e: React.FormEvent) {
    e.preventDefault();
    if (!agente || agente.id < 0) return;
    setContactState("sending");
    try {
      const r = await fetch(API_ENDPOINTS.agenteContacto(agente.id), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contactForm),
      });
      if (!r.ok) throw new Error();
      setContactState("sent");
      setContactForm({ nombre: "", email: "", mensaje: "" });
    } catch {
      setContactState("error");
    }
  }

  if (loading) return <PageLoader />;
  if (notFound || !agente) return <NotFoundState />;

  const nombre = agente.nombre_completo;
  const empresa = agente.inmobiliaria_nombre ?? "Agente independiente";
  const especialidades = (agente.especialidad ?? []).join(" · ");
  const waLink = agente.whatsapp
    ? `https://wa.me/${agente.whatsapp.replace(/\D/g, "")}?text=Hola%20${encodeURIComponent(nombre)}%2C%20vi%20tu%20perfil%20en%20Medell%C3%ADn%20Social`
    : null;

  return (
    <div style={{ background: K.paper, minHeight: "100vh" }}>
      {/* Breadcrumb */}
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "20px 24px 0",
        }}
      >
        <Link
          to="/agentes"
          style={{
            color: K.teal,
            textDecoration: "none",
            fontSize: 14,
            fontWeight: 500,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          ← Volver a agentes
        </Link>
      </div>

      {/* Profile section */}
      <section
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "32px 24px 48px",
          display: "grid",
          gridTemplateColumns: "clamp(240px, 32%, 340px) 1fr",
          gap: 48,
        }}
      >
        {/* Left column */}
        <div>
          {/* Photo */}
          <div
            style={{
              borderRadius: 8,
              overflow: "hidden",
              marginBottom: 20,
              aspectRatio: "3/4",
              background: K.surface,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {agente.foto_perfil ? (
              <img
                src={agente.foto_perfil}
                alt={nombre}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <div
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: "50%",
                  background: K.tealLight,
                  border: `3px solid ${K.teal}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: K.serif,
                  fontSize: 42,
                  fontWeight: 600,
                  color: K.tealDeep,
                }}
              >
                {getInitials(nombre)}
              </div>
            )}
          </div>

          {/* WhatsApp primary CTA */}
          {waLink && (
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                background: K.teal,
                color: K.white,
                padding: "12px 0",
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 15,
                textDecoration: "none",
                marginBottom: 12,
              }}
            >
              <WhatsAppIcon /> Contactar por WhatsApp
            </a>
          )}

          {/* Social links */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {agente.linkedin && (
              <SocialLink href={agente.linkedin} icon="in" label="LinkedIn" />
            )}
            {agente.instagram && (
              <SocialLink href={agente.instagram} icon="ig" label="Instagram" />
            )}
            {agente.sitio_web && (
              <SocialLink href={agente.sitio_web} icon="web" label="Sitio web" />
            )}
          </div>
        </div>

        {/* Right column */}
        <div>
          <h1
            style={{
              fontFamily: K.serif,
              fontSize: "clamp(28px, 4vw, 42px)",
              fontWeight: 600,
              color: K.ink,
              margin: "0 0 6px",
              lineHeight: 1.1,
            }}
          >
            {nombre}
          </h1>
          {agente.especialidad && agente.especialidad.length > 0 && (
            <p style={{ color: K.muted, fontSize: 16, margin: "0 0 4px" }}>
              {especialidades}
            </p>
          )}
          <p style={{ color: K.muted, fontSize: 15, margin: "0 0 24px" }}>
            {empresa}
          </p>

          <hr style={{ border: "none", borderTop: `1px solid ${K.line}`, margin: "0 0 24px" }} />

          {/* Bio */}
          {agente.bio && (
            <>
              <p style={{ fontSize: 14, fontWeight: 700, color: K.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                Sobre mí
              </p>
              <p style={{ color: K.ink, fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>
                {agente.bio}
              </p>
            </>
          )}

          {/* Stats grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 1,
              border: `1px solid ${K.line}`,
              borderRadius: 10,
              overflow: "hidden",
              marginBottom: 16,
            }}
          >
            <StatCell label="Listings activos" value={agente.listings_count} />
            <StatCell label="Años experiencia" value={agente.anos_experiencia ?? "–"} />
            <StatCell label="Especialidad" value={especialidades || "–"} />
            <StatCell
              label="Idiomas"
              value="ES · EN"
            />
            {agente.zonas_nombres.length > 0 && (
              <div
                style={{
                  gridColumn: "1 / -1",
                  background: K.white,
                  padding: "14px 16px",
                }}
              >
                <span style={{ fontSize: 12, color: K.muted, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
                  Zonas
                </span>
                <p style={{ margin: "4px 0 0", fontSize: 14, color: K.ink }}>
                  {agente.zonas_nombres.join(" · ")}
                </p>
              </div>
            )}
          </div>

          {/* Price range */}
          {agente.precio_rango_min && agente.precio_rango_max && (
            <div
              style={{
                background: K.tealLight,
                border: `1px solid ${K.teal}`,
                borderRadius: 8,
                padding: "12px 16px",
              }}
            >
              <span style={{ fontSize: 12, color: K.tealDeep, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Rango de precio
              </span>
              <p style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 700, color: K.tealDeep }}>
                {formatCOP(agente.precio_rango_min)} – {formatCOP(agente.precio_rango_max)} COP
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Listings section */}
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px 64px" }}>
        <h2
          style={{
            fontFamily: K.serif,
            fontSize: "clamp(22px, 3.5vw, 32px)",
            fontWeight: 600,
            color: K.ink,
            marginBottom: 6,
          }}
        >
          Propiedades de {nombre.split(" ")[0]}
        </h2>
        <p style={{ color: K.muted, fontSize: 14, marginBottom: 32 }}>
          {listingsTotal > 0
            ? `${listingsTotal} propiedad${listingsTotal !== 1 ? "es" : ""} activa${listingsTotal !== 1 ? "s" : ""}`
            : "Propiedades en su zona de trabajo"}
        </p>

        {listings.length > 0 ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 20,
            }}
          >
            {listings.map((l) => (
              <ListingMiniCard key={l.id} listing={l} />
            ))}
          </div>
        ) : (
          <EmptyListings agente={agente} />
        )}
      </section>

      {/* Contact section */}
      <section
        style={{
          background: K.surface,
          padding: "64px 24px",
        }}
      >
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <h2
            style={{
              fontFamily: K.serif,
              fontSize: "clamp(22px, 3.5vw, 32px)",
              fontWeight: 600,
              color: K.ink,
              textAlign: "center",
              marginBottom: 8,
            }}
          >
            ¿Listo para trabajar con {nombre.split(" ")[0]}?
          </h2>
          <p style={{ textAlign: "center", color: K.muted, fontSize: 15, marginBottom: 36 }}>
            Elige cómo prefieres conectar
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            {/* WhatsApp */}
            <div
              style={{
                background: K.white,
                border: `1px solid ${K.line}`,
                borderRadius: 12,
                padding: "24px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 12 }}>💬</div>
              <p style={{ fontWeight: 600, color: K.ink, marginBottom: 4 }}>WhatsApp</p>
              <p style={{ fontSize: 13, color: K.muted, marginBottom: 16 }}>Respuesta en minutos</p>
              {waLink ? (
                <a
                  href={waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "block",
                    background: K.teal,
                    color: K.white,
                    padding: "10px 0",
                    borderRadius: 8,
                    fontWeight: 600,
                    fontSize: 14,
                    textDecoration: "none",
                  }}
                >
                  Abrir WhatsApp →
                </a>
              ) : (
                <p style={{ fontSize: 12, color: K.muted }}>No disponible</p>
              )}
            </div>

            {/* Message form */}
            <div
              style={{
                background: K.white,
                border: `1px solid ${K.line}`,
                borderRadius: 12,
                padding: "24px",
              }}
            >
              <p style={{ fontWeight: 600, color: K.ink, marginBottom: 16 }}>Enviar mensaje</p>
              {contactState === "sent" ? (
                <div style={{ textAlign: "center", padding: "16px 0" }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                  <p style={{ color: K.teal, fontWeight: 600, fontSize: 14 }}>
                    ¡Mensaje enviado! {nombre.split(" ")[0]} te responderá pronto.
                  </p>
                </div>
              ) : (
                <form onSubmit={sendContacto} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <ContactInput
                    placeholder="Tu nombre"
                    value={contactForm.nombre}
                    onChange={(v) => setContactForm((p) => ({ ...p, nombre: v }))}
                  />
                  <ContactInput
                    placeholder="Tu email"
                    type="email"
                    value={contactForm.email}
                    onChange={(v) => setContactForm((p) => ({ ...p, email: v }))}
                  />
                  <textarea
                    required
                    placeholder="Tu mensaje"
                    value={contactForm.mensaje}
                    onChange={(e) => setContactForm((p) => ({ ...p, mensaje: e.target.value }))}
                    rows={3}
                    style={{
                      padding: "10px 12px",
                      border: `1px solid ${K.line}`,
                      borderRadius: 6,
                      fontSize: 13,
                      fontFamily: "Inter, sans-serif",
                      resize: "vertical",
                      outline: "none",
                      color: K.ink,
                      background: K.white,
                    }}
                  />
                  {contactState === "error" && (
                    <p style={{ fontSize: 12, color: K.coral }}>Error al enviar. Intenta de nuevo.</p>
                  )}
                  <button
                    type="submit"
                    disabled={contactState === "sending" || agente.id < 0}
                    style={{
                      background: K.teal,
                      color: K.white,
                      border: "none",
                      borderRadius: 8,
                      padding: "10px 0",
                      fontWeight: 600,
                      fontSize: 14,
                      cursor: agente.id < 0 ? "not-allowed" : "pointer",
                      opacity: agente.id < 0 ? 0.6 : 1,
                    }}
                  >
                    {contactState === "sending" ? "Enviando..." : "Enviar mensaje →"}
                  </button>
                  {agente.id < 0 && (
                    <p style={{ fontSize: 11, color: K.muted, textAlign: "center" }}>
                      Usa WhatsApp para contactar a este agente
                    </p>
                  )}
                </form>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function StatCell({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ background: K.white, padding: "14px 16px" }}>
      <span style={{ fontSize: 12, color: K.muted, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, display: "block" }}>
        {label}
      </span>
      <span style={{ fontSize: 18, fontWeight: 700, color: K.ink }}>
        {value}
      </span>
    </div>
  );
}

function SocialLink({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <a
      href={href.startsWith("http") ? href : `https://${href}`}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        border: `1px solid ${K.line}`,
        borderRadius: 8,
        color: K.ink,
        textDecoration: "none",
        fontSize: 13,
        fontWeight: 500,
        background: K.white,
      }}
    >
      <span style={{ fontSize: 16 }}>
        {icon === "in" ? "🔗" : icon === "ig" ? "📸" : "🌐"}
      </span>
      {label}
    </a>
  );
}

function ListingMiniCard({ listing }: { listing: ListingCard }) {
  const foto = listing.fotos?.[0];
  const tipo = listing.tipo_operacion === "venta" ? "Venta" : "Arriendo";
  const zona = listing.barrio_nombre ?? listing.municipio ?? "Medellín";

  return (
    <div
      style={{
        background: K.white,
        border: `1px solid ${K.line}`,
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      <div style={{ height: 160, background: K.surface, position: "relative" }}>
        {foto ? (
          <img src={foto} alt={listing.tipo_inmueble} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>
            🏠
          </div>
        )}
        <span
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            background: tipo === "Venta" ? K.coral : K.teal,
            color: K.white,
            fontSize: 11,
            fontWeight: 700,
            padding: "3px 8px",
            borderRadius: 4,
          }}
        >
          {tipo}
        </span>
      </div>
      <div style={{ padding: "12px 14px 14px" }}>
        <p style={{ fontSize: 16, fontWeight: 700, color: K.ink, margin: "0 0 4px" }}>
          {listing.precio_cop ? formatCOP(listing.precio_cop) : "Consultar"}
        </p>
        <p style={{ fontSize: 12, color: K.muted, margin: "0 0 8px" }}>
          📍 {zona}
        </p>
        <div style={{ display: "flex", gap: 12, fontSize: 12, color: K.muted }}>
          {listing.area_m2 && <span>{listing.area_m2} m²</span>}
          {listing.habitaciones && <span>🛏 {listing.habitaciones}</span>}
          {listing.banos && <span>🚿 {listing.banos}</span>}
        </div>
      </div>
    </div>
  );
}

function EmptyListings({ agente }: { agente: AgenteDetalle }) {
  const zona = agente.zonas_nombres[0];
  return (
    <div
      style={{
        background: K.surface,
        border: `1px solid ${K.line}`,
        borderRadius: 12,
        padding: "40px 32px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 40, marginBottom: 12 }}>🏡</div>
      <p style={{ color: K.ink, fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
        Propiedades en su zona de trabajo
      </p>
      {zona && (
        <p style={{ color: K.muted, fontSize: 13, marginBottom: 20 }}>
          Este agente opera en {zona}{agente.zonas_nombres.length > 1 ? ` y ${agente.zonas_nombres.length - 1} zonas más` : ""}
        </p>
      )}
      <Link
        to="/map"
        style={{
          display: "inline-block",
          background: K.teal,
          color: K.white,
          padding: "10px 24px",
          borderRadius: 8,
          fontWeight: 600,
          fontSize: 14,
          textDecoration: "none",
        }}
      >
        Ver propiedades en el mapa →
      </Link>
    </div>
  );
}

function ContactInput({
  placeholder,
  value,
  onChange,
  type = "text",
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <input
      required
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        padding: "10px 12px",
        border: `1px solid ${K.line}`,
        borderRadius: 6,
        fontSize: 13,
        outline: "none",
        color: K.ink,
        background: K.white,
        fontFamily: "Inter, sans-serif",
      }}
    />
  );
}

function WhatsAppIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function PageLoader() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "50vh" }}>
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            width: 40,
            height: 40,
            border: `3px solid ${K.line}`,
            borderTop: `3px solid ${K.teal}`,
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
            margin: "0 auto 12px",
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ color: K.muted, fontSize: 14 }}>Cargando perfil...</p>
      </div>
    </div>
  );
}

function NotFoundState() {
  return (
    <div style={{ textAlign: "center", padding: "80px 24px" }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
      <h2 style={{ fontFamily: K.serif, fontSize: 28, color: K.ink, marginBottom: 8 }}>
        Agente no encontrado
      </h2>
      <p style={{ color: K.muted, fontSize: 15, marginBottom: 32 }}>
        Este agente no existe o aún no ha sido verificado.
      </p>
      <Link
        to="/agentes"
        style={{
          display: "inline-block",
          background: K.teal,
          color: K.white,
          padding: "12px 28px",
          borderRadius: 8,
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        Ver todos los agentes
      </Link>
    </div>
  );
}

