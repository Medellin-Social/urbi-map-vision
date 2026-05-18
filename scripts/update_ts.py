"""
Generate updated neighborhoods.ts and marketActivity.ts from aggregated barrio data.

Input:  data/processed/barrios_stats.json
Output: ../src/data/neighborhoods.ts      (overwrites)
        ../src/data/marketActivity.ts      (overwrites NEIGHBORHOODS-dependent sections)

Strategy:
  - Merge scraped barrios with existing hardcoded data.
  - Scraped data takes precedence for price fields.
  - Hardcoded dist_metro/dist_parque/dist_mall preserved where known.
  - Barrios without lat/lng are skipped (can't place on map).

Run:
  python update_ts.py
  python update_ts.py --dry-run      # print to stdout, don't write
"""

import argparse
import json
from pathlib import Path

PROCESSED = Path(__file__).parent / "data" / "processed" / "barrios_stats.json"
REMATES_POR_MUNICIPIO = Path(__file__).parent / "data" / "processed" / "remates_por_municipio.json"
TS_NEIGHBORHOODS = Path(__file__).parent.parent / "src" / "data" / "neighborhoods.ts"
TS_MARKET = Path(__file__).parent.parent / "src" / "data" / "marketActivity.ts"

# Hardcoded distance data to preserve (keyed by barrio nombre upper)
KNOWN_DISTANCES: dict[str, dict] = {
    "EL POBLADO":   {"dist_metro": 2.1, "dist_parque": 0.3, "dist_mall": 0.8,  "estrato": 5},
    "LAURELES":     {"dist_metro": 0.8, "dist_parque": 0.2, "dist_mall": 1.2,  "estrato": 4},
    "BELÉN":        {"dist_metro": 1.9, "dist_parque": 0.5, "dist_mall": 2.1,  "estrato": 3},
    "ROBLEDO":      {"dist_metro": 1.2, "dist_parque": 0.8, "dist_mall": 3.1,  "estrato": 3},
    "ARANJUEZ":     {"dist_metro": 0.5, "dist_parque": 0.3, "dist_mall": 2.8,  "estrato": 2},
    "ESTADIO":      {"dist_metro": 0.3, "dist_parque": 0.4, "dist_mall": 0.9,  "estrato": 4},
    "EL RODEO":     {"dist_metro": 2.8, "dist_parque": 0.6, "dist_mall": 3.5,  "estrato": 3},
    # Medellín extra
    "LA AMERICA":   {"dist_metro": 0.6, "dist_parque": 0.4, "dist_mall": 1.1,  "estrato": 3},
    "CASTILLA":     {"dist_metro": 0.9, "dist_parque": 0.7, "dist_mall": 2.3,  "estrato": 2},
    "MANRIQUE":     {"dist_metro": 1.1, "dist_parque": 0.5, "dist_mall": 3.2,  "estrato": 2},
    "SAN JAVIER":   {"dist_metro": 0.4, "dist_parque": 0.6, "dist_mall": 2.8,  "estrato": 2},
    "BUENOS AIRES": {"dist_metro": 1.3, "dist_parque": 0.4, "dist_mall": 2.1,  "estrato": 3},
    "EL CENTRO":    {"dist_metro": 0.1, "dist_parque": 0.2, "dist_mall": 0.5,  "estrato": 2},
    "GUAYABAL":     {"dist_metro": 1.8, "dist_parque": 0.9, "dist_mall": 2.4,  "estrato": 2},
    "VILLA HERMOSA":{"dist_metro": 1.5, "dist_parque": 0.6, "dist_mall": 3.1,  "estrato": 2},
    "DOCE DE OCTUBRE":{"dist_metro":1.0,"dist_parque": 0.8, "dist_mall": 2.6,  "estrato": 2},
    # Otros municipios (sin metro)
    "CENTRO DE ENVIGADO":{"dist_metro":4.2,"dist_parque":0.3,"dist_mall":0.9,  "estrato": 4},
    "LAS VEGAS":    {"dist_metro": 3.8, "dist_parque": 0.5, "dist_mall": 1.2,  "estrato": 4},
    "CENTRO DE ITAGÜÍ":{"dist_metro":5.1,"dist_parque":0.4,"dist_mall":0.7,    "estrato": 3},
    "CENTRO DE BELLO":{"dist_metro": 0.3,"dist_parque":0.5,"dist_mall":1.1,    "estrato": 2},
    "NIQUÍA":       {"dist_metro": 0.2, "dist_parque": 0.6, "dist_mall": 1.4,  "estrato": 2},
    "CENTRO DE SABANETA":{"dist_metro":6.2,"dist_parque":0.3,"dist_mall":0.6,  "estrato": 4},
}

