const API_BASE_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000/api/v1";

export const API_ENDPOINTS = {
  // Auth
  register: `${API_BASE_URL}/auth/register`,
  login: `${API_BASE_URL}/auth/login`,
  me: `${API_BASE_URL}/auth/me`,
  logout: `${API_BASE_URL}/auth/logout`,
  refreshToken: `${API_BASE_URL}/auth/refresh`,
  forgotPassword: `${API_BASE_URL}/auth/forgot-password`,
  resetPassword: `${API_BASE_URL}/auth/reset-password`,

  // Barrios
  barrios: `${API_BASE_URL}/barrios`,
  barrio: (id: number) => `${API_BASE_URL}/barrios/${id}`,
  barrioInfo: (id: number) => `${API_BASE_URL}/barrios/${id}/info`,
  comparar: `${API_BASE_URL}/barrios/comparar`,
  listings: (id: number) => `${API_BASE_URL}/barrios/${id}/listings`,
  allListings: `${API_BASE_URL}/listings`,

  // Usuario
  onboarding: `${API_BASE_URL}/usuario/onboarding`,
  perfil: `${API_BASE_URL}/usuario/perfil`,
  configMapa: `${API_BASE_URL}/usuario/configuracion_mapa`,

  // Admin
  adminLeads: `${API_BASE_URL}/admin/leads`,
  adminLead: (id: number) => `${API_BASE_URL}/admin/leads/${id}`,

  // Features
  calculadora: `${API_BASE_URL}/calculadora/simular`,
  oportunidades: `${API_BASE_URL}/oportunidades`,
  favoritos: `${API_BASE_URL}/favoritos`,
  historial: `${API_BASE_URL}/historial`,
  ciudadStats: `${API_BASE_URL}/stats/ciudad`,
  scoreThresholds: `${API_BASE_URL}/stats/score-thresholds`,
} as const;

export { API_BASE_URL };
