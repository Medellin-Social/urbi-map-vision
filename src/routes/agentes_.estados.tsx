// Guía pública de estados de agente — Parte uno de
// docs/Medellin-Social-Programa-Inmobiliario-ES.md. Cada estado tiene un ancla:
// las insignias (AgenteTipoBadges linked) abren directamente su sección.
import { seo } from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useT } from "@/lib/i18n";
import { ComunidadLayout } from "@/components/comunidad/ComunidadLayout";
import { K } from "@/design/tokens";
import { AGENTE_TIPO_STYLE } from "@/lib/agenteTipos";

export const Route = createFileRoute("/agentes_/estados")({
  head: () => seo({
    title: "Guía de estados de agentes · Medellín Social",
    description: "Qué significa que un agente sea no registrado, registrado, certificado o preferente de barrio o comuna en Medellín Social.",
    path: "/agentes/estados",
  }),
  component: EstadosAgentePage,
});

const card: React.CSSProperties = { background: "#fff", border: `1px solid ${K.line}`, borderRadius: 14, padding: 20, scrollMarginTop: 90 };
const h2: React.CSSProperties = { fontFamily: K.serif, fontSize: "1.35rem", fontWeight: 800, color: K.ink, margin: "0 0 14px" };
const p: React.CSSProperties = { fontSize: 14, color: K.ink, lineHeight: 1.7, margin: "0 0 10px" };
const btn = (primary: boolean): React.CSSProperties => ({
  display: "inline-block", padding: "12px 22px", borderRadius: 999, fontWeight: 800, fontSize: 14, textDecoration: "none",
  background: primary ? K.dorado : "transparent", color: primary ? K.ink : "#fff",
  border: primary ? "none" : "1.5px solid rgba(255,255,255,0.7)",
});

function Pill({ tipo, children }: { tipo: keyof typeof AGENTE_TIPO_STYLE | "none"; children: React.ReactNode }) {
  const s = tipo === "none" ? { bg: "#fff", fg: K.muted, border: K.line } : AGENTE_TIPO_STYLE[tipo];
  return (
    <span style={{ display: "inline-block", padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 800, textTransform: "uppercase",
      letterSpacing: ".04em", background: s.bg, color: s.fg, border: `1px solid ${s.border}`, marginBottom: 10 }}>
      {children}
    </span>
  );
}

