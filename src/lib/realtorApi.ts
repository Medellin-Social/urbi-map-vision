import { apiFetch } from "@/lib/apiClient";
import { API_BASE_URL } from "@/config/api";

// ── Enums — aligned with backend models (realtors.py / listing.py) ─────────────

export type EstadoListing  = "borrador" | "en_revision" | "publicado" | "rechazado" | "pausado" | "cerrado";
export type TipoInmueble   = "apartamento" | "casa" | "local" | "oficina" | "lote" | "finca";
export type Operacion      = "venta" | "arriendo";
export type EstadoAgent    = "pendiente" | "activo" | "rechazado";
export type ZonaNivel      = "barrio" | "comuna" | "municipio";

// ── Domain types ───────────────────────────────────────────────────────────────

export type ZonaPatrocinada = {
  codigo: string;
  nombre: string;
  nivel: ZonaNivel;
  tier: string | null;
};

export type PerfilAgente = {
  id: string;
  nombre: string;
  avatar?: string;
  estado: EstadoAgent;
  zonas_patrocinadas: ZonaPatrocinada[];
};

export type DueDiligence = {
  documentos_completos: boolean;
  faltantes: string[];
};

// Mínimos del listing borrador que el dashboard necesita para evaluar completitud
export type ListingDraft = {
  id: string;
  tipo_inmueble: TipoInmueble | null;
  operacion: Operacion | null;
  precio: number | null;
  municipio: string | null;
  barrio: string | null;
  geom_set: boolean;
  area_m2: number | null;
  titulo: string | null;
  habitaciones: number | null;
  banos: number | null;
  fotos_portada: number; // count of ListingMedia with es_portada=true
};

export type ItemAsignado = {
  id: string; // intake.id
  tipo_inmueble: TipoInmueble;
  operacion: Operacion;
  precio_esperado: number;
  barrio: string;
  municipio: string;
  owner_nombre: string;
  declarado: {
    area_m2: number | null;
    habitaciones: number | null;
    banos: number | null;
    tiene_escritura: boolean | null;
    al_dia_predial: boolean | null;
    al_dia_administracion: boolean | null;
    tiene_hipoteca: boolean | null;
  };
  due_diligence: DueDiligence;
  listing?: ListingDraft; // borrador asociado (puede no existir aún)
  created_at: string;
};

export type ItemPool = {
  id: string;
  tipo_inmueble: TipoInmueble;
  operacion: Operacion;
  precio_esperado: number;
  barrio: string;
  municipio: string;
  created_at: string;
};

export type MiListing = {
  id: string;
  titulo: string;
  tipo_inmueble: TipoInmueble;
  operacion: Operacion;
  precio: number;
  barrio: string;
  estado: EstadoListing;
  updated_at: string;
};

export type InteligenciaBarrio = {
  zona_codigo: string;
  zona_nombre: string;
  score_consolidado: number;
  liquidez: number;         // 0–100
  mediana_venta_m2: number; // COP por m²
  dias_promedio_mercado: number;
};

// ── Business logic ─────────────────────────────────────────────────────────────

/** Evalúa si un listing borrador tiene los datos mínimos para enviar a revisión. */
export function datosMinimosCompletos(l: ListingDraft): { ok: boolean; faltan: string[] } {
  const faltan: string[] = [];
  if (!l.tipo_inmueble)              faltan.push("tipo de inmueble");
  if (!l.operacion)                  faltan.push("operación");
  if (!l.precio)                     faltan.push("precio");
  if (!l.geom_set)                   faltan.push("ubicación exacta");
  if (!l.barrio && !l.municipio)     faltan.push("barrio / municipio");
  if (!l.area_m2)                    faltan.push("área (m²)");
  if (!l.titulo)                     faltan.push("título del aviso");
  if (l.fotos_portada < 1)           faltan.push("foto de portada");
  if (l.tipo_inmueble === "apartamento" || l.tipo_inmueble === "casa") {
    if (!l.habitaciones)             faltan.push("habitaciones");
    if (!l.banos)                    faltan.push("baños");
  }
  return { ok: faltan.length === 0, faltan };
}

// ── API interface ──────────────────────────────────────────────────────────────

