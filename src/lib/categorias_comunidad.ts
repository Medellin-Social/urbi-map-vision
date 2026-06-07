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

export const CATEGORIA_LABELS: Record<string, string> = {
  brunch: 'Brunch', cena: 'Restaurante', gimnasios: 'Gimnasio',
  masajes_spa: 'Spa & Wellness', medicos: 'Salud', cafes: 'Café',
  bares: 'Bar', yoga: 'Yoga', dentistas: 'Dental', peluquerias: 'Estética',
  almuerzo: 'Almuerzo', estetica: 'Estética', panaderia: 'Panadería',
  asiatica: 'Asiática', comida_rapida: 'Rápida', fisioterapia: 'Fisio',
  dermatologia: 'Dermatología',
}

export const CATEGORIA_COLORS: Record<string, string> = {
  bares: '#14201d', brunch: '#f5f0e8', cafes: '#c8a96e', cena: '#2d1b0e',
  gimnasios: '#1D9E75', masajes_spa: '#d4a5c9', medicos: '#e8f4f8',
  dentistas: '#e8f4f8', peluquerias: '#fce4ec', yoga: '#e8f5e9',
  fisioterapia: '#fff8e1', dermatologia: '#fce4ec', estetica: '#fce4ec',
  almuerzo: '#fff3e0', panaderia: '#fff8e1', comida_rapida: '#fbe9e7',
}

export const CATEGORIA_EMOJI: Record<string, string> = {
  bares: '🍺', brunch: '☕', cafes: '☕', cena: '🍽️', gimnasios: '💪',
  masajes_spa: '🧖', medicos: '🏥', dentistas: '🦷', peluquerias: '✂️',
  yoga: '🧘', fisioterapia: '🦴', dermatologia: '✨', estetica: '💅',
  almuerzo: '🍱', panaderia: '🥐', comida_rapida: '🍕', asiatica: '🍜',
}

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
