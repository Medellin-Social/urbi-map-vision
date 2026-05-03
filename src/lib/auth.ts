export type Goal = "airbnb" | "renta-larga" | "valorizacion" | "mixto";
export type Risk = "conservador" | "moderado" | "agresivo";
export type Budget = "<200" | "200-500" | "500-1000" | ">1000";

export type UrbiUser = {
  name: string;
  email: string;
  budget?: Budget;
  goal?: Goal;
  risk?: Risk;
};

const KEY = "urbidata.user";

export const auth = {
  get(): UrbiUser | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as UrbiUser) : null;
    } catch {
      return null;
    }
  },
  set(u: UrbiUser) {
    localStorage.setItem(KEY, JSON.stringify(u));
  },
  patch(p: Partial<UrbiUser>) {
    const cur = auth.get() ?? { name: "", email: "" };
    auth.set({ ...cur, ...p });
  },
  clear() {
    localStorage.removeItem(KEY);
  },
};

export const GOAL_LABEL: Record<Goal, string> = {
  airbnb: "Airbnb",
  "renta-larga": "Renta larga",
  valorizacion: "Valorización",
  mixto: "Mixto",
};

export function recommendation(goal?: Goal): string {
  switch (goal) {
    case "airbnb":
      return "🎯 Para tu perfil Airbnb, El Poblado y Laureles tienen la mayor demanda de renta corta estimada. Yield promedio zona: 7.4%";
    case "renta-larga":
      return "🏠 Para renta larga, Robledo y Aranjuez ofrecen el mejor balance precio/arriendo con baja vacancia.";
    case "valorizacion":
      return "📈 Para valorización, El Rodeo y Robledo muestran el mayor potencial de apreciación a 5 años.";
    case "mixto":
      return "⚖️ Tu perfil mixto se beneficia de Laureles y Estadio: yield estable y demanda dual venta/arriendo.";
    default:
      return "Selecciona un barrio en el mapa para ver análisis detallado.";
  }
}
