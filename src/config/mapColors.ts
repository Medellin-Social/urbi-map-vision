export const SCORE_OPACITY = {
  con_datos: 0.7,
  sin_datos: 0.35,
} as const;

export const OPP_COLORS = {
  "PRECIO BAJO MERCADO": "#7B2FBE",
  "ALTO RENDIMIENTO":    "#00B4D8",
  "INVERSIÓN SEGURA":    "#0077B6",
} as const;

// ── Score palettes ─────────────────────────────────────────────────────────────

export type ScorePaletteId = "urbi" | "suave" | "tropical" | "nocturna" | "contraste";

export type ScorePalette = {
  label: string;
  alto: string;          // score >= 70
  medio: string;         // score >= 50
  bajo: string;          // score >= 30
  muy_bajo: string;      // score < 30
  sin_datos: string;
  sin_datos_opacity: number;
  swatch: [string, string, string, string]; // alto → muy_bajo
};

export const SCORE_PALETTES: Record<ScorePaletteId, ScorePalette> = {
  urbi: {
    label: "Urbi (predeterminado)",
    alto:      "#10b981",
    medio:     "#2BBAA5",
    bajo:      "#f59e0b",
    muy_bajo:  "#ef4444",
    sin_datos: "#00d4ff",
    sin_datos_opacity: 0.2,
    swatch: ["#10b981", "#2BBAA5", "#f59e0b", "#ef4444"],
  },
  suave: {
    label: "Suave",
    alto:      "#99CDD8",
    medio:     "#DAEBE3",
    bajo:      "#FDE8D3",
    muy_bajo:  "#657166",
    sin_datos: "#CFD6C4",
    sin_datos_opacity: 0.3,
    swatch: ["#99CDD8", "#DAEBE3", "#FDE8D3", "#657166"],
  },
  tropical: {
    label: "Tropical",
    alto:      "#2BBAA5",
    medio:     "#93D3AE",
    bajo:      "#F9A822",
    muy_bajo:  "#F96635",
    sin_datos: "#FAECB6",
    sin_datos_opacity: 0.3,
    swatch: ["#2BBAA5", "#93D3AE", "#F9A822", "#F96635"],
  },
  nocturna: {
    label: "Nocturna",
    alto:      "#26425A",
    medio:     "#86A8CF",
    bajo:      "#C38EB4",
    muy_bajo:  "#E1CBD7",
    sin_datos: "#C38EB4",
    sin_datos_opacity: 0.2,
    swatch: ["#26425A", "#86A8CF", "#C38EB4", "#E1CBD7"],
  },
  contraste: {
    label: "Contraste",
    alto:      "#262F45",
    medio:     "#5196CE",
    bajo:      "#FE8492",
    muy_bajo:  "#A42527",
    sin_datos: "#45141B",
    sin_datos_opacity: 0.2,
    swatch: ["#262F45", "#5196CE", "#FE8492", "#A42527"],
  },
};

export const PALETTE_STORAGE_KEY = "urbidata.score_palette";
export const PALETTE_EVENT = "urbidata:palette";

export function getActivePaletteId(): ScorePaletteId {
  if (typeof window === "undefined") return "suave";
  const raw = localStorage.getItem(PALETTE_STORAGE_KEY);
  return (raw && raw in SCORE_PALETTES ? raw : "urbi") as ScorePaletteId;
}

export function setActivePalette(id: ScorePaletteId): void {
  localStorage.setItem(PALETTE_STORAGE_KEY, id);
  window.dispatchEvent(new CustomEvent(PALETTE_EVENT));
}

// Dynamic thresholds loaded from /stats/score-thresholds (p75/p50/p25 per score type).
// Fallbacks match backend _score_to_hex logic in api/routers/barrios.py.
let _thresholds: Record<string, [number, number, number]> = {
  airbnb:        [70, 50, 30],
  mediano_plazo: [55, 40, 25],
  nomadas:       [55, 40, 25],
  largo_plazo:   [70, 50, 30],
};
const _defaultThreshold: [number, number, number] = [70, 50, 30];

export const THRESHOLDS_EVENT = "urbidata:thresholds";

export function setScoreThresholds(t: Record<string, [number, number, number]>): void {
  _thresholds = t;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(THRESHOLDS_EVENT));
  }
}

export function getScoreColor(score: number | null, paletteId?: ScorePaletteId, perfil?: string): string {
  const p = SCORE_PALETTES[paletteId ?? getActivePaletteId()];
  if (score === null) return p.sin_datos;
  const [tAlto, tMedio, tBajo] = _thresholds[perfil ?? ""] ?? _defaultThreshold;
  if (score >= tAlto) return p.alto;
  if (score >= tMedio) return p.medio;
  if (score >= tBajo) return p.bajo;
  return p.muy_bajo;
}

export function getScoreLabel(score: number | null, perfil?: string): string {
  if (score === null) return "Sin datos";
  const [tAlto, tMedio, tBajo] = _thresholds[perfil ?? ""] ?? _defaultThreshold;
  if (score >= tAlto) return "Excelente";
  if (score >= tMedio) return "Bueno";
  if (score >= tBajo) return "Moderado";
  return "Bajo";
}

export function getScoreFillOpacity(score: number | null, excluir: boolean, paletteId?: ScorePaletteId): number {
  if (excluir || score === null) {
    return SCORE_PALETTES[paletteId ?? getActivePaletteId()].sin_datos_opacity;
  }
  return SCORE_OPACITY.con_datos;
}
