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
  // API-sourced fields (undefined when using hardcoded NEIGHBORHOODS)
  score_activo?: number | null;
  estado_precio?: string | null;
  oportunidad?: { detectada: boolean | null; tipo: string | null; descripcion: string | null } | null;
  liquidez_api?: { score: number | null; categoria: string | null; tiempo_estimado_venta: string | null } | null;
};

export const NEIGHBORHOODS: Neighborhood[] = [
  { id: 1, nombre: "EL POBLADO", comuna: "El Poblado", municipio: "Medellín", estrato: 5, precio_m2: 8200000, arriendo: 6500000, yield: 9.5, anos_recupero: 10.5, dist_metro: 2.1, dist_parque: 0.3, dist_mall: 0.8, n_venta: 37, n_arriendo: 42, lat: 6.2087, lng: -75.5659 },
  { id: 2, nombre: "LAURELES", comuna: "Laureles-Estadio", municipio: "Medellín", estrato: 4, precio_m2: 6400000, arriendo: 4400000, yield: 8.2, anos_recupero: 12.1, dist_metro: 0.8, dist_parque: 0.2, dist_mall: 1.2, n_venta: 28, n_arriendo: 13, lat: 6.2442, lng: -75.5974 },
  { id: 3, nombre: "BELÉN", comuna: "Belén", municipio: "Medellín", estrato: 3, precio_m2: 5945000, arriendo: 2500000, yield: 5.93, anos_recupero: 16.86, dist_metro: 1.9, dist_parque: 0.5, dist_mall: 2.1, n_venta: 12, n_arriendo: 5, lat: 6.2271, lng: -75.6189 },
  { id: 4, nombre: "ROBLEDO", comuna: "Robledo", municipio: "Medellín", estrato: 3, precio_m2: 4528000, arriendo: 2300000, yield: 8.07, anos_recupero: 12.39, dist_metro: 1.2, dist_parque: 0.8, dist_mall: 3.1, n_venta: 5, n_arriendo: 2, lat: 6.2731, lng: -75.6089 },
  { id: 5, nombre: "ARANJUEZ", comuna: "Aranjuez", municipio: "Medellín", estrato: 2, precio_m2: 3629000, arriendo: 1600000, yield: 7.11, anos_recupero: 14.06, dist_metro: 0.5, dist_parque: 0.3, dist_mall: 2.8, n_venta: 1, n_arriendo: 1, lat: 6.2891, lng: -75.5612 },
  { id: 6, nombre: "ESTADIO", comuna: "Laureles-Estadio", municipio: "Medellín", estrato: 4, precio_m2: 6140000, arriendo: 3500000, yield: 7.24, anos_recupero: 13.81, dist_metro: 0.3, dist_parque: 0.4, dist_mall: 0.9, n_venta: 2, n_arriendo: 1, lat: 6.2567, lng: -75.5891 },
  { id: 7, nombre: "EL RODEO", comuna: "Robledo", municipio: "Medellín", estrato: 3, precio_m2: 4687000, arriendo: 2700000, yield: 12.62, anos_recupero: 7.92, dist_metro: 2.8, dist_parque: 0.6, dist_mall: 3.5, n_venta: 3, n_arriendo: 1, lat: 6.2812, lng: -75.6201 },
];

export const CITY_STATS = {
  yield_promedio: 6.8,
  barrios_analizados: 49,
  precio_m2_mediana: 6_100_000,
};

/** Build an approximated hexagonal polygon around a point (fallback if no GeoJSON). */
function hexAround(lng: number, lat: number, radiusKm = 0.7): [number, number][] {
  const coords: [number, number][] = [];
  const dLat = radiusKm / 111;
  const dLng = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    coords.push([lng + Math.cos(a) * dLng, lat + Math.sin(a) * dLat]);
  }
  coords.push(coords[0]);
  return coords;
}

export function buildNeighborhoodsGeoJSON() {
  return {
    type: "FeatureCollection" as const,
    features: NEIGHBORHOODS.map((n) => ({
      type: "Feature" as const,
      properties: {
        id: n.id,
        nombre: n.nombre,
        comuna: n.comuna,
        yield: n.yield,
        precio_m2: n.precio_m2,
      },
      geometry: {
        type: "Polygon" as const,
        coordinates: [hexAround(n.lng, n.lat, 0.85)],
      },
    })),
  };
}

export function valorizacionHistorica(
  seed: number,
  estrato: number
): { year: string; acumulado: number; varAnual: number }[] {
  const baseVars = [8.6, 7.3, 6.8, 7.6, 4.4, 6.8, 7.5, 10.4, 10.2, 10.6];
  const estratoMult: Record<number, number> = { 1: 0.85, 2: 0.90, 3: 1.00, 4: 1.05, 5: 1.12, 6: 1.18 };
  const mult = estratoMult[estrato] ?? 1.0;

  const result: { year: string; acumulado: number; varAnual: number }[] = [
    { year: "2015", acumulado: 0, varAnual: 0 },
  ];

  for (let i = 0; i < baseVars.length; i++) {
    const noise = Math.sin(seed * 2.1 + i * 1.3) * 1.0;
    const v = baseVars[i] * mult + noise;
    const prev = result[result.length - 1].acumulado;
    const acumulado = (1 + prev / 100) * (1 + v / 100) * 100 - 100;
    result.push({
      year: String(2016 + i),
      acumulado: Math.round(acumulado * 10) / 10,
      varAnual: Math.round(v * 10) / 10,
    });
  }

  return result;
}

export function priceTrend(seed: number): { mes: string; precio: number }[] {
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  let v = 100;
  const out: { mes: string; precio: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const r = Math.sin(seed * 1.3 + i * 0.7) * 2 + Math.cos(seed + i * 0.3) * 1.5;
    v = Math.max(85, Math.min(120, v + r + 0.6));
    out.push({ mes: months[i], precio: Math.round(v * 100) / 100 });
  }
  return out;
}

export type Listing = {
  id: string;
  barrio_id: number;
  tipo_operacion: "venta" | "arriendo";
  tipo_inmueble: "apartamento" | "casa";
  precio: number;
  area_m2: number;
  habitaciones: number;
  banos: number;
  precio_m2: number;
  buena_oferta: boolean;
};

export function listingsFor(n: Neighborhood): Listing[] {
  const items: Listing[] = [];
  const base: Array<{ op: "venta" | "arriendo"; tipo: "apartamento" | "casa"; areaMul: number; habs: number; banos: number; mul: number }> = [
    { op: "venta", tipo: "apartamento", areaMul: 75, habs: 2, banos: 2, mul: 0.92 },
    { op: "venta", tipo: "apartamento", areaMul: 110, habs: 3, banos: 3, mul: 1.05 },
    { op: "arriendo", tipo: "apartamento", areaMul: 90, habs: 2, banos: 2, mul: 1.0 },
  ];
  base.forEach((b, i) => {
    const area = b.areaMul + ((n.id * 7 + i * 11) % 18);
    const isArriendo = b.op === "arriendo";
    const unit = isArriendo ? n.arriendo / 90 : n.precio_m2 * b.mul;
    const precio = Math.round(unit * area / 1000) * 1000;
    const precio_m2 = Math.round(precio / area);
    items.push({
      id: `${n.id}-${i}`,
      barrio_id: n.id,
      tipo_operacion: b.op,
      tipo_inmueble: b.tipo,
      precio,
      area_m2: area,
      habitaciones: b.habs,
      banos: b.banos,
      precio_m2,
      buena_oferta: !isArriendo && precio_m2 < n.precio_m2 * 0.97,
    });
  });
  return items;
}
