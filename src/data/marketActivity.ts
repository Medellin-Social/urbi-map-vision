export type LiquidityCat = "ALTA" | "MEDIA" | "BAJA" | "MUY BAJA";

export type Liquidity = {
  score: number;
  cat: LiquidityCat;
  dias: number;
  frescos: number;
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

export type OpportunityKind = "PRECIO BAJO MERCADO" | "ALTO RENDIMIENTO" | "INVERSIÓN SEGURA";

export type Opportunity = {
  barrio_id?: number;
  barrio: string;
  tipo: OpportunityKind;
  descripcion: string;
  score: number;
  liquidez: LiquidityCat;
  color: string;
  emoji: string;
};