function EstadosAgentePage() {
  const t = useT();

  const ESTADOS: { id: string; tipo: keyof typeof AGENTE_TIPO_STYLE | "none"; titulo: string; parrafos: string[] }[] = [
    {
      id: "no-registrado", tipo: "none", titulo: t("Agente no registrado", "Unregistered agent"),
      parrafos: [
        t("Este agente aún no se ha registrado en Medellín Social. Un inmueble asociado con él puede aparecer en nuestra base de datos con un enlace al anuncio original, pero el agente no tiene un perfil registrado en nuestra plataforma.",
          "This agent hasn't registered on Medellín Social yet. A property associated with them may appear in our database with a link to the original listing, but the agent has no registered profile on our platform."),
        t("Puedes visitar el anuncio original para contactar directamente al agente o usar nuestro directorio para encontrar agentes certificados y preferentes en la zona que te interesa.",
          "You can visit the original listing to contact the agent directly, or use our directory to find certified and preferred agents in the area you're interested in."),
      ],
    },
    {
      id: "registrado", tipo: "member", titulo: t("Agente registrado", "Registered agent"),
      parrafos: [
        t("Un Agente registrado se ha inscrito en Medellín Social y ha proporcionado información sobre sí mismo y la agencia a la que pertenece, si corresponde. Su perfil puede aparecer en los inmuebles que haya inscrito para figurar como agente representante.",
          "A Registered agent has signed up on Medellín Social and provided information about themselves and their agency, if any. Their profile may appear on the properties they've enrolled to be shown as the representing agent."),
        t("El registro te permite conocer mejor a la persona detrás de un anuncio. No significa que haya completado la certificación de Medellín Social.",
          "Registration helps you get to know the person behind a listing. It doesn't mean they've completed Medellín Social certification."),
      ],
    },
    {
      id: "certificado", tipo: "certified", titulo: t("Agente certificado", "Certified agent"),
      parrafos: [
        t("Un Agente certificado ha completado el registro, aprobado el examen de certificación en la plataforma EASE y superado la revisión de su trayectoria profesional por parte de nuestro equipo. La solicitud incluye su experiencia inmobiliaria y el número de transacciones que ha realizado.",
          "A Certified agent has completed registration, passed the certification exam on the EASE platform and cleared our team's review of their professional track record. The application includes their real estate experience and the number of transactions they've closed."),
        t("Este estado identifica a los agentes que han cumplido los requisitos adicionales del programa. Cuando un inmueble se anuncia como publicado por un agente certificado, la certificación corresponde al agente; no es una inspección ni una certificación del inmueble.",
          "This status identifies agents who have met the program's additional requirements. When a property is shown as listed by a certified agent, the certification belongs to the agent; it is not an inspection or certification of the property."),
      ],
    },
    {
      id: "preferente-barrio", tipo: "preferred", titulo: t("Agente preferente de barrio", "Neighborhood preferred agent"),
      parrafos: [
        t("Un Agente preferente de barrio participa en nuestro programa de agentes preferentes para un barrio específico. Consulta el nombre del barrio junto a la distinción para conocer la zona que cubre.",
          "A Neighborhood preferred agent takes part in our preferred agent program for a specific neighborhood. Check the neighborhood name next to the distinction to see the area it covers."),
        t("Esta distinción permite identificar agentes con posicionamiento preferente en el barrio que estás explorando. Es un programa de pago; consulta por separado la etiqueta de certificación para saber si el agente ha completado nuestro proceso de certificación.",
          "This distinction identifies agents with preferred placement in the neighborhood you're exploring. It's a paid program; check the certification label separately to know whether the agent has completed our certification process."),
      ],
    },
    {
      id: "preferente-comuna", tipo: "preferred", titulo: t("Agente preferente de comuna", "Commune preferred agent"),
      parrafos: [
        t("Un Agente preferente de comuna participa en nuestro programa para una comuna específica, un área más amplia que comprende varios barrios. La distinción identifica la comuna cubierta por su posicionamiento preferente.",
          "A Commune preferred agent takes part in our program for a specific commune, a wider area made up of several neighborhoods. The distinction identifies the commune covered by their preferred placement."),
        t("Esta opción te ayuda a explorar agentes vinculados a un área más amplia cuando buscas inmuebles en varios barrios. El posicionamiento preferente es un programa de pago; la certificación se identifica por separado.",
          "This helps you explore agents tied to a wider area when you're looking at properties across several neighborhoods. Preferred placement is a paid program; certification is identified separately."),
      ],
    },
  ];

  const PASOS = [
    [t("¿Vas a comprar una vivienda?", "Buying a home?"),
     t("Explora agentes en las zonas que estás considerando y consulta sus perfiles e inmuebles disponibles.", "Explore agents in the areas you're considering and review their profiles and available properties.")],
    [t("¿Buscas una vivienda en arriendo?", "Looking to rent?"),
     t("Encuentra un agente en el barrio o la comuna que prefieras y pregunta por inmuebles que se ajusten a tus necesidades.", "Find an agent in your preferred neighborhood or commune and ask about properties that fit your needs.")],
    [t("¿Quieres vender o arrendar tu inmueble?", "Want to sell or rent out your property?"),
     t("Compara los perfiles y estados de los agentes y contacta a uno para conversar sobre la representación de tu propiedad.", "Compare agents' profiles and statuses and contact one to discuss representing your property.")],
  ];

  const FAQ = [
    [t("¿No estar registrado significa que un agente no está calificado?", "Does being unregistered mean an agent isn't qualified?"),
     t("No. Significa que no se ha registrado en Medellín Social. No es una evaluación de su capacidad o experiencia.", "No. It means they haven't registered on Medellín Social. It's not an assessment of their ability or experience.")],
    [t("¿La distinción de preferente significa que el agente está certificado?", "Does the preferred distinction mean the agent is certified?"),
     t("Busca la etiqueta Agente certificado para confirmar su certificación. Las distinciones de preferente identifican el posicionamiento geográfico dentro del programa.", "Look for the Certified agent label to confirm certification. Preferred distinctions identify geographic placement within the program.")],
    [t("¿La certificación garantiza el inmueble o la transacción?", "Does certification guarantee the property or the transaction?"),
     t("No. La certificación de Medellín Social indica que el agente ha completado nuestro programa. No certifica el estado físico ni la titularidad del inmueble, ni el resultado de una compra, un arriendo o una venta.", "No. Medellín Social certification means the agent has completed our program. It doesn't certify the property's physical condition or title, nor the outcome of a purchase, rental or sale.")],
    [t("¿Cómo comparo agentes?", "How do I compare agents?"),
     t("Usa el directorio para filtrar por ubicación o estado, revisar perfiles y contactar agentes para conversar sobre tus necesidades.", "Use the directory to filter by location or status, review profiles and contact agents to discuss your needs.")],
  ];

  return (
    <ComunidadLayout>
      <div style={{ background: `linear-gradient(135deg, ${K.tealDeep} 0%, ${K.tealMid} 50%, ${K.teal} 100%)`, padding: "56px 20px 48px", textAlign: "center" }}>
        <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 12 }}>
          {t("Guía de estados de agentes", "Agent status guide")}
        </p>
        <h1 style={{ fontFamily: K.serif, fontSize: "clamp(2rem,5vw,3rem)", fontWeight: 900, color: "#fff", margin: "0 0 12px", lineHeight: 1.1 }}>
          {t("Conoce al agente detrás del anuncio", "Meet the agent behind the listing")}
        </h1>
        <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 15, maxWidth: 620, margin: "0 auto 14px", lineHeight: 1.65 }}>
          {t("¿Quieres comprar, arrendar o publicar una vivienda en Medellín? Medellín Social te ayuda a explorar inmuebles y contactar agentes. Las etiquetas de estado explican cómo participa cada agente en la plataforma y si ha completado nuestro proceso de certificación.",
            "Want to buy, rent or list a home in Medellín? Medellín Social helps you explore properties and contact agents. Status labels explain how each agent takes part in the platform and whether they've completed our certification process.")}
        </p>
        <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 15, maxWidth: 620, margin: "0 auto 26px" }}>
          {t("Busca un agente por ubicación o estado para conversar sobre tus necesidades inmobiliarias.", "Search for an agent by location or status to discuss your real estate needs.")}
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <Link to="/agentes" style={btn(true)}>{t("Buscar un agente", "Find an agent")}</Link>
          <Link to="/map" style={btn(false)}>{t("Explorar inmuebles", "Explore properties")}</Link>
        </div>
      </div>

      <div style={{ background: K.paper }}>
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 16px 72px", display: "grid", gap: 20 }}>
          <nav aria-label={t("Estados", "Statuses")} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {ESTADOS.map((e) => (
              <a key={e.id} href={`#${e.id}`} style={{ fontSize: 12, fontWeight: 700, color: K.tealDeep, background: "#fff", border: `1px solid ${K.line}`, borderRadius: 999, padding: "6px 12px", textDecoration: "none" }}>
                {e.titulo}
              </a>
            ))}
          </nav>

          {ESTADOS.map((e) => (
            <section key={e.id} id={e.id} style={card} data-testid={`estado-${e.id}`}>
              <Pill tipo={e.tipo}>{e.titulo}</Pill>
              <h2 style={h2}>{e.titulo}</h2>
              {e.parrafos.map((x) => <p key={x} style={p}>{x}</p>)}
              {e.id === "no-registrado" && (
                <Link to="/agentes" search={{ tipo: "certified,preferred" } as never} style={{ fontSize: 13, fontWeight: 700, color: K.teal }}>
                  {t("Buscar agentes certificados y preferentes →", "Find certified and preferred agents →")}
                </Link>
              )}
            </section>
          ))}

          <section style={{ marginTop: 16 }}>
            <h2 style={h2}>{t("Elige un agente para tu próximo paso", "Choose an agent for your next step")}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12 }}>
              {PASOS.map(([a, b]) => (
                <div key={a} style={card}>
                  <p style={{ fontWeight: 800, fontSize: 15, margin: "0 0 6px", color: K.ink }}>{a}</p>
                  <p style={{ fontSize: 13, color: K.muted, lineHeight: 1.6, margin: 0 }}>{b}</p>
                </div>
              ))}
            </div>
            <div style={{ textAlign: "center", marginTop: 18 }}>
              <Link to="/agentes" style={{ ...btn(true), background: K.teal, color: "#fff" }}>{t("Buscar un agente", "Find an agent")}</Link>
            </div>
          </section>

          <section style={{ marginTop: 16 }}>
            <h2 style={h2}>{t("Preguntas frecuentes", "Frequently asked questions")}</h2>
            {FAQ.map(([a, b]) => (
              <details key={a} style={{ borderBottom: `1px solid ${K.line}`, padding: "12px 0" }}>
                <summary style={{ fontWeight: 700, fontSize: 14, cursor: "pointer", color: K.ink }}>{a}</summary>
                <p style={{ fontSize: 13, color: K.muted, lineHeight: 1.7, margin: "8px 0 0" }}>{b}</p>
              </details>
            ))}
          </section>

          <section style={{ ...card, background: K.tealLight, border: "none", textAlign: "center" }}>
            <p style={{ fontWeight: 800, color: K.tealDeep, margin: "0 0 6px" }}>
              {t("¿Necesitas un realtor de la casa, un property manager o alguien que administre tu inmueble?", "Need a house realtor, a property manager or someone to manage your property?")}
            </p>
            <Link to="/mas-informacion" style={{ fontSize: 14, fontWeight: 700, color: K.teal }}>{t("Pide más información →", "Get more information →")}</Link>
            <p style={{ fontSize: 13, color: K.muted, margin: "14px 0 0" }}>
              {t("¿Eres agente?", "Are you an agent?")} <Link to="/agentes/programa" style={{ color: K.teal, fontWeight: 700 }}>{t("Conoce el programa de agentes", "Learn about the agent program")}</Link>
            </p>
          </section>
        </div>
      </div>
    </ComunidadLayout>
  );
}
