import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch, clearToken, getToken, setToken } from "@/lib/apiClient";
import { API_ENDPOINTS } from "@/config/api";
import { auth } from "@/lib/auth";

type UserBasic = {
  id: number;
  email: string;
  nombre: string | null;
  apellido: string | null;
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
    goal: (res.perfil_inversor?.objetivo as never) ?? undefined,
    budget: (res.perfil_inversor?.presupuesto as never) ?? undefined,
    risk: (res.perfil_inversor?.perfil_riesgo as never) ?? undefined,
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: async (data: { email: string; password: string; nombre?: string }) => {
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

export function logout() {
  clearToken();
  auth.clear();
}