HARDCODED_FALLBACKS = [
    {"id": 1,  "nombre": "EL POBLADO",  "comuna": "El Poblado",       "municipio": "Medellín",
     "estrato": 5, "precio_m2": 8200000, "arriendo": 6500000, "yield": 9.5, "anos_recupero": 10.5,
     "dist_metro": 2.1, "dist_parque": 0.3, "dist_mall": 0.8, "n_venta": 37, "n_arriendo": 42,
     "lat": 6.2087, "lng": -75.5659},
    {"id": 2,  "nombre": "LAURELES",    "comuna": "Laureles-Estadio",  "municipio": "Medellín",
     "estrato": 4, "precio_m2": 6400000, "arriendo": 4400000, "yield": 8.2, "anos_recupero": 12.1,
     "dist_metro": 0.8, "dist_parque": 0.2, "dist_mall": 1.2, "n_venta": 28, "n_arriendo": 13,
     "lat": 6.2442, "lng": -75.5974},
    {"id": 3,  "nombre": "BELÉN",       "comuna": "Belén",             "municipio": "Medellín",
     "estrato": 3, "precio_m2": 5945000, "arriendo": 2500000, "yield": 5.93,"anos_recupero": 16.86,
     "dist_metro": 1.9, "dist_parque": 0.5, "dist_mall": 2.1, "n_venta": 12, "n_arriendo": 5,
     "lat": 6.2271, "lng": -75.6189},
    {"id": 4,  "nombre": "ROBLEDO",     "comuna": "Robledo",           "municipio": "Medellín",
     "estrato": 3, "precio_m2": 4528000, "arriendo": 2300000, "yield": 8.07,"anos_recupero": 12.39,
     "dist_metro": 1.2, "dist_parque": 0.8, "dist_mall": 3.1, "n_venta": 5,  "n_arriendo": 2,
     "lat": 6.2731, "lng": -75.6089},
    {"id": 5,  "nombre": "ARANJUEZ",    "comuna": "Aranjuez",          "municipio": "Medellín",
     "estrato": 2, "precio_m2": 3629000, "arriendo": 1600000, "yield": 7.11,"anos_recupero": 14.06,
     "dist_metro": 0.5, "dist_parque": 0.3, "dist_mall": 2.8, "n_venta": 1,  "n_arriendo": 1,
     "lat": 6.2891, "lng": -75.5612},
    {"id": 6,  "nombre": "ESTADIO",     "comuna": "Laureles-Estadio",  "municipio": "Medellín",
     "estrato": 4, "precio_m2": 6140000, "arriendo": 3500000, "yield": 7.24,"anos_recupero": 13.81,
     "dist_metro": 0.3, "dist_parque": 0.4, "dist_mall": 0.9, "n_venta": 2,  "n_arriendo": 1,
     "lat": 6.2567, "lng": -75.5891},
    {"id": 7,  "nombre": "EL RODEO",    "comuna": "Robledo",           "municipio": "Medellín",
     "estrato": 3, "precio_m2": 4687000, "arriendo": 2700000, "yield": 12.62,"anos_recupero":7.92,
     "dist_metro": 2.8, "dist_parque": 0.6, "dist_mall": 3.5, "n_venta": 3,  "n_arriendo": 1,
     "lat": 6.2812, "lng": -75.6201},
]


def load_scraped() -> list[dict]:
    if not PROCESSED.exists():
        print(f"WARN: {PROCESSED} not found — using only hardcoded data")
        return []
    with open(PROCESSED, encoding="utf-8") as f:
        return json.load(f)


