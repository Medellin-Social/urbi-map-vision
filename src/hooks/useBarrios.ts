import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";
import { API_ENDPOINTS } from "@/config/api";
import { barrioToNeighborhood, type ApiBarrio, type ApiListingsResponse } from "@/lib/adapters";

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function geoKey(nombre: string, municipio: string): string {
  return `${stripAccents(nombre.toUpperCase())}__${stripAccents(municipio.toUpperCase())}`;
}

// ── Static GeoJSON geometry cache — all municipios loaded in parallel ─────────
// Individual files per municipio (vs 16MB monolithic). All fetched concurrently
// so the query returns complete data on first render.

type StaticFeature = {
  properties: { nombre: string; municipio: string };
  geometry: ApiBarrio["geometry"];
};

const ALL_MUNICIPIOS = ["medellin", "bello", "envigado", "itagui", "sabaneta", "la_estrella"] as const;

async function _fetchMunicipioFeatures(municipio: string): Promise<StaticFeature[]> {
  try {
    const r = await fetch(`/data/barrios_${municipio}.geojson`);
    const fc = await r.json();
    return fc.features ?? [];
  } catch {
    return [];
  }
}

const _geoMap = new Map<string, ApiBarrio["geometry"]>();
let _geoPromise: Promise<Map<string, ApiBarrio["geometry"]>> | null = null;

function loadStaticGeometry(): Promise<Map<string, ApiBarrio["geometry"]>> {
  if (!_geoPromise) {
    _geoPromise = (async () => {
      const all = await Promise.all(ALL_MUNICIPIOS.map(_fetchMunicipioFeatures));
      for (const features of all) {
        for (const f of features) {
          _geoMap.set(geoKey(f.properties.nombre, f.properties.municipio), f.geometry);
        }
      }
      return _geoMap;
    })();
  }
  return _geoPromise;
}

let _featuresPromise: Promise<StaticFeature[]> | null = null;

async function loadStaticFeatures(): Promise<StaticFeature[]> {
  if (!_featuresPromise) {
    _featuresPromise = (async () => {
      const all = await Promise.all(ALL_MUNICIPIOS.map(_fetchMunicipioFeatures));
      return all.flat();
    })();
  }
  return _featuresPromise;
}

// ── Scraped stats cache (barrios_stats.json — all Valle de Aburrá) ────────────

type BarrioStats = {
  id: number;
  nombre: string;
  municipio: string;
  slug_municipio: string;
  precio_m2: number | null;
  arriendo: number | null;
  yield_anual: number | null;
  anos_recupero: number | null;
  n_venta: number;
  n_arriendo: number;
  lat: number;
  lng: number;
  estrato: number;
  score_salud: number | null;
  categoria_salud: string | null;
  n_remates_municipio: number;
  remates_por_100_listings: number | null;
};

let _statsPromise: Promise<Map<string, BarrioStats>> | null = null;

function loadBarrioStats(): Promise<Map<string, BarrioStats>> {
  if (!_statsPromise) {
    _statsPromise = (async () => {
      try {
        const r = await fetch("/data/barrios_stats.json");
        const list: BarrioStats[] = await r.json();
        const map = new Map<string, BarrioStats>();
        for (const b of list) {
          map.set(geoKey(b.nombre, b.municipio), b);
        }
        return map;
      } catch {
        return new Map();
      }
    })();
  }
  return _statsPromise;
}

// Derive a 0-100 investment score from yield_anual (p25=5.6 p50=6.5 p75=7.6)
function yieldToScore(y: number | null): number | null {
  if (y === null) return null;
  if (y >= 10) return 85;
  if (y >= 8)  return 70;
  if (y >= 6.5) return 55;
  if (y >= 5)  return 40;
  return 25;
}

function makeStatsBarrio(f: StaticFeature, stats: BarrioStats): ApiBarrio {
  const score = yieldToScore(stats.yield_anual);
  return {
    barrio_id: 800_000 + stats.id,
    nombre: f.properties.nombre,
    comuna: null,
    municipio: f.properties.municipio,
    estrato: stats.estrato || null,
    geometry: f.geometry,
    color_hex: null,
    excluir_inversion: false,
    scores: { corto: null, cat_corto: null, mediano: null, cat_mediano: null, largo: null, cat_largo: null, perfil_recomendado: null, score_activo: score },
    mercado: { precio_m2_cop: stats.precio_m2, precio_m2_usd: stats.precio_m2 ? Math.round(stats.precio_m2 / 4200) : null, arriendo_p50_cop: stats.arriendo, yield_bruto_pct: stats.yield_anual, anos_recupero: stats.anos_recupero, estado_precio: null, pbn_precio_justo: null, poi_precio_oferta: null },
    airbnb: { ocupacion_pct: null, adr_usd: null, adr_cop: null, yield_airbnb_pct: null, n_listings: null },
    seguridad: { score: null, categoria: null, zona_turistica: null, tendencia: null, nota: null },
    conectividad: { dist_metro_km: null, dist_parque_km: null, dist_mall_km: null, n_cafes_500m: null, n_coworking_1km: null, n_gimnasios_1km: null, n_yoga_1km: null, indice_nomada: null },
    verde: { indice_verde_pct: null, categoria: null, score_verde: null },
    liquidez: { score: stats.score_salud, categoria: stats.categoria_salud, tiempo_estimado_venta: null, nota_metodologia: null },
    oportunidad: { detectada: false, tipo: null, descripcion: null },
    valorizacion: { var_anual_pct: null, proyeccion_3anos_pct: null, proyeccion_5anos_pct: null, tendencia: null },
  };
}