export interface RealtorDashboardApi {
  /** TODO: GET /api/v1/realtor/me */
  getPerfil(): Promise<PerfilAgente>;
  /** TODO: GET /api/v1/realtor/asignados */
  getAsignados(): Promise<ItemAsignado[]>;
  /** TODO: GET /api/v1/realtor/pool */
  getPool(): Promise<ItemPool[]>;
  /** TODO: POST /api/v1/realtor/pool/:id/tomar */
  tomarDelPool(id: string): Promise<void>;
  /** TODO: GET /api/v1/realtor/listings */
  getMisListings(): Promise<MiListing[]>;
  /** TODO: POST /api/v1/realtor/asignados/:id/publicar  (borrador → en_revision) */
  publicarAsignado(intakeId: string): Promise<void>;
  /** TODO: GET /api/v1/barrios/:codigo/inteligencia */
  getInteligenciaBarrio(zonaCodigo: string): Promise<InteligenciaBarrio>;
}

// ── Mock ───────────────────────────────────────────────────────────────────────

const _d = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Mutable so tomarDelPool can remove rows optimistically
let _pool: ItemPool[] = [
  { id: "pool-1", tipo_inmueble: "apartamento", operacion: "venta",    precio_esperado: 280_000_000, barrio: "Sabaneta Centro",  municipio: "Sabaneta",  created_at: "2026-07-08T10:00:00Z" },
  { id: "pool-2", tipo_inmueble: "casa",        operacion: "arriendo", precio_esperado:   3_800_000, barrio: "Belén Rincón",     municipio: "Medellín",  created_at: "2026-07-07T14:30:00Z" },
  { id: "pool-3", tipo_inmueble: "local",       operacion: "arriendo", precio_esperado:   4_200_000, barrio: "El Centro",        municipio: "Medellín",  created_at: "2026-07-06T09:15:00Z" },
  { id: "pool-4", tipo_inmueble: "apartamento", operacion: "venta",    precio_esperado: 195_000_000, barrio: "Itagüí Centro",    municipio: "Itagüí",    created_at: "2026-07-05T16:00:00Z" },
];

