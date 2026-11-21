// Programa para agentes — Parte dos de docs/Medellin-Social-Programa-Inmobiliario-ES.md.
// Tarifas en USD (PRECIOS_USD). Preferente: precio por zona en /planes/featured-realtor.
import { seo } from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useT } from "@/lib/i18n";
import { ComunidadLayout } from "@/components/comunidad/ComunidadLayout";
import { K } from "@/design/tokens";
import { PRECIOS_USD as P, usd } from "@/lib/agentProgram";

export const Route = createFileRoute("/agentes_/programa")({
  head: () => seo({
    title: "Programa de agentes · Medellín Social",
    description: "Regístrate como agente, certifícate o explora el posicionamiento preferente por barrio y comuna en Medellín Social.",
    path: "/agentes/programa",
  }),
  component: ProgramaAgentesPage,
});

const card: React.CSSProperties = { background: "#fff", border: `1px solid ${K.line}`, borderRadius: 14, padding: 22, scrollMarginTop: 90 };
const h2: React.CSSProperties = { fontFamily: K.serif, fontSize: "1.35rem", fontWeight: 800, color: K.ink, margin: "0 0 14px" };
const txt: React.CSSProperties = { fontSize: 14, color: K.ink, lineHeight: 1.7, margin: "0 0 12px" };
const cta = (primary = true): React.CSSProperties => ({
  display: "inline-block", padding: "12px 22px", borderRadius: 999, fontWeight: 800, fontSize: 14, textDecoration: "none",
  background: primary ? K.teal : "#fff", color: primary ? "#fff" : K.teal, border: `1.5px solid ${K.teal}`,
});

function Tarifa({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: K.tealLight, borderLeft: `4px solid ${K.teal}`, borderRadius: 8, padding: "12px 14px", margin: "4px 0 14px", display: "grid", gap: 4 }}>
      {children}
    </div>
  );
}

