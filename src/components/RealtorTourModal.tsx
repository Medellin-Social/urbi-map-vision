import { SpotlightTour, type TourStep } from "./SpotlightTour";

// Recorrido guiado del Centro de agente. La página se mueve sola: cada paso cambia
// a su sección (`section`), entra a la sub-pestaña (`clickSelector` sobre `#subtab-*`)
// y la resalta, mientras el texto explica qué es y cómo se usa.
// Mantener alineado con SECTIONS y los SubNav de dashboard.tsx (orden e ids).
const STEPS: TourStep[] = [
  {
    title: { es: "Tu centro de agente", en: "Your agent hub" },
    body: {
      es: "Un recorrido rápido: te llevo por cada sección y te muestro qué hace y cómo se usa. La página se irá moviendo sola; toca Siguiente.",
      en: "A quick walkthrough: I'll take you through each section and show what it does and how to use it. The page moves on its own; tap Next.",
    },
    icon: "📊",
  },

  // ── Bandeja y agenda ──────────────────────────────────────────────
  {
    title: { es: "Bandeja y agenda", en: "Inbox & calendar" },
    body: {
      es: "Tu día empieza acá. Está organizada por quién te busca, en tres pestañas: Propietarios, Visitas e Interesados. El número rojo del menú es lo que espera tu respuesta.",
      en: "Your day starts here. Organized by who's looking for you, in three tabs: Owners, Visits and Interested. The red number in the menu is what's awaiting your reply.",
    },
    section: "bandeja",
    selector: "#tab-bandeja",
  },
  {
    title: { es: "Propietarios", en: "Owners" },
    body: {
      es: "Dueños de tu zona que quieren publicar contigo. Ábrelos y sigue 3 pasos: Aceptar → completar la Ficha → Publicar. Si tu zona todavía no tiene agente, aparecen en el «Pool»: el primero que lo tome se lo queda. Verificar los documentos le da al aviso el sello «Verificada».",
      en: "Owners in your zone who want to list with you. Open one and follow 3 steps: Accept → fill the Listing → Publish. If your zone has no agent yet, they appear in the «Pool»: first agent to grab it keeps it. Verifying the documents earns the «Verified» badge.",
    },
    section: "bandeja",
    clickSelector: "#subtab-propietarios",
    selector: "#subtab-propietarios",
  },
  {
    title: { es: "Visitas", en: "Visits" },
    body: {
      es: "Compradores que pidieron ver un inmueble. Confírmalas rápido (las destacadas, en menos de 4 h). Después de la visita marca en un toque cómo terminó: Hará oferta, Interesado o No le interesó. También puedes registrar a mano una visita que agendaste por fuera.",
      en: "Buyers who asked to see a property. Confirm fast (featured ones in under 4 h). After the visit, mark in one tap how it went: Will make an offer, Interested or Not interested. You can also log by hand a visit you set up elsewhere.",
    },
    section: "bandeja",
    clickSelector: "#subtab-visitas",
    selector: "#subtab-visitas",
  },
  {
    title: { es: "Interesados", en: "Interested" },
    body: {
      es: "Quienes guardaron tus inmuebles en favoritos — compradores tibios. Están agrupados por listing; escríbeles con un toque para ofrecerles una visita antes de que se enfríen.",
      en: "People who saved your properties as favorites — warm buyers. Grouped by listing; message them in one tap to offer a visit before they cool off.",
    },
    section: "bandeja",
    clickSelector: "#subtab-interesados",
    selector: "#subtab-interesados",
  },

  // ── Mis listings ──────────────────────────────────────────────────
  {
    title: { es: "Mis listings", en: "My listings" },
    body: {
      es: "Tu portafolio de inmuebles. Arriba, cuatro números que también son filtros: tócalos para ver solo Publicados, En preparación, Aperturas (visitas al aviso) o Favoritos. Abajo buscas por título/barrio y ordenas (recientes, más vistos, precio).",
      en: "Your property portfolio. Up top, four numbers that are also filters: tap them to see only Published, In preparation, Views or Favorites. Below, search by title/neighborhood and sort (recent, most viewed, price).",
    },
    section: "listings",
    selector: "#tab-listings",
  },
  {
    title: { es: "Se agrupan por etapa", en: "Grouped by stage" },
    body: {
      es: "Tus inmuebles salen en tres bloques: «En preparación» (borradores y los rechazados por corregir), «Activos» (publicados en el mapa o pausados) y «Cerrados» (ya vendidos o arrendados). Así ves de un vistazo qué necesita trabajo y qué ya está vivo.",
      en: "Your properties show in three blocks: «In preparation» (drafts and rejected ones to fix), «Active» (published on the map or paused) and «Closed» (already sold or rented). You see at a glance what needs work and what's live.",
    },
    section: "listings",
    selector: '[data-tour="listings-grupos"]',
  },
  {
    title: { es: "Los botones de cada aviso", en: "Each listing's buttons" },
    body: {
      es: "En cada tarjeta: «Editar» abre la ficha completa (fotos, precio, características, documentos). «Pausar» lo oculta del mapa sin borrarlo y «Reactivar» lo vuelve a mostrar. «Marcar vendido» reporta el cierre — desbloquea los precios reales de venta y sube tu puntaje. «Eliminar» lo quita (recuperable con soporte).",
      en: "On each card: «Edit» opens the full listing (photos, price, features, documents). «Pause» hides it from the map without deleting it and «Reactivate» shows it again. «Mark as sold» reports the closing — unlocks real sale prices and raises your score. «Delete» removes it (recoverable via support).",
    },
    section: "listings",
    selector: '[data-tour="listing-acciones"]',
  },

  // ── Herramientas ──────────────────────────────────────────────────
  {
    title: { es: "Herramientas", en: "Tools" },
    body: {
      es: "Dos ayudas para asesorar a tu cliente: Comparador y Simulador. Te muestro cada una por dentro.",
      en: "Two aids to advise your client: Comparator and Simulator. Let me show you inside each.",
    },
    section: "herramientas",
    selector: "#tab-herramientas",
  },
  {
    title: { es: "Comparador", en: "Comparator" },
    body: {
      es: "Arriba eliges «Por barrio» o «Por listing». Por barrio: escoge la comuna y toca hasta 4 barrios; abajo salen las tablas que los comparan en rentabilidad, valorización, precio, seguridad, metro, estrato y si se permite Airbnb según el POT — el mejor valor de cada fila lleva ★. Por listing: compara tus propios inmuebles o cualquiera que marques desde el mapa.",
      en: "Up top pick «By neighborhood» or «By listing». By neighborhood: choose the comuna and tap up to 4 neighborhoods; below, tables compare them on returns, appreciation, price, safety, metro, stratum and whether Airbnb is allowed under the POT — the best value in each row gets a ★. By listing: compare your own properties or any you flag from the map.",
    },
    section: "herramientas",
    clickSelector: "#subtab-comparador",
    selector: "#subpanel-comparador",
  },
  {
    title: { es: "Simulador", en: "Simulator" },
    body: {
      es: "Llena los parámetros: Comuna y Barrio, el Presupuesto (botones de $200M a $1.000M) y la Modalidad (Airbnb, Renta media o Renta larga). Toca «Simular» y abajo aparecen el yield (ganancia anual), los años para recuperar la inversión, el flujo de caja mes a mes y la proyección del valor a 5 años — para mostrárselo al cliente.",
      en: "Fill the parameters: Comuna and Neighborhood, the Budget (buttons from $200M to $1,000M) and the Mode (Airbnb, Mid-term or Long-term rent). Tap «Simulate» and below you get the yield (annual return), years to recoup, month-by-month cash flow and the 5-year value projection — to show the client.",
    },
    section: "herramientas",
    clickSelector: "#subtab-simulador",
    selector: "#subpanel-simulador",
  },

  // ── Resultados + Servicios + repaso ───────────────────────────────
  {
    title: { es: "Resultados", en: "Results" },
    body: {
      es: "Para revisar cada semana. Tu puntaje (0–100) y lo que lo mueve: cierres, qué tan rápido respondes y cuántos leads aceptas. Más abajo, si tu zona pagada te está rindiendo. Ojo: que un comprador te deje plantado NO te baja el puntaje.",
      en: "To review weekly. Your score (0–100) and what moves it: closings, how fast you respond and how many leads you accept. Below, whether your paid zone is paying off. Note: a buyer no-show does NOT lower your score.",
    },
    section: "inicio",
    selector: "#tab-inicio",
  },
  {
    title: { es: "Servicios", en: "Services" },
    body: {
      es: "Tu configuración, en tres pestañas. «Perfil público»: foto y descripción con las que te ven en el directorio de agentes (botón Guardar). «Horario de visitas»: prende los días y fija las horas en que te pueden agendar (Guardar horario). «Zonas patrocinadas»: elige nivel (comuna o barrio), la zona y los meses, y toca Comprar zona para ser el agente exclusivo de ahí.",
      en: "Your settings, in three tabs. «Public profile»: photo and bio shown in the agent directory (Save button). «Visit hours»: switch on the days and set the hours buyers can book you (Save hours). «Sponsored zones»: pick level (comuna or neighborhood), the zone and the months, then Buy zone to become its exclusive agent.",
    },
    section: "servicios",
    selector: "#tab-servicios",
  },
  {
    title: { es: "¿Repasar después?", en: "Review later?" },
    body: {
      es: "Con este botón «Tutorial» vuelves a ver esta guía cuando quieras.",
      en: "This «Tutorial» button replays this guide whenever you want.",
    },
    section: "bandeja",
    selector: '[data-tour="realtor-tour-replay"]',
  },
];

export function RealtorTourModal({ onSection }: { onSection?: (s: string) => void } = {}) {
  return <SpotlightTour steps={STEPS} storageKey="realtor_tour_seen" onSection={onSection} />;
}
