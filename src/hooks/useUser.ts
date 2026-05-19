import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";
import { API_ENDPOINTS } from "@/config/api";
import { getToken } from "@/lib/apiClient";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ApiFavorito = {
  id: number;
  barrio_id: number;
  nota: string | null;
  created_at: string;
  nombre: string | null;
  comuna: string | null;
  municipio: string | null;
  precio_venta_m2_p50: number | null;
  yield_bruto: number | null;
  score_corto: number | null;
  score_mediano: number | null;
  score_largo: number | null;
  perfil_recomendado: string | null;
};

export type ApiHistorialEntry = {
  id: number;
  tipo: string;
  barrio_id: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  barrio_nombre: string | null;
  comuna: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function isAuthenticated(): boolean {
  return getToken() !== null;
}

// ── Favoritos ─────────────────────────────────────────────────────────────────

export function useFavoritos() {
  return useQuery({
    queryKey: ["favoritos"],
    queryFn: () => apiFetch<ApiFavorito[]>(API_ENDPOINTS.favoritos),
    enabled: isAuthenticated(),
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });
}

export function useToggleFavorito() {
  const qc = useQueryClient();

  const add = useMutation({
    mutationFn: (barrioId: number) =>
      apiFetch<ApiFavorito>(API_ENDPOINTS.favoritos, {
        method: "POST",
        body: JSON.stringify({ barrio_id: barrioId }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["favoritos"] }),
  });

  const remove = useMutation({
    mutationFn: (barrioId: number) =>
      apiFetch<void>(`${API_ENDPOINTS.favoritos}/${barrioId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["favoritos"] }),
  });

  return { add, remove };
}

// ── Historial ─────────────────────────────────────────────────────────────────

export function useHistorial() {
  return useQuery({
    queryKey: ["historial"],
    queryFn: () => apiFetch<ApiHistorialEntry[]>(API_ENDPOINTS.historial),
    enabled: isAuthenticated(),
    staleTime: 60 * 1000,
    retry: 1,
  });
}
