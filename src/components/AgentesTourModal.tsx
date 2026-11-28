import { SpotlightTour, type TourStep } from "./SpotlightTour";

// Recorrido guiado del directorio público de agentes (/agentes). Pensado para el
// VISITANTE (comprador / vendedor / arrendatario): explica qué significa cada
// etiqueta de confianza (Verificado, Registrado, Certificado, Preferente de
// comuna/barrio, reseñas) para que sepa con quién habla y se anime a contactar.
// Los selectores apuntan a anclas data-tour en agentes.tsx y AgentCard.tsx; como
// querySelector devuelve la primera coincidencia, cae en la primera tarjeta que
// tenga esa etiqueta (si ninguna la tiene, el paso cae a tooltip centrado).
const STEPS: TourStep[] = [
  {
    title: { es: "Encuentra un agente de confianza", en: "Find an agent you can trust" },
    body: {
      es: "Te explico en un minuto qué significa cada etiqueta de esta página, para que sepas con quién estás hablando antes de escribirle. Contactar siempre es gratis y sin compromiso.",
      en: "In a minute I'll explain what each label on this page means, so you know who you're talking to before reaching out. Contacting is always free and with no commitment.",
    },
    icon: "🤝",
  },
  {
    title: { es: "Empieza por lo que necesitas", en: "Start with what you need" },
    body: {
      es: "Elige si vas a Comprar, Vender o Arrendar, y busca por zona, nombre del agente o inmobiliaria. Los resultados se ajustan a lo que pongas.",
      en: "Pick whether you're Buying, Selling or Renting, and search by area, agent name or agency. Results adjust to what you type.",
    },
    selector: '[data-tour="agentes-buscar"]',
  },
  {
    title: { es: "Afina con los filtros", en: "Narrow it down with filters" },
    body: {
      es: "Filtra por tipo de agente, idioma (útil si eres extranjero), especialidad (inversión, Airbnb, extranjeros…) y calificación mínima. Así llegas al agente correcto más rápido.",
      en: "Filter by agent type, language (handy if you're a foreigner), specialty (investment, Airbnb, foreigners…) and minimum rating. You reach the right agent faster.",
    },
    selector: '[data-tour="agentes-filtros"]',
  },
  {
    title: { es: "La tarjeta de cada agente", en: "Each agent's card" },
    body: {
      es: "Cada agente trae foto, zonas que cubre, reseñas, años de experiencia e inmuebles activos. Toda la información para decidir sin tener que escribir todavía.",
      en: "Each agent shows a photo, areas covered, reviews, years of experience and active listings. Everything to decide before writing a single message.",
    },
    selector: '[data-tour="agente-card"]',
  },
  {
    title: { es: "«Verificado»", en: "«Verified»" },
    body: {
      es: "Este sello significa que confirmamos la identidad del agente y sus datos de contacto. Hablas con una persona real y comprobada, no con un anuncio anónimo.",
      en: "This badge means we confirmed the agent's identity and contact details. You're talking to a real, checked person, not an anonymous listing.",
    },
    selector: '[data-tour="agente-verificado"]',
  },
  {
    title: { es: "Las etiquetas de estado", en: "The status labels" },
    body: {
      es: "Las etiquetas de color dicen cómo participa el agente: «Registrado» (se inscribió y dio sus datos), «Certificado» (aprobó un examen y revisamos su trayectoria), «Preferente de comuna/barrio» (tiene posicionamiento pagado en esa zona, suele conocerla a fondo). Toca cualquiera para leer la guía completa.",
      en: "The colored labels say how the agent takes part: «Registered» (signed up and gave their details), «Certified» (passed an exam and we reviewed their track record), «Preferred for a commune/neighborhood» (paid placement in that area, usually knows it well). Tap any to read the full guide.",
    },
    selector: '[data-testid="agente-tipos"]',
  },
  {
    title: { es: "Calificación y reseñas", en: "Rating and reviews" },
    body: {
      es: "Las estrellas y el número entre paréntesis son reseñas de otros usuarios reales que ya trabajaron con el agente. «Sin reseñas aún» significa que todavía no lo han calificado, no que sea malo.",
      en: "The stars and the number in parentheses are reviews from real users who already worked with the agent. «No reviews yet» means nobody has rated them yet, not that they're bad.",
    },
    selector: '[data-tour="agente-rating"]',
  },
  {
    title: { es: "Las zonas que cubre", en: "The areas they cover" },
    body: {
      es: "Los barrios donde trabaja el agente. Una etiqueta «Exclusivo» o «Preferente» en un barrio indica que es el agente posicionado de esa zona — suele tener la mejor lectura del mercado local.",
      en: "The neighborhoods where the agent works. An «Exclusive» or «Preferred» label on a neighborhood means they're the positioned agent there — usually with the best read on the local market.",
    },
    selector: '[data-tour="agente-zonas"]',
  },
  {
    title: { es: "Contactar es gratis", en: "Contacting is free" },
    body: {
      es: "Escríbele por WhatsApp, llámalo o abre su perfil para ver todos sus inmuebles y reseñas. No hay compromiso: compara dos o tres agentes antes de decidir con cuál seguir.",
      en: "Message them on WhatsApp, call, or open their profile to see all their listings and reviews. No commitment: compare two or three agents before deciding who to go with.",
    },
    selector: '[data-tour="agente-contacto"]',
  },
  {
    title: { es: "¿Repasar o profundizar?", en: "Review or go deeper?" },
    body: {
      es: "Con este botón «Tutorial» repites la guía cuando quieras. Y si te quedan dudas sobre las etiquetas, en «Guía de estados» explicamos cada una a fondo.",
      en: "This «Tutorial» button replays this guide anytime. And if you still have questions about the labels, our «Status guide» explains each one in depth.",
    },
    selector: '[data-tour="agentes-tour-replay"]',
  },
];

export function AgentesTourModal() {
  return <SpotlightTour steps={STEPS} storageKey="agentes_tour_seen" />;
}
