import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";
import { API_ENDPOINTS } from "@/config/api";

// Canonical COP/USD rate (public.trm, refreshed weekly). Falls back to 4100 until
// the fetch resolves. Used for USD price labels (locale EN) + card USD display.
export function useTrm(): number {
  const { data } = useQuery({
    queryKey: ["trm"],
    queryFn: () => apiFetch<{ valor: number }>(API_ENDPOINTS.trm),
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });
  return data?.valor ?? 4100;
}
