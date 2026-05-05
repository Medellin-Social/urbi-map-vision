import { NEIGHBORHOODS, type Neighborhood } from "./neighborhoods";

export type LiquidityCat = "ALTA" | "MEDIA" | "BAJA" | "MUY BAJA";

export type Liquidity = {
  score: number;
  cat: LiquidityCat;
  dias: number;
  frescos: number; // %
  n: number;
  tiempoEstimado: string;
  label: string;
};

export const LIQUIDITY_COLORS: Record<LiquidityCat, { border: string; bg: string }> = {
  ALTA: { border: "#10b981", bg: "rgba(16,185,129,0.1)" },
  MEDIA: { border: "#00d4ff", bg: "rgba(0,212,255,0.1)" },
  BAJA: { border: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  "MUY BAJA": { border: "#ef4444", bg: "rgba(239,68,68,0.1)" },
};

const RAW: Record<string, Omit<Liquidity, "tiempoEstimado" | "label">> = {
  "EL POBLADO": { score: 82, cat: "ALTA", dias: 18, frescos: 52, n: 37 },
  LAURELES: { score: 78, cat: "ALTA", dias: 22, frescos: 48, n: 28 },
  ESTADIO: { score: 61, cat: "MEDIA", dias: 35, frescos: 31, n: 12 },
  "BELÉN": { score: 54, cat: "MEDIA", dias: 42, frescos: 28, n: 15 },
  "EL RODEO": { score: 48, cat: "MEDIA", dias: 58, frescos: 22, n: 4 },
  ROBLEDO: { score: 45, cat: "MEDIA", dias: 61, frescos: 19, n: 7 },
  ARANJUEZ: { score: 32, cat: "BAJA", dias: 89, frescos: 12, n: 2 },
};

const LABELS: Record<LiquidityCat, string> = {
  ALTA: "Fácil de vender",
  MEDIA: "Tiempo razonable",
  BAJA: "Tarda en vender",
  "MUY BAJA": "Difícil de vender",
};

const TIEMPOS: Record<LiquidityCat, string> = {
  ALTA: "1-3 meses",
  MEDIA: "3-6 meses",
  BAJA: "6-12 meses",
  "MUY BAJA": "12+ meses",
};

export function liquidityFor(n: Neighborhood): Liquidity {
  const key = n.nombre.toUpperCase();
  const base = RAW[key] ?? deriveLiquidity(n);
  return {
    ...base,
    tiempoEstimado: TIEMPOS[base.cat],
    label: LABELS[base.cat],
  };
}

function deriveLiquidity(n: Neighborhood): Omit<Liquidity, "tiempoEstimado" | "label"> {
  const score = Math.min(95, Math.max(15, n.n_venta * 2 + n.yield * 3));
  const cat: LiquidityCat = score >= 70 ? "ALTA" : score >= 45 ? "MEDIA" : score >= 25 ? "BAJA" : "MUY BAJA";
  const dias = Math.round(120 - score);
  const frescos = Math.round(score * 0.6);
  return { score, cat, dias, frescos, n: n.n_venta };
}

/* ------------- Opportunities ------------- */

export type OpportunityKind = "PRECIO BAJO MERCADO" | "ALTO RENDIMIENTO" | "INVERSIÓN SEGURA";

export type Opportunity = {
  barrio: string; // uppercase name
  tipo: OpportunityKind;
  descripcion: string;
  score: number;
  liquidez: LiquidityCat;
  color: string;
  emoji: string;
};

export const OPPORTUNITIES: Opportunity[] = [
  {
    barrio: "EL RODEO",
    tipo: "PRECIO BAJO MERCADO",
    descripcion: "Cotiza 43% bajo el precio justo según arriendo de la zona",
    score: 88,
    liquidez: "MEDIA",
    color: "#f59e0b",
    emoji: "🎯",
  },
  {
    barrio: "ROBLEDO",
    tipo: "ALTO RENDIMIENTO",
    descripcion: "Yield 8.4% — sobre promedio Medellín (6.8%)",
    score: 83,
    liquidez: "MEDIA",
    color: "#10b981",
    emoji: "📈",
  },
  {
    barrio: "ARANJUEZ",
    tipo: "INVERSIÓN SEGURA",
    descripcion: "Score alto + mercado activo. Venta estimada: 3-6 meses",
    score: 68,
    liquidez: "BAJA",
    color: "#00d4ff",
    emoji: "🛡️",
  },
];

export function opportunityForBarrio(n: Neighborhood | null | undefined): Opportunity | undefined {
  if (!n) return undefined;
  return OPPORTUNITIES.find((o) => o.barrio === n.nombre.toUpperCase());
}

export function opportunityById(id: number): { opp: Opportunity; n: Neighborhood } | undefined {
  for (const o of OPPORTUNITIES) {
    const n = NEIGHBORHOODS.find((x) => x.nombre.toUpperCase() === o.barrio);
    if (n && n.id === id) return { opp: o, n };
  }
  return undefined;
}

export function allOpportunitiesWithBarrio(): { opp: Opportunity; n: Neighborhood }[] {
  return OPPORTUNITIES.flatMap((opp) => {
    const n = NEIGHBORHOODS.find((x) => x.nombre.toUpperCase() === opp.barrio);
    return n ? [{ opp, n }] : [];
  });
}
