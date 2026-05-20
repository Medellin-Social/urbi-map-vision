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

// Normalize barrio names to bridge GeoJSON (datos.gov.co) vs FincaRaiz naming
// GeoJSON uses "B. NOMBRE", stats use "NOMBRE" or "LA NOMBRE"
function normalizeNombre(n: string): string {
  return n
    .replace(/^B\.\s+/i, "")
    .replace(/^ASENTAMIENTO\s+DE\s+HECHO\s+/i, "ASENTAMIENTO ")
    .replace(/^ASENT\.\s+DE\s+HECHO\s+/i, "ASENTAMIENTO ")
    .replace(/^BARRIO\s+/i, "")
    .replace(/^URB\.\s+/i, "")
    .replace(/^(LA|EL|LOS|LAS|SAN|DE|DEL)\s+/i, "")
    .trim();
}

function statsKey(nombre: string, municipio: string): string {
  return geoKey(normalizeNombre(nombre), municipio);
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
  // scores
  score_corto: number | null;
  categoria_corto: string | null;
  score_mediano: number | null;
  categoria_mediano: string | null;
  score_largo: number | null;
  categoria_largo: string | null;
  perfil_recomendado: string | null;
  // verde
  indice_verde_pct: number | null;
  categoria_verde: string | null;
  score_verde: number | null;
  // conectividad
  dist_metro_km: number | null;
  dist_parque_km: number | null;
  dist_mall_km: number | null;
  n_cafes_500m: number | null;
  n_coworking_1km: number | null;
  n_gimnasios_1km: number | null;
  n_yoga_1km: number | null;
  indice_nomada: number | null;
  // liquidez
  score_salud: number | null;
  categoria_salud: string | null;
  tiempo_estimado_venta: string | null;
  // oportunidad
  oportunidad_detectada: boolean | null;
  tipo_oportunidad: string | null;
  descripcion_oportunidad: string | null;
  // seguridad
  score_seguridad: number | null;
  categoria_seguridad: string | null;
  nota_seguridad: string | null;
  // remates
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
          map.set(statsKey(b.nombre, b.municipio), b);
        }
        return map;
      } catch {
        return new Map();
      }
    })();
  }
  return _statsPromise;
}

// ── Fake-barrio index: maps synthetic IDs → static listing lookup params ─────
// Populated by makeStatsBarrio; consumed by useListings for non-API municipios.
const _fakeBarrioIndex = new Map<number, { slug: string; statsNombre: string }>();

// ── Fake-barrio full data cache: maps synthetic IDs → ApiBarrio ───────────────
// Populated by makeStatsBarrio; consumed by useCompararRaw to avoid 404 on fake IDs.
const _fakeBarioData = new Map<number, ApiBarrio>();

// ── Static listings cache per municipio slug ──────────────────────────────────
type StaticListing = {
  id: number;
  tipo_operacion: string;
  precio_cop: number | null;
  area_m2: number | null;
  precio_m2: number | null;
  estrato: number | null;
  lat: number | null;
  lng: number | null;
  barrio: string;
  url?: string | null;
  habitaciones?: number | null;
  banos?: number | null;
  direccion_raw?: string | null;
  fuente?: string | null;
};

const _listingsCache = new Map<string, Promise<StaticListing[]>>();