def load_remates_scores() -> dict[str, dict]:
    if not REMATES_POR_MUNICIPIO.exists():
        return {}
    with open(REMATES_POR_MUNICIPIO, encoding="utf-8") as f:
        return json.load(f)


def merge_barrios(scraped: list[dict], remates_scores: dict[str, dict] | None = None) -> list[dict]:
    """Merge scraped data with hardcoded fallbacks."""
    # Build lookup of scraped by nombre (upper)
    scraped_by_nombre: dict[str, dict] = {b["nombre"].upper(): b for b in scraped}

    result: list[dict] = []
    used_ids: set[int] = set()

    # Start with hardcoded — update with scraped prices if available
    for hc in HARDCODED_FALLBACKS:
        key = hc["nombre"].upper()
        merged = dict(hc)
        if key in scraped_by_nombre:
            sc = scraped_by_nombre[key]
            if sc.get("precio_m2"):
                merged["precio_m2"] = sc["precio_m2"]
            if sc.get("arriendo"):
                merged["arriendo"] = sc["arriendo"]
            if sc.get("yield_anual"):
                merged["yield"] = sc["yield_anual"]
            if sc.get("anos_recupero"):
                merged["anos_recupero"] = sc["anos_recupero"]
            if sc.get("n_venta"):
                merged["n_venta"] = sc["n_venta"]
            if sc.get("n_arriendo"):
                merged["n_arriendo"] = sc["n_arriendo"]
            del scraped_by_nombre[key]  # consumed
        result.append(merged)
        used_ids.add(merged["id"])

    # Add new scraped barrios not in hardcoded
    next_id = max(used_ids) + 1 if used_ids else 100
    for barrio in scraped:
        key = barrio["nombre"].upper()
        if key not in scraped_by_nombre:
            continue  # already consumed above
        if not barrio.get("lat") or not barrio.get("lng"):
            continue  # can't place on map

        # Get distance/estrato data if known
        distances = KNOWN_DISTANCES.get(key, {})

        mun = barrio["municipio"]
        rs = (remates_scores or {}).get(mun, {})
        r = {
            "id": next_id,
            "nombre": barrio["nombre"],
            "comuna": barrio["nombre"].title(),  # best guess until catastro
            "municipio": mun,
            "estrato": distances.get("estrato", barrio.get("estrato") or 0),
            "precio_m2": barrio.get("precio_m2") or 0,
            "arriendo": barrio.get("arriendo") or 0,
            "yield": barrio.get("yield_anual") or 0.0,
            "anos_recupero": barrio.get("anos_recupero") or 0.0,
            "dist_metro": distances.get("dist_metro", barrio.get("dist_metro", -1.0)),
            "dist_parque": distances.get("dist_parque", barrio.get("dist_parque", -1.0)),
            "dist_mall": distances.get("dist_mall", barrio.get("dist_mall", -1.0)),
            "n_venta": barrio.get("n_venta") or 0,
            "n_arriendo": barrio.get("n_arriendo") or 0,
            "lat": barrio["lat"],
            "lng": barrio["lng"],
            "score_salud": barrio.get("score_salud") or rs.get("score_salud", 100),
            "categoria_salud": barrio.get("categoria_salud") or rs.get("categoria_salud", "SIN DATOS"),
            "n_remates_municipio": barrio.get("n_remates_municipio") or rs.get("n_remates_activos", 0),
            "remates_por_100": barrio.get("remates_por_100_listings") or rs.get("remates_por_100_listings"),
        }
        # Only include barrios with at least some price data
        if r["precio_m2"] > 0 or r["arriendo"] > 0:
            result.append(r)
            next_id += 1

    # Apply remates scores to hardcoded barrios (already in result)
    if remates_scores:
        for b in result:
            mun = b["municipio"]
            rs = remates_scores.get(mun, {})
            if "score_salud" not in b:
                b["score_salud"] = rs.get("score_salud", 100)
                b["categoria_salud"] = rs.get("categoria_salud", "SIN DATOS")
                b["n_remates_municipio"] = rs.get("n_remates_activos", 0)
                b["remates_por_100"] = rs.get("remates_por_100_listings")

    return result


