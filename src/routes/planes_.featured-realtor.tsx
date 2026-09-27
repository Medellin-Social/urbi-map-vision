import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth";
import { GHL, ghlRedirect } from "@/config/ghl";
import { ComunidadLayout } from "@/components/comunidad/ComunidadLayout";

const K = {
  paper:    "#FAF7F2", ink:      "#1A1208", muted:    "#6B5B45",
  teal:     "#1D9E75", tealDeep: "#085041", tealMid:  "#0D6E50",
  tealLight:"#E8F5F0", line:     "#E8E0D0", faint:    "#F3EFE7",
  serif:    "'Fraunces', Georgia, serif" as const,
};

const BASE = [
  "CRM integrado",
  "Calendar Automation",
  "2-Way Text & Email",
  "Social Messaging Integration",
  "Google Business Messaging & Call Tracking",
  "Reputation Management",
  "Web Chat Tool",
];

const EXTRA = [
  "Web Site administrado y personalizado",
  "AI Social Media Content & Scheduler",
  "AI Voice, Chat & Text Agents",
  "Email Marketing Tool",
  "Text Marketing Tool",
  "SMS & Email Templates",
  "Customizable Forms & Surveys",
  "Websites · Landing Pages · Funnels",
  "Customizable Automations & Workflows",
];

const FAQ = [
  {
    q: "¿Qué incluye el web site administrado?",
    a: "Un sitio profesional configurado específicamente para realtors: galería de propiedades, formulario de contacto, integración con el CRM y tu perfil verificado en Medellín Social.",
  },
  {
    q: "¿Qué hacen los AI Agents?",
    a: "Responden consultas por WhatsApp, texto y chat 24/7 de forma automática. Califican leads y los enrutan al CRM sin intervención manual.",
  },
  {
    q: "¿Cuánto dura el precio especial $299?",
    a: "Es precio de lanzamiento. Al suscribirte ahora lo mantienes mientras el plan esté activo.",
  },
  {
    q: "¿Puedo subir a Hot Spot después?",
    a: "Sí. Hot Spot agrega comunidades, afiliados, membresías y forecasting. El upgrade es inmediato.",
  },
];

export const Route = createFileRoute("/planes_/featured-realtor")({
  component: FeaturedRealtorPage,
});

