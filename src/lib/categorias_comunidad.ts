export interface CategoriaTienda {
  key: string
  label: string
  emoji: string
}

export interface GrupoTiendas {
  key: string
  label: string
  emoji: string
  categorias: CategoriaTienda[]
}

export interface CategoriaEvento {
  key: string
  label: string
  emoji: string
}

export const GRUPOS_TIENDAS: GrupoTiendas[] = [
  {
    key: "gastronomia",
    label: "Gastronomía",
    emoji: "🍽️",
    categorias: [
      { key: "brunch",        label: "Desayuno & Brunch",    emoji: "☕" },
      { key: "almuerzo",      label: "Almuerzos",            emoji: "🍱" },
      { key: "cena",          label: "Cena & Restaurantes",  emoji: "🕯️" },
      { key: "bares",         label: "Bares & Pubs",         emoji: "🍺" },
      { key: "cafes",         label: "Cafés",                emoji: "☕" },
      { key: "comida_rapida", label: "Comida Rápida",        emoji: "🍕" },
      { key: "panaderia",     label: "Panaderías & Postres", emoji: "🥐" },
      { key: "asiatica",      label: "Comida Asiática",      emoji: "🍜" },
    ],
  },
  {
    key: "salud",
    label: "Salud & Belleza",
    emoji: "💊",
    categorias: [
      { key: "medicos",      label: "Médicos & Clínicas",        emoji: "🏥" },
      { key: "dentistas",    label: "Dentistas",                 emoji: "🦷" },
      { key: "dermatologia", label: "Dermatología & Estética",   emoji: "✨" },
      { key: "fisioterapia", label: "Fisioterapia",              emoji: "🦴" },
      { key: "masajes_spa",  label: "Masajes & Spa",             emoji: "🧖" },
      { key: "peluquerias",  label: "Peluquerías & Barberías",   emoji: "✂️" },
      { key: "estetica",     label: "Estética & Uñas",           emoji: "💅" },
    ],
  },
  {
    key: "fitness",
    label: "Fitness",
    emoji: "💪",
    categorias: [
      { key: "gimnasios", label: "Gimnasios & Crossfit", emoji: "🏋️" },
      { key: "yoga",      label: "Yoga & Pilates",       emoji: "🧘" },
    ],
  },
  {
    key: "servicios_hogar",
    label: "Servicios del Hogar",
    emoji: "🏠",
    categorias: [
      { key: "remodelaciones", label: "Remodelaciones",  emoji: "🔨" },
      { key: "plomeria",       label: "Plomería",        emoji: "🔧" },
      { key: "electricistas",  label: "Electricistas",   emoji: "⚡" },
      { key: "mudanzas",       label: "Mudanzas",        emoji: "📦" },
      { key: "cerrajeria",     label: "Cerrajería",      emoji: "🔑" },
      { key: "jardineria",     label: "Jardinería",      emoji: "🌿" },
    ],
  },
  {
    key: "mas_servicios",
    label: "Más Servicios",
    emoji: "🏪",
    categorias: [
      { key: "bancos",              label: "Bancos & ATMs",         emoji: "🏦" },
      { key: "mascotas",            label: "Mascotas",              emoji: "🐾" },
      { key: "parqueaderos",        label: "Parqueaderos",          emoji: "🅿️" },
      { key: "segunda_mano",        label: "Segunda Mano",          emoji: "♻️" },
      { key: "agente_inmobiliario", label: "Agentes Inmobiliarios", emoji: "🏡" },
    ],
  },
]

export const CATEGORIAS_TIENDAS: CategoriaTienda[] = GRUPOS_TIENDAS.flatMap((g) => g.categorias)

export const CATEGORIAS_TIENDAS_MAP = Object.fromEntries(
  CATEGORIAS_TIENDAS.map((c) => [c.key, c])
) as Record<string, CategoriaTienda>

export const GRUPOS_TIENDAS_MAP = Object.fromEntries(
  GRUPOS_TIENDAS.map((g) => [g.key, g])
) as Record<string, GrupoTiendas>

export const CATEGORIAS_EVENTOS: CategoriaEvento[] = [
  { key: "networking",  label: "Networking",  emoji: "🤝" },
  { key: "happy_hour",  label: "Happy Hour",  emoji: "🍹" },
  { key: "musica",      label: "Música",      emoji: "🎵" },
  { key: "deporte",     label: "Deporte",     emoji: "🏃" },
  { key: "gastronomia", label: "Gastronomía", emoji: "🍽️" },
  { key: "cultura",     label: "Cultura",     emoji: "🎨" },
  { key: "bienestar",   label: "Bienestar",   emoji: "🧘" },
  { key: "tech",        label: "Tech",        emoji: "💻" },
  { key: "social",      label: "Social",      emoji: "👥" },
]

export const CATEGORIAS_EVENTOS_MAP = Object.fromEntries(
  CATEGORIAS_EVENTOS.map((c) => [c.key, c])
) as Record<string, CategoriaEvento>
