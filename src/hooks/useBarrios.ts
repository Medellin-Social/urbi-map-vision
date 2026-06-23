import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";
import { API_ENDPOINTS } from "@/config/api";
import { barrioToNeighborhood, type ApiBarrio, type ApiListingsResponse } from "@/lib/adapters";
import { setScoreThresholds } from "@/config/mapColors";

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
  properties: { nombre: string; municipio: string; cd_comuna?: number | null; nombre_comuna?: string | null };
  geometry: ApiBarrio["geometry"];
};

const ALL_MUNICIPIOS = ["medellin", "bello", "envigado", "itagui", "sabaneta", "la_estrella"] as const;

// Maps GeoJSON "municipio" property (uppercase, no accents) → static listings slug
const MUNICIPIO_TO_SLUG: Record<string, string> = {
  MEDELLIN: "medellin",
  BELLO: "bello",
  ENVIGADO: "envigado",
  ITAGUI: "itagui",
  SABANETA: "sabaneta",
  "LA ESTRELLA": "la_estrella",
};

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
const _comunaMap = new Map<string, number | null>();
let _geoPromise: Promise<Map<string, ApiBarrio["geometry"]>> | null = null;

function loadStaticGeometry(): Promise<Map<string, ApiBarrio["geometry"]>> {
  if (!_geoPromise) {
    _geoPromise = (async () => {
      const all = await Promise.all(ALL_MUNICIPIOS.map(_fetchMunicipioFeatures));
      for (const features of all) {
        for (const f of features) {
          const key = geoKey(f.properties.nombre, f.properties.municipio);
          _geoMap.set(key, f.geometry);
          _comunaMap.set(key, f.properties.cd_comuna ?? null);
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
// Populated by makeStatsBarrio/makeGreyBarrio; consumed by useListings.
const _fakeBarrioIndex = new Map<number, { slug: string; statsNombre: string; cd_comuna: number | null }>();

// ── Commune names index: "slug:cd_comuna" → set of normalized barrio names ───
const _communeNamesIndex = new Map<string, Set<string>>();

function _registerCommune(slug: string, cdComuna: number | null, sn: string) {
  if (cdComuna == null) return;
  const key = `${slug}:${cdComuna}`;
  if (!_communeNamesIndex.has(key)) _communeNamesIndex.set(key, new Set());
  _communeNamesIndex.get(key)!.add(sn);
}

// ── Fake-barrio full data cache: maps synthetic IDs → ApiBarrio ───────────────
// Populated by makeStatsBarrio; consumed by useCompararRaw to avoid 404 on fake IDs.
const _fakeBarioData = new Map<number, ApiBarrio>();

// ── Static listings cache per municipio slug ──────────────────────────────────
type StaticListing = {
  id: number;
  tipo_operacion: string;
  tipo_inmueble?: string | null;
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
  antiguedad?: string | null;
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
  const _slug = stats.slug_municipio.replace(/-/g, "_");
  const _sn = stripAccents(stats.nombre.toUpperCase());
  const _cdComuna = f.properties.cd_comuna ?? null;
  _fakeBarrioIndex.set(fakeId, { slug: _slug, statsNombre: _sn, cd_comuna: _cdComuna });
  _registerCommune(_slug, _cdComuna, _sn);
  const barrio: ApiBarrio = {
    barrio_id: fakeId,
    nombre: f.properties.nombre,
    comuna: f.properties.nombre_comuna ?? null,
    municipio: f.properties.municipio,
    estrato: stats.estrato || null,
    cd_comuna: _cdComuna,
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
      precio_m2_usd: stats.precio_m2 ? Math.round(stats.precio_m2 / 4100) : null,
      precio_venta_promedio: null,
      arriendo_p50_cop: stats.arriendo,
      yield_bruto_pct: stats.yield_anual,
      anos_recupero: stats.anos_recupero,
      estado_precio: null,
      pbn_precio_justo: null,
      poi_precio_oferta: null,
      yield_renta_media_pct: null,
      precio_renta_media_p50: null,
      premium_vs_largo_pct: null,
      n_listings_renta_media: null,
      precio_accesible: null,
      presupuesto_max: null,
    },
    airbnb: { ocupacion_pct: null, ocupacion_p25_pct: null, ocupacion_p75_pct: null, adr_usd: null, adr_cop: null, yield_airbnb_pct: null, yield_airbnb_real_pct: null, n_listings: null, n_entire_home: null, n_private_room: null, n_superhosts: null, ingresos_anuales_p50_usd: null, ingresos_anuales_p50_cop: null, rating_promedio: null, reviews_promedio: null, diff_ocupacion_pct: null, diff_adr_cop: null },
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
  const _slug = MUNICIPIO_TO_SLUG[stripAccents(f.properties.municipio.toUpperCase())];
  const _sn = stripAccents(f.properties.nombre.toUpperCase());
  const _cdComuna = f.properties.cd_comuna ?? null;
  if (_slug) {
    _fakeBarrioIndex.set(id, { slug: _slug, statsNombre: _sn, cd_comuna: _cdComuna });
    _registerCommune(_slug, _cdComuna, _sn);
  }
  return {
    barrio_id: id,
    nombre: f.properties.nombre,
    comuna: f.properties.nombre_comuna ?? null,
    municipio: f.properties.municipio,
    estrato: null,
    cd_comuna: _cdComuna,
    geometry: f.geometry,
    color_hex: null,
    excluir_inversion: false,
    scores: { corto: null, cat_corto: null, mediano: null, cat_mediano: null, largo: null, cat_largo: null, perfil_recomendado: null, score_activo: null },
    mercado: { precio_m2_cop: null, precio_m2_usd: null, precio_venta_promedio: null, arriendo_p50_cop: null, yield_bruto_pct: null, anos_recupero: null, estado_precio: null, pbn_precio_justo: null, poi_precio_oferta: null, yield_renta_media_pct: null, precio_renta_media_p50: null, premium_vs_largo_pct: null, n_listings_renta_media: null, precio_accesible: null, presupuesto_max: null },
    airbnb: { ocupacion_pct: null, ocupacion_p25_pct: null, ocupacion_p75_pct: null, adr_usd: null, adr_cop: null, yield_airbnb_pct: null, yield_airbnb_real_pct: null, n_listings: null, n_entire_home: null, n_private_room: null, n_superhosts: null, ingresos_anuales_p50_usd: null, ingresos_anuales_p50_cop: null, rating_promedio: null, reviews_promedio: null, diff_ocupacion_pct: null, diff_adr_cop: null },
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

      // Patch API barrios that lack geometry, and attach cd_comuna from static GeoJSON
      const apiKeys = new Set<string>();
      const patched = apiData.map((b) => {
        const key = geoKey(b.nombre ?? "", b.municipio ?? "");
        apiKeys.add(key);
        const cd_comuna = _comunaMap.get(key) ?? null;
        if (b.geometry) return { ...b, cd_comuna };
        return { ...b, geometry: geoLookup.get(key) ?? null, cd_comuna };
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
  ultima_actualizacion_listings: string | null;
  top5: Array<{
    barrio_id: number;
    nombre: string | null;
    municipio: string | null;
    score: number | null;
    yield_bruto_pct: number | null;
    precio_m2_cop: number | null;
  }>;
};

export function useScoreThresholds() {
  return useQuery({
    queryKey: ["score-thresholds"],
    queryFn: () => apiFetch<Record<string, [number, number, number]>>(API_ENDPOINTS.scoreThresholds),
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });
}

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

export type AllListingsFilters = {
  municipio?: string | null;
  barrio_id?: number | null;
  tipo_operacion?: string | null;
  tipo_inmueble?: string | null;
  precio_min?: number | null;
  precio_max?: number | null;
  area_min?: number | null;
  habitaciones?: number | null;
  limit?: number;
  offset?: number;
};

export type ListingFull = {
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
  lat?: number | null;
  lon?: number | null;
  barrio_id?: number | null;
  barrio_nombre?: string | null;
  municipio?: string | null;
  buena_oferta?: boolean | null;
  pct_bajo_mediana?: number | null;
};

export type AllListingsResponse = {
  total: number;
  listings: ListingFull[];
};

export function useAllListings(filters: AllListingsFilters) {
  return useQuery({
    queryKey: ["all-listings", filters],
    queryFn: async (): Promise<AllListingsResponse> => {
      const params = new URLSearchParams();
      if (filters.municipio) params.set("municipio", filters.municipio);
      if (filters.barrio_id != null) params.set("barrio_id", String(filters.barrio_id));
      if (filters.tipo_operacion) params.set("tipo_operacion", filters.tipo_operacion);
      if (filters.tipo_inmueble) params.set("tipo_inmueble", filters.tipo_inmueble);
      if (filters.precio_min != null) params.set("precio_min", String(filters.precio_min));
      if (filters.precio_max != null) params.set("precio_max", String(filters.precio_max));
      if (filters.area_min != null) params.set("area_min", String(filters.area_min));
      if (filters.habitaciones != null) params.set("habitaciones", String(filters.habitaciones));
      params.set("limit", String(filters.limit ?? 200));
      params.set("offset", String(filters.offset ?? 0));
      const url = `${API_ENDPOINTS.allListings}?${params}`;
      return apiFetch<AllListingsResponse>(url);
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export type ListingsApiFilters = {
  area_min?: number | null;
  area_max?: number | null;
  banos?: number | null;
  antiguedad?: string | null;
  amenidades?: string[] | null;
};

export function useListings(
  barrioId: number | null,
  limit = 50,
  offset = 0,
  tipoOperacion?: "venta" | "arriendo",
  onlyPremium = false,
  extraFilters?: ListingsApiFilters,
  cdComuna?: number,
  municipioNombre?: string,
) {
  return useQuery({
    queryKey: ["listings", barrioId, limit, offset, tipoOperacion ?? null, onlyPremium, extraFilters ?? null, cdComuna ?? null, municipioNombre ?? null],
    queryFn: async (): Promise<ApiListingsResponse> => {
      // Static path for synthetic barrios (non-API municipalities)
      const fake = barrioId != null ? _fakeBarrioIndex.get(barrioId) : undefined;
      if (fake) {
        const all = await loadStaticListings(fake.slug);
        let filtered = all.filter((l) => {
          const lb = stripAccents((l.barrio ?? "").toUpperCase());
          return lb === fake.statsNombre && (!tipoOperacion || l.tipo_operacion === tipoOperacion);
        });
        // Apply extraFilters client-side (static path has no API to delegate to)
        if (extraFilters) {
          if (extraFilters.area_min != null) filtered = filtered.filter((l) => l.area_m2 != null && l.area_m2 >= extraFilters!.area_min!);
          if (extraFilters.area_max != null) filtered = filtered.filter((l) => l.area_m2 != null && l.area_m2 <= extraFilters!.area_max!);
          if (extraFilters.banos != null && extraFilters.banos > 0) filtered = filtered.filter((l) => l.banos != null && l.banos >= extraFilters!.banos!);
          if (extraFilters.antiguedad && extraFilters.antiguedad !== "Todas")
            filtered = filtered.filter((l) => l.antiguedad === extraFilters!.antiguedad);
        }
        const page = filtered.slice(offset, offset + limit);
        return {
          total: filtered.length,
          listings: page.map((l) => ({
            id: l.id,
            tipo_operacion: l.tipo_operacion ?? undefined,
            tipo_inmueble: l.tipo_inmueble ?? null,
            precio_cop: l.precio_cop,
            precio_usd: l.precio_cop ? Math.round(l.precio_cop / 4100) : null,
            area_m2: l.area_m2,
            precio_m2: l.precio_m2,
            habitaciones: l.habitaciones ?? null,
            banos: l.banos ?? null,
            direccion_raw: l.direccion_raw ?? null,
            url: l.url ?? null,
            fuente: l.fuente ?? "metrocuadrado",
            lat: l.lat,
            lon: l.lng,
            barrio_nombre: l.barrio ?? null,
          })),
        };
      }

      // API path — expansion handled server-side (expands only when barrio has < 5 listings)
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (tipoOperacion) params.set("tipo_operacion", tipoOperacion);
      if (barrioId != null) params.set("barrio_id", String(barrioId));
      if (cdComuna != null) params.set("cd_comuna", String(cdComuna));
      if (municipioNombre) params.set("municipio", municipioNombre);
      if (onlyPremium) params.set("only_premium", "true");
      if (extraFilters?.area_min != null) params.set("area_min", String(extraFilters.area_min));
      if (extraFilters?.area_max != null) params.set("area_max", String(extraFilters.area_max));
      if (extraFilters?.banos != null) params.set("banos", String(extraFilters.banos));
      if (extraFilters?.antiguedad) params.set("antiguedad", extraFilters.antiguedad);
      if (extraFilters?.amenidades?.length) {
        for (const a of extraFilters.amenidades) params.append("amenidades", a);
      }
      return apiFetch<ApiListingsResponse>(`${API_ENDPOINTS.allListings}?${params}`);
    },
    enabled: barrioId != null || cdComuna != null || !!municipioNombre,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

// ── Lightweight selector hooks (simulador) ────────────────────────────────────

export type ComunaItem = {
  key: string;
  label: string;
  municipio: string;
  n_barrios: number;
};

export type BarrioComunaItem = {
  id: number;
  nombre: string;
  municipio: string;
  comuna: string | null;
  yield_bruto_pct: number | null;
  precio_m2_cop: number | null;
};

export function useBarriosComunas() {
  return useQuery({
    queryKey: ["barrios-comunas"],
    queryFn: () => apiFetch<ComunaItem[]>(`${API_ENDPOINTS.barrios}/comunas`),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}

export function useBarriosPorComuna(key: string | null) {
  return useQuery({
    queryKey: ["barrios-por-comuna", key],
    queryFn: () =>
      apiFetch<BarrioComunaItem[]>(
        `${API_ENDPOINTS.barrios}/por-comuna/${encodeURIComponent(key!)}`,
      ),
    enabled: key !== null,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

// ── Comunas metrics — métricas por cd_comuna para colorear polígonos estáticos ─

export type ComunaMetrics = {
  cd_comuna: number;
  nombre: string;
  municipio: string;
  color_hex: string;
  score_promedio: number | null;
  precio_m2_cop: number | null;
  yield_promedio: number | null;
  arriendo_cop: number | null;
  liquidez_score: number | null;
  total_barrios: number;
  n_venta: number;
  n_arriendo: number;
  has_data: boolean;
  slug_municipio: string;
  is_municipio: boolean;
};

export function useComunasMetrics(perfil?: string, target?: string) {
  return useQuery<Record<string, ComunaMetrics>>({
    queryKey: ["comunas-metrics", perfil ?? null, target ?? "investor"],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (perfil) params.set("perfil", perfil);
      if (target) params.set("target", target);
      const res = await apiFetch<{ metrics: Record<string, ComunaMetrics> }>(
        `${API_ENDPOINTS.comunasGeoJSON}?${params}`,
      );
      return res.metrics;
    },
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });
}