function FeaturedRealtorPage() {
  const user = typeof window !== "undefined" ? auth.get() : null;
  const email: Record<string, string> = user?.email ? { email: user.email } : {};

  return (
    <ComunidadLayout>
      {/* Hero */}
      <div style={{
        background: `linear-gradient(135deg, ${K.tealDeep} 0%, ${K.tealMid} 50%, ${K.teal} 100%)`,
        padding: "56px 20px 48px", textAlign: "center",
      }}>
        <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 11, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 12 }}>
          Para Agentes Inmobiliarios
        </p>
        <h1 style={{ fontFamily: K.serif, fontSize: "clamp(2rem, 5vw, 3rem)", fontWeight: 900, color: "#fff", marginBottom: 12, lineHeight: 1.1 }}>
          Featured Realtor
        </h1>
        <p style={{ color: "rgba(255,255,255,0.78)", fontSize: 15, maxWidth: 460, margin: "0 auto 32px", lineHeight: 1.65 }}>
          Marketing digital, AI agents y web site administrado. Todo para dominar tu zona en Medellín Social.
        </p>
        <div style={{ display: "inline-block", background: "rgba(255,255,255,0.12)", borderRadius: 14, padding: "20px 36px" }}>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", textDecoration: "line-through", marginBottom: 2 }}>$599 precio regular</p>
          <p style={{ fontFamily: K.serif, fontSize: "3rem", fontWeight: 900, color: "#fff", lineHeight: 1, letterSpacing: "-0.04em" }}>
            $299<span style={{ fontSize: "1.1rem", fontWeight: 400 }}>/mo</span>
          </p>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>precio especial · + $199 setup fee</p>
        </div>
      </div>

      <div style={{ background: K.paper }}>
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "48px 20px 72px" }}>

          <button
            onClick={() => ghlRedirect(GHL.featured_realtor, email)}
            style={{
              display: "block", width: "100%", background: K.teal, color: "#fff",
              border: "none", borderRadius: 10, padding: "14px 0",
              fontWeight: 700, fontSize: 15, cursor: "pointer",
              fontFamily: "inherit", marginBottom: 40,
            }}
          >
            Solicitar Featured Realtor →
          </button>

          {/* Base features */}
          <h2 style={{ fontFamily: K.serif, fontSize: "1.2rem", fontWeight: 800, color: K.ink, marginBottom: 14 }}>
            Base — Comunicación & CRM
          </h2>
          <div style={{ background: "#fff", border: `1px solid ${K.line}`, borderRadius: 12, padding: "6px 0", marginBottom: 28 }}>
            {BASE.map((f, i) => (
              <div key={f} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 20px", borderBottom: i < BASE.length - 1 ? `1px solid ${K.line}` : "none" }}>
                <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: "50%", background: K.faint, color: K.muted, fontSize: 10, fontWeight: 900, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>✓</span>
                <span style={{ fontSize: 13.5, color: K.muted }}>{f}</span>
              </div>
            ))}
          </div>

          {/* Extra features */}
          <h2 style={{ fontFamily: K.serif, fontSize: "1.2rem", fontWeight: 800, color: K.ink, marginBottom: 14 }}>
            Featured Realtor — exclusivo de este plan
          </h2>
          <div style={{ background: "#fff", border: `2px solid ${K.teal}`, borderRadius: 12, padding: "6px 0", marginBottom: 48 }}>
            {EXTRA.map((f, i) => (
              <div key={f} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: i < EXTRA.length - 1 ? `1px solid ${K.line}` : "none" }}>
                <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: "50%", background: "#D1FAE5", color: K.teal, fontSize: 11, fontWeight: 900, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>✓</span>
                <span style={{ fontSize: 14, color: K.ink, fontWeight: 500 }}>{f}</span>
              </div>
            ))}
          </div>

          {/* FAQ */}
          <h2 style={{ fontFamily: K.serif, fontSize: "1.2rem", fontWeight: 800, color: K.ink, marginBottom: 18 }}>
            Preguntas frecuentes
          </h2>
          <FaqAccordion items={FAQ} K={K} />

        </div>
      </div>
    </ComunidadLayout>
  );
}

type KType = Record<string, string>;
function FaqAccordion({ items, K }: { items: { q: string; a: string }[]; K: KType }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div>
      {items.map((item, i) => (
        <div key={item.q} style={{ borderBottom: `1px solid ${K.line}` }}>
          <button
            onClick={() => setOpen(open === i ? null : i)}
            style={{
              width: "100%", textAlign: "left", background: "none", border: "none",
              padding: "16px 0", cursor: "pointer", display: "flex",
              justifyContent: "space-between", alignItems: "center", gap: 12,
              fontFamily: "inherit",
            }}
          >
            <span style={{ fontWeight: 700, fontSize: 14, color: K.ink }}>{item.q}</span>
            <span style={{
              flexShrink: 0, width: 20, height: 20, borderRadius: "50%",
              background: open === i ? K.teal : K.faint,
              color: open === i ? "#fff" : K.muted,
              fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.15s",
            }}>
              {open === i ? "−" : "+"}
            </span>
          </button>
          {open === i && (
            <p style={{ fontSize: 13, color: K.muted, lineHeight: 1.7, margin: "0 0 14px" }}>
              {item.a}
            </p>
          )}
        </div>
      ))}
      <p style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: K.muted }}>
        ¿Más preguntas?{" "}
        <a href="mailto:hola@medellin.social" style={{ color: K.teal }}>hola@medellin.social</a>
      </p>
    </div>
  );
}
