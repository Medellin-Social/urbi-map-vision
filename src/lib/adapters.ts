import type { Opportunity } from "@/data/marketActivity";

export type NomadaBreakdown = {
  pts_yield: number | null;
  pts_nomada: number | null;
  pts_pbn: number | null;
  pts_seguridad: number | null;
  pts_verde: number | null;
  pts_equip: number | null;
};

export type Neighborhood = {
  id: number;
  nombre: string;
  comuna: string;
  municipio: string;
  estrato: number;
  precio_m2: number;
  arriendo: number;
  yield: number;
  anos_recupero: number;
  dist_metro: number;
  dist_parque: number;
  dist_mall: number;
  n_venta: number;
  n_arriendo: number;
  lat: number;
  lng: number;
  score_activo?: number | null;
  estado_precio?: string | null;
  pbn_precio_justo?: number | null;
  oportunidad?: { detectada: boolean | null; tipo: string | null; descripcion: string | null } | null;
  liquidez_api?: { score: number | null; categoria: string | null; tiempo_estimado_venta: string | null } | null;
  score_salud?: number;
  categoria_salud?: string;
  n_remates_municipio?: number;
  remates_por_100?: number | null;
  n_cafes_500m?: number | null;
  n_coworking_1km?: number | null;
  n_gimnasios_1km?: number | null;
  n_yoga_1km?: number | null;
  indice_nomada?: number | null;
  yield_renta_media_pct?: number | null;
  precio_renta_media_p50?: number | null;
  nomada_breakdown?: NomadaBreakdown | null;
  seguridad_score?: number | null;
  seguridad_categoria?: string | null;
  seguridad_nota?: string | null;
  verde_pct?: number | null;
  verde_categoria?: string | null;
};
import {
  OPP_COLORS,
  getScoreColor,
  getScoreFillOpacity,
  type ScorePaletteId,
} from "@/config/mapColors";

// ── Backend response shapes (mirrors api/routers/barrios.py) ──────────────────

export type ApiBarrio = {
  barrio_id: number;
  nombre: string | null;
  comuna: string | null;
  municipio: string | null;
  estrato: number | null;
  geometry: { type: string; coordinates: unknown } | null;
  color_hex: string | null;
  excluir_inversion: boolean | null;
  n_remates_municipio?: number | null;
  scores: {
    corto: number | null;
    cat_corto: string | null;
    mediano: number | null;
    cat_mediano: string | null;
    largo: number | null;
    cat_largo: string | null;
    perfil_recomendado: string | null;
    score_activo: number | null;
  };
  mercado: {
    precio_m2_cop: number | null;
    precio_m2_usd: number | null;
    arriendo_p50_cop: number | null;
    yield_bruto_pct: number | null;
    anos_recupero: number | null;
    estado_precio: string | null;
    pbn_precio_justo: number | null;
    poi_precio_oferta: number | null;
    yield_renta_media_pct: number | null;
    precio_renta_media_p50: number | null;
  };
  nomada_breakdown?: NomadaBreakdown | null;
  airbnb: {
    ocupacion_pct: number | null;
    adr_usd: number | null;
    adr_cop: number | null;
    yield_airbnb_pct: number | null;
    n_listings: number | null;
  };
  seguridad: {
    score: number | null;
    categoria: string | null;
    zona_turistica: boolean | null;
    tendencia: string | null;
    nota: string | null;
  };
  conectividad: {
    dist_metro_km: number | null;
    dist_parque_km: number | null;
    dist_mall_km: number | null;
    n_cafes_500m: number | null;
    n_coworking_1km: number | null;
    n_gimnasios_1km: number | null;
    n_yoga_1km: number | null;
    indice_nomada: number | null;
  };
  verde: {
    indice_verde_pct: number | null;
    categoria: string | null;
    score_verde: number | null;
  };
  liquidez: {
    score: number | null;
    categoria: string | null;
    tiempo_estimado_venta: string | null;
    nota_metodologia: string | null;
  };
  oportunidad: {
    detectada: boolean | null;
    tipo: string | null;
    descripcion: string | null;
  };
  valorizacion: {
    var_anual_pct: number | null;
    proyeccion_3anos_pct: number | null;
    proyeccion_5anos_pct: number | null;
    tendencia: string | null;
  };
};

export type ApiListing = {
  id: number;
  fuente?: string | null;
  tipo_operacion?: string | null;
  tipo_inmueble?: string | null;
  precio_cop?: number | null;
  precio_usd?: number | null;
  area_m2?: number | null;
  precio_m2?: number | null;
  habitaciones?: number | null;
  banos?: number | null;
  direccion_raw?: string | null;
  url?: string | null;
  fecha_scraping?: string | null;
  buena_oferta?: boolean | null;
  pct_bajo_mediana?: number | null;
};

export type ApiListingsResponse = {
  total: number;
  listings: ApiListing[];
};

export type ApiOportunidad = {
  barrio_id: number;
  nombre_barrio: string | null;
  comuna: string | null;
  municipio: string | null;
  tipo_oportunidad: string | null;
  descripcion_oportunidad: string | null;
  score_relevante: number | null;
  liquidez_score: number | null;
  categoria_liquidez: string | null;
  tiempo_estimado_venta: string | null;
  estado_precio: string | null;
  yield_bruto_pct: number | null;
};

// ── Geometry helpers ──────────────────────────────────────────────────────────

