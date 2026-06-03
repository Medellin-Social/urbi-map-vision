import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/apiClient";
import { API_ENDPOINTS } from "@/config/api";
import { auth } from "@/lib/auth";

const BASE = API_ENDPOINTS.favoritos + "/listings";

export function useFavoritosListings() {
  const [favUrls, setFavUrls] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!auth.get()) return;
    apiFetch<{ ids: string[] }>(`${BASE}/ids`)
      .then((data) => {
        setFavUrls(new Set(data.ids));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const isFav = useCallback((url: string | null | undefined): boolean => {
    return !!url && favUrls.has(url);
  }, [favUrls]);

  const toggle = useCallback(async (url: string | null | undefined, barrioId?: number | null) => {
    if (!url || !auth.get()) return;
    if (favUrls.has(url)) {
      await apiFetch(`${BASE}?url=${encodeURIComponent(url)}`, { method: "DELETE" }).catch(() => {});
      setFavUrls((prev) => { const n = new Set(prev); n.delete(url); return n; });
    } else {
      await apiFetch(BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, barrio_id: barrioId ?? null }),
      }).catch(() => {});
      setFavUrls((prev) => new Set([...prev, url]));
    }
  }, [favUrls]);

  return { isFav, toggle, loaded };
}