function makeGreyBarrio(f: StaticFeature, id: number): ApiBarrio {
  return {
    barrio_id: id,
    nombre: f.properties.nombre,
    comuna: null,
    municipio: f.properties.municipio,
    estrato: null,
    geometry: f.geometry,
    color_hex: null,
    excluir_inversion: false,
    scores: { corto: null, cat_corto: null, mediano: null, cat_mediano: null, largo: null, cat_largo: null, perfil_recomendado: null, score_activo: null },
    mercado: { precio_m2_cop: null, precio_m2_usd: null, arriendo_p50_cop: null, yield_bruto_pct: null, anos_recupero: null, estado_precio: null, pbn_precio_justo: null, poi_precio_oferta: null },
    airbnb: { ocupacion_pct: null, adr_usd: null, adr_cop: null, yield_airbnb_pct: null, n_listings: null },
    seguridad: { score: null, categoria: null, zona_turistica: null, tendencia: null, nota: null },
    conectividad: { dist_metro_km: null, dist_parque_km: null, dist_mall_km: null, n_cafes_500m: null, n_coworking_1km: null, n_gimnasios_1km: null, n_yoga_1km: null, indice_nomada: null },
    verde: { indice_verde_pct: null, categoria: null, score_verde: null },
    liquidez: { score: null, categoria: null, tiempo_estimado_venta: null, nota_metodologia: null },
    oportunidad: { detectada: false, tipo: null, descripcion: null },
    valorizacion: { var_anual_pct: null, proyeccion_3anos_pct: null, proyeccion_5anos_pct: null, tendencia: null },
  };
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useBarrios(perfil?: string) {
  return useQuery({
    queryKey: ["barrios", perfil ?? null],
    queryFn: async () => {
      const url = perfil
        ? `${API_ENDPOINTS.barrios}?perfil=${encodeURIComponent(perfil)}`
        : API_ENDPOINTS.barrios;
      const data = await apiFetch<ApiBarrio[]>(url);
      return data.map(barrioToNeighborhood);
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function useBarriosRaw(perfil?: string) {
  return useQuery({
    queryKey: ["barrios-raw", perfil ?? null],
    queryFn: async () => {
      const params = new URLSearchParams({ fields: "map" });
      if (perfil) params.set("perfil", perfil);
      const url = `${API_ENDPOINTS.barrios}?${params}`;

      const [apiData, geoLookup, staticFeatures, statsMap] = await Promise.all([
        apiFetch<ApiBarrio[]>(url).catch(() => [] as ApiBarrio[]),
        loadStaticGeometry(),
        loadStaticFeatures(),
        loadBarrioStats(),
      ]);

      // Patch API barrios that lack geometry
      const apiKeys = new Set<string>();
      const patched = apiData.map((b) => {
        const key = geoKey(b.nombre ?? "", b.municipio ?? "");
        apiKeys.add(key);
        if (b.geometry) return b;
        return { ...b, geometry: geoLookup.get(key) ?? null };
      });

      // For barrios not in API: use scraped stats if available, else grey fallback
      let synId = 900_000;
      const extras = staticFeatures
        .filter((f) => {
          const key = geoKey(f.properties.nombre, f.properties.municipio);
          return !apiKeys.has(key);
        })
        .map((f) => {
          const key = geoKey(f.properties.nombre, f.properties.municipio);
          const stats = statsMap.get(key);
          return stats ? makeStatsBarrio(f, stats) : makeGreyBarrio(f, synId++);
        });

      return [...patched, ...extras];
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function useBarrio(id: number | null) {
  return useQuery({
    queryKey: ["barrio", id],
    queryFn: async () => {
      const data = await apiFetch<ApiBarrio>(API_ENDPOINTS.barrio(id!));
      return barrioToNeighborhood(data);
    },
    enabled: id != null,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function useComparar(ids: number[]) {
  return useQuery({
    queryKey: ["comparar", ids],
    queryFn: async () => {
      const url = `${API_ENDPOINTS.comparar}?ids=${ids.join(",")}`;
      const data = await apiFetch<ApiBarrio[]>(url);
      return data.map(barrioToNeighborhood);
    },
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    placeholderData: (prev) => prev,
  });
}

export function useCompararRaw(ids: number[]) {
  return useQuery({
    queryKey: ["comparar-raw", ids],
    queryFn: async () => {
      const url = `${API_ENDPOINTS.comparar}?ids=${ids.join(",")}`;
      return apiFetch<ApiBarrio[]>(url);
    },
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    placeholderData: (prev) => prev,
  });
}

export type CiudadStats = {
  barrios_analizados: number;
  yield_promedio: number | null;
  precio_m2_mediana: number | null;
  oportunidades_activas: number;
  top5: Array<{
    barrio_id: number;
    nombre: string | null;
    municipio: string | null;
    score: number | null;
    yield_bruto_pct: number | null;
    precio_m2_cop: number | null;
  }>;
};

export function useCiudadStats(perfil?: string) {
  return useQuery({
    queryKey: ["ciudad-stats", perfil ?? null],
    queryFn: async () => {
      const url = perfil
        ? `${API_ENDPOINTS.ciudadStats}?perfil=${encodeURIComponent(perfil)}`
        : API_ENDPOINTS.ciudadStats;
      return apiFetch<CiudadStats>(url);
    },
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}

export function useListings(
  barrioId: number | null,
  limit = 50,
  offset = 0,
  tipoOperacion?: "venta" | "arriendo",
) {
  return useQuery({
    queryKey: ["listings", barrioId, limit, offset, tipoOperacion ?? null],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (tipoOperacion) params.set("tipo_operacion", tipoOperacion);
      const url = `${API_ENDPOINTS.listings(barrioId!)}?${params}`;
      return apiFetch<ApiListingsResponse>(url);
    },
    enabled: barrioId != null,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
