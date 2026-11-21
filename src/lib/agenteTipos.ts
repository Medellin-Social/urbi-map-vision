// Tipos de agente (programa de realtors). Un agente puede tener VARIOS a la vez y
// cambian con el tiempo (un cupo pagado vence, se certifica…): el backend los
// calcula en vivo (api/routers/listings.py::_agente_tipos_sql) y nunca se guardan
// en el listing.
//   member    = nivel base (ni certificado ni preferido)
//   certified = certificado por el equipo
//   preferred = cupo pagado vigente de Realtor Preferido
//   casa      = realtor de la casa (cubre gratis barrios sin preferido)
export type AgenteTipo = "member" | "certified" | "preferred" | "casa";

export const AGENTE_TIPOS: AgenteTipo[] = ["preferred", "certified", "member", "casa"];

export const AGENTE_TIPO_LABEL: Record<AgenteTipo, { es: string; en: string }> = {
  preferred: { es: "Preferido",          en: "Preferred" },
  certified: { es: "Certificado",        en: "Certified" },
  member:    { es: "Miembro",            en: "Member" },
  casa:      { es: "Realtor de la casa", en: "House realtor" },
};

/** Descripción corta para el filtro del directorio. */
export const AGENTE_TIPO_DESC: Record<AgenteTipo, { es: string; en: string }> = {
  preferred: { es: "Destacado en su barrio",           en: "Featured in their neighborhood" },
  certified: { es: "Certificado por Medellín Social",  en: "Certified by Medellín Social" },
  member:    { es: "Miembro de la red",                en: "Network member" },
  casa:      { es: "Agente del equipo Medellín Social", en: "Medellín Social team agent" },
};

export const AGENTE_TIPO_STYLE: Record<AgenteTipo, { bg: string; fg: string; border: string }> = {
  preferred: { bg: "#FCD116", fg: "#3D3000", border: "#E0B800" },
  certified: { bg: "#E6F4EC", fg: "#0A5C36", border: "#0F8A4F" },
  member:    { bg: "#F1F1EF", fg: "#4A4D4A", border: "#D6D6D2" },
  casa:      { bg: "#FFFFFF", fg: "#1A1A1A", border: "#1A1A1A" },
};

export function agenteTipoLabel(t: AgenteTipo, lang: string): string {
  return AGENTE_TIPO_LABEL[t][lang === "en" ? "en" : "es"];
}

/** Ordena y filtra a tipos conocidos (el backend puede sumar tipos en el futuro). */
export function normalizarTipos(tipos: readonly string[] | null | undefined): AgenteTipo[] {
  if (!tipos?.length) return [];
  const set = new Set(tipos);
  return AGENTE_TIPOS.filter((t) => set.has(t));
}
