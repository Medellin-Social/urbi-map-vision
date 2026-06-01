const TOKEN_KEY = "medellin-social.token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(t: string): void {
  if (typeof window !== "undefined") localStorage.setItem(TOKEN_KEY, t);
}

export function clearToken(): void {
  if (typeof window !== "undefined") localStorage.removeItem(TOKEN_KEY);
}

type FetchOptions = RequestInit & { skipAuth?: boolean };

export async function apiFetch<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const { skipAuth, ...init } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };

  const token = getToken();
  if (token && !skipAuth) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, { ...init, headers });

  if (res.status === 401) {
    clearToken();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new Error("Sesión expirada. Por favor inicia sesión nuevamente.");
  }

  if (!res.ok) {
    let msg = `Error ${res.status}`;
    try {
      const err = await res.json();
      msg = (err as { detail?: string; message?: string }).detail ?? (err as { message?: string }).message ?? msg;
    } catch {
      // ignore parse error
    }
    throw new Error(msg);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