function centroid(geometry: ApiBarrio["geometry"]): [number, number] {
  if (!geometry) return [-75.58, 6.24];
  const g = geometry as { type: string; coordinates: number[][][] | number[][][][] };
  if (g.type === "Point") {
    const c = g.coordinates as unknown as number[];
    return [c[0], c[1]];
  }
  const ring: number[][] =
    g.type === "Polygon"
      ? (g.coordinates as number[][][])[0]
      : g.type === "MultiPolygon"
        ? ((g.coordinates as number[][][][])[0]?.[0] ?? [])
        : [];
  if (!ring.length) return [-75.58, 6.24];
  const lng = ring.reduce((s, c) => s + c[0], 0) / ring.length;
  const lat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
  return [lng, lat];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreLabel(score: number | null): string {
  if (score === null || score === undefined || score < 20) return "Sin datos suficientes";
  if (score >= 80) return "Excelente";
  if (score >= 65) return "Bueno";
  if (score >= 50) return "Moderado";
  if (score >= 35) return "Bajo";
  return "Muy bajo";
}

// ── Converters ────────────────────────────────────────────────────────────────

export function barrioToNeighborhood(b: ApiBarrio): Neighborhood {
  const [lng, lat] = centroid(b.geometry);
  return {
    id: b.barrio_id,
    nombre: (b.nombre ?? "").toUpperCase(),
    comuna: b.comuna ?? "",
    municipio: b.municipio ?? "Medellín",
    estrato: b.estrato ?? 3,
    precio_m2: b.mercado.precio_m2_cop ?? 5_000_000,
    arriendo: b.mercado.arriendo_p50_cop ?? 2_000_000,
    yield: b.mercado.yield_bruto_pct ?? 6,
    anos_recupero: b.mercado.anos_recupero ?? 15,
    dist_metro: b.conectividad.dist_metro_km ?? 1,
    dist_parque: b.conectividad.dist_parque_km ?? 0.5,
    dist_mall: b.conectividad.dist_mall_km ?? 1.5,
    n_venta: 0,
    n_arriendo: 0,
    lat,
    lng,
    score_activo: b.scores.score_activo,
    estado_precio: b.mercado.estado_precio,
    oportunidad: b.oportunidad,
    n_cafes_500m: b.conectividad.n_cafes_500m,
    n_coworking_1km: b.conectividad.n_coworking_1km,
    n_gimnasios_1km: b.conectividad.n_gimnasios_1km,
    n_yoga_1km: b.conectividad.n_yoga_1km,
    indice_nomada: b.conectividad.indice_nomada,
    pbn_precio_justo: b.mercado.pbn_precio_justo,
    yield_renta_media_pct: b.mercado.yield_renta_media_pct,
    precio_renta_media_p50: b.mercado.precio_renta_media_p50,
    nomada_breakdown: b.nomada_breakdown ?? null,
    liquidez_api: b.liquidez
      ? { score: b.liquidez.score, categoria: b.liquidez.categoria, tiempo_estimado_venta: b.liquidez.tiempo_estimado_venta }
      : null,
    seguridad_score: b.seguridad?.score ?? null,
    seguridad_categoria: b.seguridad?.categoria ?? null,
    seguridad_nota: b.seguridad?.nota ?? null,
    verde_pct: b.verde?.indice_verde_pct ?? null,
    verde_categoria: b.verde?.categoria ?? null,
    n_remates_municipio: b.n_remates_municipio ?? undefined,
  };
}

const OPP_EMOJIS: Record<string, string> = {
  "PRECIO BAJO MERCADO": "🎯",
  "ALTO RENDIMIENTO": "📈",
  "INVERSIÓN SEGURA": "🛡️",
};

export function apiOportunidadToOpportunity(o: ApiOportunidad): Opportunity {
  const tipo = (o.tipo_oportunidad ?? "ALTO RENDIMIENTO").toUpperCase() as Opportunity["tipo"];
  return {
    barrio_id: o.barrio_id,
    barrio: (o.nombre_barrio ?? "").toUpperCase(),
    tipo,
    descripcion: o.descripcion_oportunidad ?? "",
    score: o.score_relevante ?? 50,
    liquidez: (o.categoria_liquidez ?? "MEDIA") as Opportunity["liquidez"],
    color: OPP_COLORS[tipo as keyof typeof OPP_COLORS] ?? "#0077B6",
    emoji: OPP_EMOJIS[tipo] ?? "📊",
  };
}

export function barriosToGeoJSON(barrios: ApiBarrio[], palette?: ScorePaletteId) {
  return {
    type: "FeatureCollection" as const,
    features: barrios.map((b) => {
      const score = b.scores.score_activo;
      const excluir = b.excluir_inversion ?? false;
      return {
        type: "Feature" as const,
        id: b.barrio_id,
        properties: {
          id: b.barrio_id,
          nombre: b.nombre ?? "",
          comuna: b.comuna ?? "",
          yield: b.mercado.yield_bruto_pct ?? 6,
          color_hex: excluir ? "#374151" : getScoreColor(score, palette),
          fill_opacity: getScoreFillOpacity(score, excluir, palette),
          has_score: score !== null && !excluir,
          score_activo: score ?? 0,
          cat_activo: excluir ? "No disponible" : scoreLabel(score),
          excluir_inversion: excluir,
        },
        geometry: b.geometry ?? { type: "Polygon", coordinates: [[]] },
      };
    }),
  };
}
