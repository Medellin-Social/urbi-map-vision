import { SpotlightTour, type TourStep } from "./SpotlightTour";

// Recorrido guiado de la landing /real-estate. Para cualquier visitante: explica
// qué ofrece la página (mapa unificado, 3 caminos, programa de realtors, datos
// reales) y cómo usarla. Bilingüe es/en vía LocStr. Los selectores apuntan a
// anclas data-tour de real-estate.tsx; al ser secciones, el spotlight ilumina el
// bloque completo mientras la página baja sola.
const STEPS: TourStep[] = [
  {
    title: { es: "Bienvenido a Real Estate", en: "Welcome to Real Estate" },
    body: {
      es: "En un minuto te muestro cómo usar esta página para encontrar una propiedad, un agente o publicar la tuya. La página se irá moviendo sola; toca Siguiente.",
      en: "In a minute I'll show you how to use this page to find a property, an agent, or list your own. The page moves on its own; tap Next.",
    },
    icon: "🏙️",
  },
  {
    title: { es: "El mapa, tu punto de partida", en: "The map, your starting point" },
    body: {
      es: "Reunimos todos los listings de la ciudad en una sola búsqueda. Explorá por barrio y, al mirar una zona, te recomendamos el agente preferido que la conoce. «Explorá el mapa» abre la búsqueda completa; «Publicá tu inmueble» sube el tuyo.",
      en: "We bring every listing in the city into one search. Explore by neighborhood and, as you look at an area, we recommend the preferred agent who knows it. «Explore the map» opens the full search; «List your property» posts yours.",
    },
    selector: '[data-tour="re-hero"]',
  },
  {
    title: { es: "Publicar: vendé o arrendá", en: "List: sell or rent" },
    body: {
      es: "Primer camino. Publicá tu inmueble en minutos y queda visible para todos los que buscan en tu zona — reunimos la oferta de toda la ciudad en una sola búsqueda, así no dependés de un solo portal. Los contactos te llegan directo. ¿Preferís que te acompañe un profesional? Elegí un agente de la zona para que lo liste y negocie por vos. Botón «Publicar inmueble» para hacerlo solo; el enlace de abajo para elegir agente.",
      en: "First path. List your property in minutes and it becomes visible to everyone searching your area — we aggregate the whole city's supply into one search, so you don't depend on a single portal. Leads reach you directly. Prefer a pro to guide you? Pick a local agent to list and negotiate for you. Use «List property» to do it yourself; the link below to pick an agent.",
    },
    selector: '[data-tour="re-camino-01"]',
  },
  {
    title: { es: "Encontrá un agente", en: "Browse agents" },
    body: {
      es: "Segundo camino. Buscá agentes por zona y por estado (registrado, certificado o preferente). Compará perfiles, años de experiencia, reseñas reales de otros usuarios e inmuebles activos, y contactá al que mejor encaje — gratis y sin compromiso. Botón «Buscar agentes» para abrir el directorio completo.",
      en: "Second path. Search agents by area and by status (registered, certified or preferred). Compare profiles, years of experience, real user reviews and active listings, and contact the best fit — free and with no commitment. Use «Browse agents» to open the full directory.",
    },
    selector: '[data-tour="re-camino-02"]',
  },
  {
    title: { es: "¿Sos realtor?", en: "Are you a realtor?" },
    body: {
      es: "Tercer camino. Registrate gratis: tu perfil aparece junto a tus inmuebles y recibís tus leads directo, sin intermediarios. Certificate (examen + revisión de trayectoria) para destacar tu experiencia, y volvete agente preferente de un barrio o comuna para salir primero en tu zona. Botón «Registrarme como agente»; el enlace de abajo explica cada estado.",
      en: "Third path. Register for free: your profile shows next to your listings and you get your leads directly, no middleman. Get certified (exam + track-record review) to highlight your experience, and become a preferred agent for a neighborhood or commune to show up first in your area. Use «Become a registered agent»; the link below explains each status.",
    },
    selector: '[data-tour="re-camino-03"]',
  },
  {
    title: { es: "Para realtors", en: "For realtors" },
    body: {
      es: "Si sos agente: hay un nivel gratis (tu listing y tu perfil con tus leads) y niveles pagos — Preferente de barrio o de comuna — que te hacen aparecer primero en tu zona, con rotación justa de turnos entre los agentes preferidos.",
      en: "If you're an agent: there's a free tier (your listing and profile with your leads) and paid tiers — Neighborhood or Commune Preferred — that put you first in your area, with fair turn rotation among preferred agents.",
    },
    selector: '[data-tour="re-realtors"]',
  },
  {
    title: { es: "Propiedades destacadas", en: "Featured properties" },
    body: {
      es: "Una muestra de inmuebles con foto y precio. Toca una para ver el detalle, o «Ver todas» para ir al mapa con los más de 54.000 listings.",
      en: "A sample of listings with photo and price. Tap one for details, or «See all» to go to the map with 54,000+ listings.",
    },
    selector: '[data-tour="re-destacados"]',
  },
  {
    title: { es: "Datos reales, no de vitrina", en: "Real data, not a shop window" },
    body: {
      es: "Centralizamos datos verificados de más de 54.000 propiedades en 10 municipios del Valle de Aburrá: precios reales, análisis por barrio y agentes de confianza, en un solo lugar.",
      en: "We centralize verified data from 54,000+ properties across 10 municipalities of the Aburrá Valley: real prices, neighborhood analysis and trusted agents, all in one place.",
    },
    selector: '[data-tour="re-historia"]',
  },
  {
    title: { es: "¿Repasar o empezar?", en: "Review or get started?" },
    body: {
      es: "Con este botón «Tutorial» repites la guía cuando quieras. Cuando estés listo, «Ver el mapa» te lleva a explorar las propiedades.",
      en: "This «Tutorial» button replays the guide anytime. When you're ready, «See the map» takes you to explore the properties.",
    },
    selector: '[data-tour="real-estate-tour-replay"]',
  },
];

export function RealEstateTourModal() {
  return <SpotlightTour steps={STEPS} storageKey="real_estate_tour_seen" />;
}
