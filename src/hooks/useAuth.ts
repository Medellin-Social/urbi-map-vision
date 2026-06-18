import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch, clearToken, getToken, setToken } from "@/lib/apiClient";
import { API_ENDPOINTS } from "@/config/api";
import { auth } from "@/lib/auth";

type UserBasic = {
  id: number;
  email: string;
  nombre: string | null;
  apellido: string | null;
  plan?: string | null;
  perfil_busqueda?: string | null;
  onboarding_completado?: boolean | null;
  origen_registro?: string | null;
};

type PerfilInversor = {
  objetivo?: string;
  presupuesto?: string;
  perfil_riesgo?: string;
} | null;

export type AuthResponse = {
  token: string;
  user: UserBasic;
  perfil_inversor: PerfilInversor;
};

function storeAuth(res: AuthResponse) {
  if (res.token) setToken(res.token);
  auth.set({
    name: [res.user.nombre, res.user.apellido].filter(Boolean).join(" ") || res.user.email,
    email: res.user.email,
    plan: (res.user.plan ?? "free") as never,
    goal: (res.perfil_inversor?.objetivo as never) ?? undefined,
    budget: (res.perfil_inversor?.presupuesto as never) ?? undefined,
    risk: (res.perfil_inversor?.perfil_riesgo as never) ?? undefined,
    perfilBusqueda: (res.user.perfil_busqueda as never) ?? undefined,
    onboardingCompletado: res.user.onboarding_completado ?? false,
    origenRegistro: res.user.origen_registro ?? undefined,
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: async (data: { email: string; password: string; nombre?: string; origen?: string }) => {
      const res = await apiFetch<AuthResponse>(API_ENDPOINTS.register, {
        method: "POST",
        body: JSON.stringify(data),
        skipAuth: true,
      });
      storeAuth(res);
      return res;
    },
  });
}

export function useLogin() {
  return useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      const res = await apiFetch<AuthResponse>(API_ENDPOINTS.login, {
        method: "POST",
        body: JSON.stringify(data),
        skipAuth: true,
      });
      storeAuth(res);
      return res;
    },
  });
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch<AuthResponse>(API_ENDPOINTS.me),
    enabled: !!getToken(),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
}

export function useUpdateAuthPerfil() {
  return useMutation({
    mutationFn: async (data: {
      perfil_busqueda?: string;
      onboarding_completado?: boolean;
      origen_registro?: string;
    }) => {
      await apiFetch(API_ENDPOINTS.authPerfil, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      if (data.perfil_busqueda !== undefined)
        auth.patch({ perfilBusqueda: data.perfil_busqueda as never });
      if (data.onboarding_completado !== undefined)
        auth.patch({ onboardingCompletado: data.onboarding_completado });
    },
  });
}

export function logout() {
  clearToken();
  auth.clear();
}