function loadStaticListings(slug: string): Promise<StaticListing[]> {
  if (!_listingsCache.has(slug)) {
    _listingsCache.set(
      slug,
      fetch(`/data/listings_${slug}.json`)
        .then((r) => r.json())
        .catch(() => [] as StaticListing[]),
    );
  }
  return _listingsCache.get(slug)!;
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

function pickScoreActivo(stats: BarrioStats, perfil?: string): number | null {
  if (perfil === "airbnb")     return stats.score_corto  ?? yieldToScore(stats.yield_anual);
  if (perfil === "mediano_plazo" || perfil === "nomadas")    return stats.score_mediano ?? yieldToScore(stats.yield_anual);
  // largo_plazo, valorizacion, or no perfil — score_largo is most fair for non-Airbnb municipalities
  return stats.score_largo ?? stats.score_mediano ?? yieldToScore(stats.yield_anual);
}

function makeStatsBarrio(f: StaticFeature, stats: BarrioStats, perfil?: string): ApiBarrio {
  const scoreActivo = pickScoreActivo(stats, perfil);
  const fakeId = 800_000 + stats.id;
  _fakeBarrioIndex.set(fakeId, { slug: stats.slug_municipio.replace(/-/g, "_"), statsNombre: stats.nombre.toUpperCase() });
  const barrio: ApiBarrio = {
    barrio_id: fakeId,
    nombre: f.properties.nombre,
    comuna: null,
    municipio: f.properties.municipio,
    estrato: stats.estrato || null,
    geometry: f.geometry,
    color_hex: null,
    excluir_inversion: false,
    scores: {
      corto: stats.score_corto,
      cat_corto: stats.categoria_corto,
      mediano: stats.score_mediano,
      cat_mediano: stats.categoria_mediano,
      largo: stats.score_largo,
      cat_largo: stats.categoria_largo,
      perfil_recomendado: stats.perfil_recomendado,
      score_activo: scoreActivo,
    },
    mercado: {
      precio_m2_cop: stats.precio_m2,
      precio_m2_usd: stats.precio_m2 ? Math.round(stats.precio_m2 / 4200) : null,
      arriendo_p50_cop: stats.arriendo,
      yield_bruto_pct: stats.yield_anual,
      anos_recupero: stats.anos_recupero,
      estado_precio: null,
      pbn_precio_justo: null,
      poi_precio_oferta: null,
      yield_renta_media_pct: null,
      precio_renta_media_p50: null,
    },
    airbnb: { ocupacion_pct: null, adr_usd: null, adr_cop: null, yield_airbnb_pct: null, n_listings: null },
    seguridad: {
      score: stats.score_seguridad,
      categoria: stats.categoria_seguridad,
      zona_turistica: null,
      tendencia: null,
      nota: stats.nota_seguridad,
    },
    conectividad: {
      dist_metro_km: stats.dist_metro_km,
      dist_parque_km: stats.dist_parque_km,
      dist_mall_km: stats.dist_mall_km,
      n_cafes_500m: stats.n_cafes_500m,
      n_coworking_1km: stats.n_coworking_1km,
      n_gimnasios_1km: stats.n_gimnasios_1km,
      n_yoga_1km: stats.n_yoga_1km,
      indice_nomada: stats.indice_nomada,
    },
    verde: {
      indice_verde_pct: stats.indice_verde_pct,
      categoria: stats.categoria_verde,
      score_verde: stats.score_verde,
    },
    liquidez: {
      score: stats.score_salud,
      categoria: stats.categoria_salud,
      tiempo_estimado_venta: stats.tiempo_estimado_venta,
      nota_metodologia: null,
    },
    oportunidad: {
      detectada: stats.oportunidad_detectada ?? false,
      tipo: stats.tipo_oportunidad,
      descripcion: stats.descripcion_oportunidad,
    },
    valorizacion: { var_anual_pct: null, proyeccion_3anos_pct: null, proyeccion_5anos_pct: null, tendencia: null },
    n_remates_municipio: stats.n_remates_municipio,
  };
  _fakeBarioData.set(fakeId, barrio);
  return barrio;
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
    mercado: { precio_m2_cop: null, precio_m2_usd: null, arriendo_p50_cop: null, yield_bruto_pct: null, anos_recupero: null, estado_precio: null, pbn_precio_justo: null, poi_precio_oferta: null, yield_renta_media_pct: null, precio_renta_media_p50: null },
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
          const key = statsKey(f.properties.nombre, f.properties.municipio);
          const stats = statsMap.get(key);
          return stats ? makeStatsBarrio(f, stats, perfil) : makeGreyBarrio(f, synId++);
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

const FAKE_ID_THRESHOLD = 800_000;

export function useCompararRaw(ids: number[]) {
  return useQuery({
    queryKey: ["comparar-raw", ids],
    queryFn: async () => {
      const realIds = ids.filter((id) => id < FAKE_ID_THRESHOLD);
      const fakeIds = ids.filter((id) => id >= FAKE_ID_THRESHOLD);

      const [apiResults] = await Promise.all([
        realIds.length > 0
          ? apiFetch<ApiBarrio[]>(`${API_ENDPOINTS.comparar}?ids=${realIds.join(",")}`)
          : Promise.resolve([] as ApiBarrio[]),
        // Trigger geometry+stats load so _fakeBarioData gets populated for fake IDs
        fakeIds.length > 0 ? Promise.all([loadStaticGeometry(), loadBarrioStats()]) : Promise.resolve([]),
      ]);

      const fakeResults: ApiBarrio[] = fakeIds
        .map((id) => _fakeBarioData.get(id))
        .filter((b): b is ApiBarrio => b != null);

      return [...apiResults, ...fakeResults];
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
    queryFn: async (): Promise<ApiListingsResponse> => {
      // Static path for synthetic barrios (non-API municipalities)
      const fake = barrioId != null ? _fakeBarrioIndex.get(barrioId) : undefined;
      if (fake) {
        const all = await loadStaticListings(fake.slug);
        const filtered = all.filter(
          (l) =>
            l.barrio === fake.statsNombre &&
            (!tipoOperacion || l.tipo_operacion === tipoOperacion),
        );
        const page = filtered.slice(offset, offset + limit);
        return {
          total: filtered.length,
          listings: page.map((l) => ({
            id: l.id,
            tipo_operacion: l.tipo_operacion ?? undefined,
            precio_cop: l.precio_cop,
            precio_usd: l.precio_cop ? Math.round(l.precio_cop / 4200) : null,
            area_m2: l.area_m2,
            precio_m2: l.precio_m2,
            habitaciones: l.habitaciones ?? null,
            banos: l.banos ?? null,
            direccion_raw: l.direccion_raw ?? null,
            url: l.url ?? null,
            fuente: l.fuente ?? "metrocuadrado",
          })),
        };
      }

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
