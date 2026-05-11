import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";
import { API_ENDPOINTS } from "@/config/api";
import { apiOportunidadToOpportunity, type ApiOportunidad } from "@/lib/adapters";
import { OPPORTUNITIES } from "@/data/marketActivity";

export function useOportunidades(perfil?: string) {
  return useQuery({
    queryKey: ["oportunidades", perfil ?? null],
    queryFn: async () => {
      const url = perfil
        ? `${API_ENDPOINTS.oportunidades}?perfil=${encodeURIComponent(perfil)}`
        : API_ENDPOINTS.oportunidades;
      const data = await apiFetch<ApiOportunidad[]>(url);
      return data.map(apiOportunidadToOpportunity);
    },
    placeholderData: OPPORTUNITIES,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