def _ts_nullable(v) -> str:
    if v is None:
        return "null"
    if isinstance(v, str):
        return f'"{v}"'
    return str(v)


def format_neighborhood_ts(b: dict) -> str:
    """Format one Neighborhood object as TypeScript."""
    salud = (
        f', score_salud: {b["score_salud"]}'
        f', categoria_salud: "{b["categoria_salud"]}"'
        f', n_remates_municipio: {b["n_remates_municipio"]}'
        f', remates_por_100: {_ts_nullable(b.get("remates_por_100"))}'
    ) if "score_salud" in b else ""
    return (
        f'  {{ id: {b["id"]}, nombre: "{b["nombre"]}", '
        f'comuna: "{b["comuna"]}", municipio: "{b["municipio"]}", '
        f'estrato: {b["estrato"]}, '
        f'precio_m2: {b["precio_m2"]}, '
        f'arriendo: {b["arriendo"]}, '
        f'yield: {b["yield"]}, '
        f'anos_recupero: {b["anos_recupero"]}, '
        f'dist_metro: {b["dist_metro"]}, '
        f'dist_parque: {b["dist_parque"]}, '
        f'dist_mall: {b["dist_mall"]}, '
        f'n_venta: {b["n_venta"]}, '
        f'n_arriendo: {b["n_arriendo"]}, '
        f'lat: {b["lat"]}, lng: {b["lng"]}'
        f'{salud} }},'
    )