const mockApi: RealtorDashboardApi = {
  async getPerfil() {
    await _d(500);
    return {
      id: "agent-demo-1",
      nombre: "Valentina Restrepo",
      estado: "activo",
      zonas_patrocinadas: [
        { codigo: "el-poblado", nombre: "El Poblado", nivel: "barrio", tier: "barrio" },
        { codigo: "laureles",   nombre: "Laureles",   nivel: "barrio", tier: "barrio" },
      ],
    };
  },

  async getAsignados() {
    await _d(600);
    return [
      // ── Caso 1: due diligence OK + listing completo → "Publicar" ────────────
      {
        id: "intake-1",
        tipo_inmueble: "apartamento",
        operacion: "venta",
        precio_esperado: 620_000_000,
        barrio: "El Poblado",
        municipio: "Medellín",
        owner_nombre: "Carlos Mejía",
        declarado: { area_m2: 78, habitaciones: 3, banos: 2, tiene_escritura: true, al_dia_predial: true, al_dia_administracion: true, tiene_hipoteca: false },
        due_diligence: { documentos_completos: true, faltantes: [] },
        listing: {
          id: "listing-draft-1",
          tipo_inmueble: "apartamento",
          operacion: "venta",
          precio: 620_000_000,
          municipio: "Medellín",
          barrio: "El Poblado",
          geom_set: true,
          area_m2: 78,
          titulo: "Apartamento moderno en El Poblado con vista a la ciudad",
          habitaciones: 3,
          banos: 2,
          fotos_portada: 2,
        },
        created_at: "2026-07-05T09:00:00Z",
      },
      // ── Caso 2: due diligence OK + listing sin foto portada → "Completar ficha" ──
      {
        id: "intake-2",
        tipo_inmueble: "casa",
        operacion: "venta",
        precio_esperado: 890_000_000,
        barrio: "Laureles",
        municipio: "Medellín",
        owner_nombre: "Marcela Torres",
        declarado: { area_m2: 140, habitaciones: 4, banos: 3, tiene_escritura: true, al_dia_predial: true, al_dia_administracion: null, tiene_hipoteca: false },
        due_diligence: { documentos_completos: true, faltantes: [] },
        listing: {
          id: "listing-draft-2",
          tipo_inmueble: "casa",
          operacion: "venta",
          precio: 890_000_000,
          municipio: "Medellín",
          barrio: "Laureles",
          geom_set: true,
          area_m2: 140,
          titulo: "Casa esquinera en Laureles — 4 hab",
          habitaciones: 4,
          banos: 3,
          fotos_portada: 0,   // ← sin foto de portada
        },
        created_at: "2026-07-06T11:00:00Z",
      },
      // ── Caso 3: documentos incompletos → "Revisar" ───────────────────────────
      {
        id: "intake-3",
        tipo_inmueble: "apartamento",
        operacion: "arriendo",
        precio_esperado: 3_200_000,
        barrio: "Envigado Centro",
        municipio: "Envigado",
        owner_nombre: "Juan Esteban Ríos",
        declarado: { area_m2: 62, habitaciones: 2, banos: 2, tiene_escritura: false, al_dia_predial: true, al_dia_administracion: false, tiene_hipoteca: null },
        due_diligence: { documentos_completos: false, faltantes: ["escritura", "paz y salvo administración"] },
        created_at: "2026-07-07T15:00:00Z",
      },
    ];
  },

  async getPool() {
    await _d(600);
    return [..._pool];
  },

  async tomarDelPool(id) {
    await _d(400);
    _pool = _pool.filter((p) => p.id !== id);
  },

  async getMisListings() {
    await _d(600);
    return [
      { id: "l-1", titulo: "Apartamento moderno en El Poblado",   tipo_inmueble: "apartamento", operacion: "venta",    precio: 620_000_000, barrio: "El Poblado",  estado: "publicado",   updated_at: "2026-07-01T08:00:00Z" },
      { id: "l-2", titulo: "Casa esquinera Laureles — 4 hab",      tipo_inmueble: "casa",        operacion: "venta",    precio: 890_000_000, barrio: "Laureles",    estado: "en_revision", updated_at: "2026-07-04T10:00:00Z" },
      { id: "l-3", titulo: "Apartamento arriendo El Estadio",       tipo_inmueble: "apartamento", operacion: "arriendo", precio:   2_800_000, barrio: "El Estadio",  estado: "borrador",    updated_at: "2026-07-08T09:00:00Z" },
      { id: "l-4", titulo: "Local comercial Belén",                 tipo_inmueble: "local",       operacion: "arriendo", precio:   3_500_000, barrio: "Belén",       estado: "rechazado",   updated_at: "2026-06-28T14:00:00Z" },
      { id: "l-5", titulo: "Oficina zona financiera El Poblado",    tipo_inmueble: "oficina",     operacion: "venta",    precio: 320_000_000, barrio: "El Poblado",  estado: "cerrado",     updated_at: "2026-06-15T11:00:00Z" },
    ];
  },

  async publicarAsignado(_intakeId) {
    await _d(500);
    // ponytail: mock no-op; real impl POSTs intake → listing borrador → en_revision
  },

  async getInteligenciaBarrio(zonaCodigo) {
    await _d(500);
    const table: Record<string, InteligenciaBarrio> = {
      "el-poblado": { zona_codigo: "el-poblado", zona_nombre: "El Poblado", score_consolidado: 78, liquidez: 72, mediana_venta_m2: 8_500_000, dias_promedio_mercado: 45 },
      "laureles":   { zona_codigo: "laureles",   zona_nombre: "Laureles",   score_consolidado: 71, liquidez: 68, mediana_venta_m2: 6_800_000, dias_promedio_mercado: 55 },
    };
    return table[zonaCodigo] ?? {
      zona_codigo: zonaCodigo, zona_nombre: zonaCodigo,
      score_consolidado: 60, liquidez: 55, mediana_venta_m2: 5_500_000, dias_promedio_mercado: 70,
    };
  },
};

// ── HTTP skeleton — ponytail: wire when backend routes exist ───────────────────

const httpApi: RealtorDashboardApi = {
  getPerfil:            ()     => apiFetch<PerfilAgente>       (`${API_BASE_URL}/realtor/me`),
  getAsignados:         ()     => apiFetch<ItemAsignado[]>     (`${API_BASE_URL}/realtor/asignados`),
  getPool:              ()     => apiFetch<ItemPool[]>         (`${API_BASE_URL}/realtor/pool`),
  tomarDelPool:         (id)   => apiFetch<void>               (`${API_BASE_URL}/realtor/pool/${id}/tomar`,         { method: "POST" }),
  getMisListings:       ()     => apiFetch<MiListing[]>        (`${API_BASE_URL}/realtor/listings`),
  publicarAsignado:     (id)   => apiFetch<void>               (`${API_BASE_URL}/realtor/asignados/${id}/publicar`, { method: "POST" }),
  getInteligenciaBarrio:(code) => apiFetch<InteligenciaBarrio> (`${API_BASE_URL}/barrios/${code}/inteligencia`),
};

// Cambia a false en .env (VITE_REALTOR_USE_MOCK=false) para usar el backend real
export const realtorApi: RealtorDashboardApi =
  import.meta.env.VITE_REALTOR_USE_MOCK !== "false" ? mockApi : httpApi;
