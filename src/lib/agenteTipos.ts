// Tipos de agente (Programa de agentes, docs/Medellin-Social-Programa-Inmobiliario-ES.md).
// Un agente puede tener VARIOS a la vez y cambian con el tiempo (un cupo pagado
// vence, se certifica…): el backend los calcula en vivo
// (api/routers/listings.py::_agente_tipos_sql) y nunca se guardan en el listing.
//   member    = Agente registrado (registro pagado), ni certificado ni preferente
//   certified = Agente certificado (examen EASE + revisión + pagos al día)
//   preferred = Agente preferente: cupo pagado vigente de barrio o comuna
//   casa      = realtor de la casa (cubre gratis barrios sin preferente)
// "No registrado" no es un tipo: es la ausencia de agente en un anuncio importado.
export type AgenteTipo = "member" | "certified" | "preferred" | "casa";

export const AGENTE_TIPOS: AgenteTipo[] = ["preferred", "certified", "member", "casa"];

export const AGENTE_TIPO_LABEL: Record<AgenteTipo, { es: string; en: string }> = {
  preferred: { es: "Agente preferente",  en: "Preferred agent" },
  certified: { es: "Agente certificado", en: "Certified agent" },
  member:    { es: "Agente registrado",  en: "Registered agent" },
  casa:      { es: "Realtor de la casa", en: "House realtor" },
};

/** Descripción corta para el filtro del directorio. */
export const AGENTE_TIPO_DESC: Record<AgenteTipo, { es: string; en: string }> = {
  preferred: { es: "Posicionamiento preferente en un barrio o comuna", en: "Preferred placement in a neighborhood or commune" },
  certified: { es: "Aprobó el examen y la revisión de trayectoria",    en: "Passed the exam and track-record review" },
  member:    { es: "Registrado en Medellín Social",                    en: "Registered on Medellín Social" },
  casa:      { es: "Agente del equipo Medellín Social",                en: "Medellín Social team agent" },
};

/** Ancla de cada estado en la guía pública /agentes/estados. */
export const AGENTE_TIPO_ANCLA: Record<AgenteTipo, string> = {
  preferred: "preferente-barrio",
  certified: "certificado",
  member: "registrado",
  casa: "realtor-casa",
};

export const AGENTE_TIPO_STYLE: Record<AgenteTipo, { bg: string; fg: string; border: string }> = {
  preferred: { bg: "#FCD116", fg: "#3D3000", border: "#E0B800" },
  certified: { bg: "#E6F4EC", fg: "#0A5C36", border: "#0F8A4F" },
  member:    { bg: "#F1F1EF", fg: "#4A4D4A", border: "#D6D6D2" },
  casa:      { bg: "#FFFFFF", fg: "#1A1A1A", border: "#1A1A1A" },
};

export type ZonaPreferente = { nivel: "barrio" | "comuna" | string; nombre: string };

export function agenteTipoLabel(t: AgenteTipo, lang: string): string {
  return AGENTE_TIPO_LABEL[t][lang === "en" ? "en" : "es"];
}

/** "Preferente de barrio · Laureles" (zona precisa, solo cupos pagados activos). */
export function preferenteLabel(z: ZonaPreferente, lang: string): string {
  const en = lang === "en";
  const nivel = z.nivel === "comuna"
    ? (en ? "Preferred · commune" : "Preferente de comuna")
    : (en ? "Preferred · neighborhood" : "Preferente de barrio");
  return `${nivel} · ${z.nombre}`;
}

/** Ordena y filtra a tipos conocidos (el backend puede sumar tipos en el futuro). */
export function normalizarTipos(tipos: readonly string[] | null | undefined): AgenteTipo[] {
  if (!tipos?.length) return [];
  const set = new Set(tipos);
  return AGENTE_TIPOS.filter((t) => set.has(t));
}