function ProgramaAgentesPage() {
  const t = useT();
  const BENEFICIOS = [
    t("Preséntate con un perfil que incluya tu información profesional y la agencia a la que perteneces, si corresponde.", "Introduce yourself with a profile that includes your professional information and your agency, if any."),
    t("Vincula tu perfil con los inmuebles que inscribas para figurar como su agente representante.", "Link your profile to the properties you enroll so you appear as their representing agent."),
    t("Muestra tu estado de Agente certificado después de aprobar el examen y la evaluación de tu trayectoria profesional.", "Show your Certified agent status after passing the exam and the review of your professional track record."),
    t("Explora el posicionamiento preferente en un barrio específico o en una comuna.", "Explore preferred placement in a specific neighborhood or commune."),
  ];
  const PASOS = [
    [t("Crea tu cuenta.", "Create your account."), t("Proporciona tu nombre, datos de contacto, perfil profesional y datos de la agencia a la que perteneces, si corresponde.", "Provide your name, contact details, professional profile and your agency's details, if any.")],
    [t("Elige cómo quieres aparecer.", "Choose how you want to appear."), t("Comienza con el registro, solicita la certificación o pide información sobre una zona preferente.", "Start with registration, apply for certification or ask about a preferred area.")],
    [t("Añade o identifica tus anuncios.", "Add or identify your listings."), t("Envía los inmuebles que representas o identifica los anuncios existentes que deben vincularse a tu perfil.", "Submit the properties you represent or identify existing listings that should be linked to your profile.")],
    [t("Completa los requisitos.", "Complete the requirements."), t("Revisa los cargos aplicables y realiza el pago. Para la certificación, presenta tu trayectoria profesional y aprueba el examen; nuestro equipo también debe aprobar la evaluación de tu trayectoria.", "Review the applicable fees and pay. For certification, submit your track record and pass the exam; our team must also approve the review of your track record.")],
    [t("Activa tu presencia.", "Go live."), t("Una vez cumplidos los requisitos aplicables, tu perfil y los anuncios habilitados mostrarán el estado correspondiente. El posicionamiento preferente se activa después de confirmar la zona elegida y las condiciones del programa.", "Once the applicable requirements are met, your profile and enabled listings will show the corresponding status. Preferred placement is activated after the chosen area and program terms are confirmed.")],
  ];

  return (
    <ComunidadLayout>
      <div style={{ background: `linear-gradient(135deg, ${K.tealDeep} 0%, ${K.tealMid} 50%, ${K.teal} 100%)`, padding: "56px 20px 48px", textAlign: "center" }}>
        <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 12 }}>
          {t("Programa de agentes", "Agent program")}
        </p>
        <h1 style={{ fontFamily: K.serif, fontSize: "clamp(2rem,5vw,3rem)", fontWeight: 900, color: "#fff", margin: "0 0 12px", lineHeight: 1.1 }}>
          {t("Elige cómo aparecer en Medellín Social", "Choose how you appear on Medellín Social")}
        </h1>
        <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 15, maxWidth: 620, margin: "0 auto 26px", lineHeight: 1.65 }}>
          {t("Ayuda a compradores, arrendatarios y propietarios a conocer quién eres y qué inmuebles representas. Únete a Medellín Social como Agente registrado, solicita la certificación o explora el posicionamiento preferente en los barrios y comunas donde trabajas.",
            "Help buyers, renters and owners learn who you are and which properties you represent. Join Medellín Social as a Registered agent, apply for certification or explore preferred placement in the neighborhoods and communes where you work.")}
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <Link to="/agentes/registro" style={{ ...cta(), background: K.dorado, color: K.ink, border: "none" }}>{t("Registrarme como agente", "Register as an agent")}</Link>
          <Link to="/agentes/certificacion" style={{ ...cta(false), background: "transparent", color: "#fff", borderColor: "rgba(255,255,255,0.75)" }}>{t("Solicitar certificación", "Apply for certification")}</Link>
        </div>
        <p style={{ marginTop: 14 }}>
          <a href="#preferente" style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>{t("Explorar zonas preferentes", "Explore preferred areas")}</a>
        </p>
      </div>

      <div style={{ background: K.paper }}>
        <div style={{ maxWidth: 780, margin: "0 auto", padding: "40px 16px 72px", display: "grid", gap: 30 }}>
          <section>
            <h2 style={h2}>{t("Desarrolla tu presencia en la plataforma", "Grow your presence on the platform")}</h2>
            <div style={card}>
              {BENEFICIOS.map((b, i) => (
                <div key={i} style={{ display: "flex", gap: 12, padding: "9px 0", borderBottom: i < BENEFICIOS.length - 1 ? `1px solid ${K.line}` : "none" }}>
                  <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: "50%", background: K.tealLight, color: K.teal, fontSize: 11, fontWeight: 900, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>✓</span>
                  <span style={{ fontSize: 14, color: K.ink }}>{b}</span>
                </div>
              ))}
            </div>
          </section>

          <section style={card}>
            <h2 style={h2}>{t("Si aún no estás registrado", "If you're not registered yet")}</h2>
            <p style={txt}>
              {t("Tus inmuebles podrían aparecer ya en nuestra base de datos mediante enlaces a sus anuncios originales. Hasta que te registres, esos inmuebles no mostrarán un perfil de agente registrado a tu nombre. Los visitantes que consulten la información del agente verán un aviso y podrán visitar el anuncio original o explorar otros agentes.",
                "Your properties may already appear in our database through links to their original listings. Until you register, those properties won't show a registered agent profile in your name. Visitors who check the agent information will see a notice and can visit the original listing or explore other agents.")}
            </p>
            <Link to="/agentes/registro" style={cta()}>{t("Registrarme como agente", "Register as an agent")}</Link>
          </section>

          <section id="registrado" style={card}>
            <h2 style={h2}>{t("Agente registrado", "Registered agent")}</h2>
            <p style={txt}>{t("Crea tu perfil, proporciona tu información profesional y los datos de tu agencia e inscribe los inmuebles en los que quieras aparecer como Agente registrado.",
              "Create your profile, provide your professional and agency details and enroll the properties where you want to appear as a Registered agent.")}</p>
            <Tarifa>
              <strong style={{ color: K.ink }}>{t("Tarifa única de registro", "One-time registration fee")}: {usd(P.registro)}</strong>
              <strong style={{ color: K.ink }}>{t("Representación en anuncios", "Listing representation")}: {usd(P.anuncio)} {t("por anuncio", "per listing")}</strong>
            </Tarifa>
            <p style={txt}>{t("Esta opción permite que tu nombre aparezca en los inmuebles inscritos y ofrece a los visitantes información sobre ti y tu agencia. La certificación requiere un proceso de evaluación independiente.",
              "This option lets your name appear on enrolled properties and gives visitors information about you and your agency. Certification requires a separate evaluation process.")}</p>
            <Link to="/agentes/registro" style={cta()}>{t("Iniciar registro", "Start registration")}</Link>
          </section>

          <section id="certificado" style={card}>
            <h2 style={h2}>{t("Agente certificado", "Certified agent")}</h2>
            <p style={txt}>{t("Ofrece a los visitantes una razón adicional para considerar tu perfil al completar la certificación de Medellín Social. Presenta tu trayectoria profesional, incluidos tus años de experiencia y transacciones realizadas, aprueba el examen en la plataforma EASE y completa la evaluación de tu trayectoria por parte de nuestro equipo.",
              "Give visitors another reason to consider your profile by completing Medellín Social certification. Submit your professional track record, including years of experience and closed transactions, pass the exam on the EASE platform and complete our team's review of your track record.")}</p>
            <Tarifa>
              <strong style={{ color: K.ink }}>{t("Tarifa única de certificación", "One-time certification fee")}: {usd(P.cert_cuota)}</strong>
              <strong style={{ color: K.ink }}>{t("Plan mensual", "Monthly plan")}: {usd(P.cert_mensual)}, {t(`con tus primeros ${P.cupos_incluidos} anuncios de agente certificado incluidos`, `with your first ${P.cupos_incluidos} certified-agent listings included`)}</strong>
              <strong style={{ color: K.ink }}>{t("Anuncios adicionales de agente certificado", "Additional certified-agent listings")}: {usd(P.anuncio)} {t("cada uno", "each")}</strong>
            </Tarifa>
            <p style={txt}>{t("El estado de Agente certificado se otorga después de cumplir los requisitos del examen y la evaluación de trayectoria. El pago por sí solo no concede la certificación.",
              "Certified agent status is granted after meeting the exam and track-record review requirements. Payment alone does not grant certification.")}</p>
            <p style={{ ...txt, fontSize: 12, color: K.muted }}>{t("La tarifa de certificación se suma a la de registro.", "The certification fee is in addition to the registration fee.")}</p>
            <Link to="/agentes/certificacion" style={cta()}>{t("Solicitar certificación", "Apply for certification")}</Link>
          </section>

          <section>
            <h2 style={h2}>{t("Planes y pasos de inscripción", "Plans and enrollment steps")}</h2>
            <div style={{ display: "grid", gap: 14 }}>
              <div id="ilimitado" style={card}>
                <p style={{ fontFamily: K.serif, fontWeight: 800, fontSize: 18, margin: "0 0 8px", color: K.ink }}>{t(`Más de ${P.umbral_ilimitado} anuncios`, `More than ${P.umbral_ilimitado} listings`)}</p>
                <p style={txt}>{t(`Si tienes más de ${P.umbral_ilimitado} anuncios, puedes elegir la opción de anuncios ilimitados para Agentes certificados por ${usd(P.cert_ilimitado)} al mes. Así cuentas con una tarifa mensual fija mientras crece tu cartera de inmuebles.`,
                  `If you have more than ${P.umbral_ilimitado} listings, you can choose unlimited listings for Certified agents for ${usd(P.cert_ilimitado)} per month. That gives you a fixed monthly fee as your portfolio grows.`)}</p>
                <Link to="/agentes/certificacion" hash="planes" style={cta(false)}>{t("Explorar anuncios ilimitados", "Explore unlimited listings")}</Link>
              </div>
              <div id="preferente" style={card}>
                <p style={{ fontFamily: K.serif, fontWeight: 800, fontSize: 18, margin: "0 0 8px", color: K.ink }}>{t("Agente preferente de barrio", "Neighborhood preferred agent")}</p>
                <p style={txt}>{t("Concentra tu presencia en un barrio específico. Esta opción te ofrece una distinción geográfica y posicionamiento preferente vinculados al barrio elegido, para que los visitantes identifiquen la zona que cubre tu participación.",
                  "Focus your presence on a specific neighborhood. This gives you a geographic distinction and preferred placement tied to the chosen neighborhood, so visitors can see the area your participation covers.")}</p>
                <p style={txt}>{t("El precio varía según el barrio elegido y su categoría tarifaria. Explora la zona de tu interés para solicitar la tarifa aplicable y los detalles del programa.",
                  "Pricing varies by the chosen neighborhood and its rate category. Explore the area you're interested in to see the applicable rate and program details.")}</p>
                <Link to="/planes/featured-realtor" search={{ zona_nivel: "barrio" }} style={cta(false)}>{t("Explorar la opción preferente de barrio", "Explore neighborhood preferred")}</Link>
              </div>
              <div style={card}>
                <p style={{ fontFamily: K.serif, fontWeight: 800, fontSize: 18, margin: "0 0 8px", color: K.ink }}>{t("Agente preferente de comuna", "Commune preferred agent")}</p>
                <p style={txt}>{t("Amplía tu presencia geográfica en una comuna elegida. Esta distinción identifica tu participación en el programa de agentes preferentes de esa zona, que comprende varios barrios.",
                  "Broaden your geographic presence in a chosen commune. This distinction identifies your participation in that area's preferred agent program, which spans several neighborhoods.")}</p>
                <p style={txt}>{t("El precio varía según la comuna elegida y su categoría tarifaria. Explora la zona de tu interés para solicitar la tarifa aplicable y los detalles del programa.",
                  "Pricing varies by the chosen commune and its rate category. Explore the area you're interested in to see the applicable rate and program details.")}</p>
                <Link to="/planes/featured-realtor" search={{ zona_nivel: "comuna" }} style={cta(false)}>{t("Explorar la opción preferente de comuna", "Explore commune preferred")}</Link>
              </div>
            </div>
          </section>

          <section>
            <h2 style={h2}>{t("Cómo inscribirte", "How to enroll")}</h2>
            <ol style={{ ...card, margin: 0, paddingLeft: 40, display: "grid", gap: 10 }}>
              {PASOS.map(([a, b]) => (
                <li key={a} style={{ fontSize: 14, color: K.ink, lineHeight: 1.6 }}><strong>{a}</strong> {b}</li>
              ))}
            </ol>
          </section>

          <section>
            <h2 style={h2}>{t("Antes de registrarte", "Before you register")}</h2>
            <details style={{ borderBottom: `1px solid ${K.line}`, padding: "12px 0" }} open>
              <summary style={{ fontWeight: 700, fontSize: 14, cursor: "pointer", color: K.ink }}>{t("¿Debo pertenecer a una agencia?", "Do I need to belong to an agency?")}</summary>
              <p style={{ fontSize: 13, color: K.muted, lineHeight: 1.7, margin: "8px 0 0" }}>
                {t("Proporciona los datos de tu agencia si perteneces a una. Los agentes independientes pueden presentar su propia información profesional.", "Provide your agency's details if you belong to one. Independent agents can submit their own professional information.")}
              </p>
            </details>
          </section>

          <section style={{ ...card, textAlign: "center", background: K.tealLight, border: "none" }}>
            <p style={{ fontFamily: K.serif, fontWeight: 800, fontSize: 20, color: K.tealDeep, margin: "0 0 16px" }}>
              {t("Muestra tu perfil junto a los inmuebles que representas.", "Show your profile next to the properties you represent.")}
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <Link to="/agentes/registro" style={cta()}>{t("Registrarme como agente", "Register as an agent")}</Link>
              <Link to="/planes/featured-realtor" style={cta(false)}>{t("Consultar sobre posicionamiento preferente", "Ask about preferred placement")}</Link>
            </div>
            <p style={{ fontSize: 12, color: K.muted, margin: "14px 0 0" }}>
              <Link to="/agentes/estados" style={{ color: K.teal }}>{t("Ver la guía de estados de agentes", "See the agent status guide")}</Link>
            </p>
          </section>
        </div>
      </div>
    </ComunidadLayout>
  );
}