def build_neighborhoods_ts(barrios: list[dict]) -> str:
    lines = []
    lines.append("export type Neighborhood = {")
    lines.append("  id: number;")
    lines.append("  nombre: string;")
    lines.append("  comuna: string;")
    lines.append("  municipio: string;")
    lines.append("  estrato: number;")
    lines.append("  precio_m2: number;")
    lines.append("  arriendo: number;")
    lines.append("  yield: number;")
    lines.append("  anos_recupero: number;")
    lines.append("  dist_metro: number;")
    lines.append("  dist_parque: number;")
    lines.append("  dist_mall: number;")
    lines.append("  n_venta: number;")
    lines.append("  n_arriendo: number;")
    lines.append("  lat: number;")
    lines.append("  lng: number;")
    lines.append("  // API-sourced fields (undefined when using hardcoded NEIGHBORHOODS)")
    lines.append("  score_activo?: number | null;")
    lines.append("  estado_precio?: string | null;")
    lines.append("  oportunidad?: { detectada: boolean | null; tipo: string | null; descripcion: string | null } | null;")
    lines.append("  liquidez_api?: { score: number | null; categoria: string | null; tiempo_estimado_venta: string | null } | null;")
    lines.append("  // Salud financiera del municipio (remates judiciales)")
    lines.append("  score_salud?: number;")
    lines.append("  categoria_salud?: string;")
    lines.append("  n_remates_municipio?: number;")
    lines.append("  remates_por_100?: number | null;")
    lines.append("};")
    lines.append("")

    n_total = len(barrios)
    p_m2_values = [b["precio_m2"] for b in barrios if b.get("precio_m2", 0) > 0]
    yield_values = [b["yield"] for b in barrios if b.get("yield", 0) > 0]
    yield_avg = round(sum(yield_values) / len(yield_values), 1) if yield_values else 6.8
    p_m2_sorted = sorted(p_m2_values)
    p_m2_median = p_m2_sorted[len(p_m2_sorted) // 2] if p_m2_sorted else 6_100_000

    municipios = sorted(set(b["municipio"] for b in barrios))
    mun_comment = ", ".join(municipios)

    lines.append(f"// Valle de Aburrá: {mun_comment}")
    lines.append(f"// Last updated: {__import__('datetime').date.today().isoformat()}")
    lines.append("export const NEIGHBORHOODS: Neighborhood[] = [")
    for b in barrios:
        lines.append(format_neighborhood_ts(b))
    lines.append("];")
    lines.append("")
    lines.append("export const CITY_STATS = {")
    lines.append(f"  yield_promedio: {yield_avg},")
    lines.append(f"  barrios_analizados: {n_total},")
    lines.append(f"  precio_m2_mediana: {p_m2_median},")
    lines.append("};")
    lines.append("")
    # Keep hexAround + buildNeighborhoodsGeoJSON unchanged
    lines.append("""/** Build an approximated hexagonal polygon around a point (fallback if no GeoJSON). */
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
        municipio: n.municipio,
        precio_m2: n.precio_m2,
        yield: n.yield,
        estrato: n.estrato,
        n_venta: n.n_venta,
        n_arriendo: n.n_arriendo,
      },
      geometry: {
        type: "Polygon" as const,
        coordinates: [hexAround(n.lng, n.lat)],
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
}""")
    lines.append("")
    return "\n".join(lines)


def build_liquidity_raw(barrios: list[dict]) -> str:
    """Generate the RAW liquidity dict entries for marketActivity.ts.
    Deduplicate by nombre (same barrio name across municipalities) — keep best-data entry.
    """
    seen: dict[str, dict] = {}
    for b in barrios:
        key = b["nombre"].upper()
        existing = seen.get(key)
        # Prefer entry with more data (higher n_venta + n_arriendo)
        if existing is None or (b.get("n_venta", 0) + b.get("n_arriendo", 0)) > (existing.get("n_venta", 0) + existing.get("n_arriendo", 0)):
            seen[key] = b

    lines = []
    for nombre, b in seen.items():
        n = b.get("n_venta", 0)
        y = b.get("yield", 0)
        score = min(95, max(15, int(n * 2 + y * 3)))
        cat = (
            "ALTA" if score >= 70
            else "MEDIA" if score >= 45
            else "BAJA" if score >= 25
            else "MUY BAJA"
        )
        dias = max(10, 120 - score)
        frescos = int(score * 0.6)
        lines.append(
            f'  "{nombre}": {{ score: {score}, cat: "{cat}", '
            f'dias: {dias}, frescos: {frescos}, n: {n} }},'
        )
    return "\n".join(lines)


def build_market_activity_ts(barrios: list[dict], existing_content: str) -> str:
    """
    Rebuild only the RAW section of marketActivity.ts.
    Preserve OPPORTUNITIES and everything else.
    """
    liquidity_raw = build_liquidity_raw(barrios)

    # Replace the RAW constant block
    import re
    new_raw = f"const RAW: Record<string, Omit<Liquidity, \"tiempoEstimado\" | \"label\">> = {{\n{liquidity_raw}\n}};"
    updated = re.sub(
        r"const RAW: Record<string,.*?Omit<Liquidity.*?>\s*=\s*\{.*?\};",
        new_raw,
        existing_content,
        flags=re.DOTALL,
    )
    return updated


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    scraped = load_scraped()
    print(f"Loaded {len(scraped)} scraped barrios")

    remates_scores = load_remates_scores()
    if remates_scores:
        print(f"Remates scores: {list(remates_scores.keys())}")

    barrios = merge_barrios(scraped, remates_scores)
    print(f"Merged → {len(barrios)} total barrios")

    # neighborhoods.ts
    neighborhoods_content = build_neighborhoods_ts(barrios)
    if args.dry_run:
        print("\n--- neighborhoods.ts (dry run) ---")
        print(neighborhoods_content[:3000])
    else:
        TS_NEIGHBORHOODS.write_text(neighborhoods_content, encoding="utf-8")
        print(f"Written → {TS_NEIGHBORHOODS}")

    # marketActivity.ts — only update RAW section
    if TS_MARKET.exists():
        existing = TS_MARKET.read_text(encoding="utf-8")
        market_content = build_market_activity_ts(barrios, existing)
        if args.dry_run:
            print("\n--- marketActivity.ts RAW (dry run, first 1000 chars) ---")
            print(market_content[:1000])
        else:
            TS_MARKET.write_text(market_content, encoding="utf-8")
            print(f"Written → {TS_MARKET}")


if __name__ == "__main__":
    main()
