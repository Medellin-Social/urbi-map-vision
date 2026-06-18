import { useState, useCallback, useEffect } from "react";
import type { ApiListing } from "@/lib/adapters";

const LS_KEY = "comparador_listings";
export const MAX_COMPARADOR = 5;

function loadFromStorage(): ApiListing[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as ApiListing[]) : [];
  } catch {
    return [];
  }
}

// Module-level singleton — shared across all hook instances without context
let _listings: ApiListing[] = typeof window !== "undefined" ? loadFromStorage() : [];
const _listeners = new Set<() => void>();

function notifyAll() {
  _listeners.forEach((fn) => fn());
}

export function useComparadorStore() {
  const [listings, setListings] = useState<ApiListing[]>(_listings);

  useEffect(() => {
    const sync = () => setListings([..._listings]);
    _listeners.add(sync);
    return () => { _listeners.delete(sync); };
  }, []);

  const addListing = useCallback((listing: ApiListing) => {
    if (_listings.length >= MAX_COMPARADOR) return;
    if (_listings.some((l) => l.id === listing.id)) return;
    _listings = [..._listings, listing];
    try { localStorage.setItem(LS_KEY, JSON.stringify(_listings)); } catch {}
    notifyAll();
  }, []);

  const removeListing = useCallback((id: number) => {
    _listings = _listings.filter((l) => l.id !== id);
    try { localStorage.setItem(LS_KEY, JSON.stringify(_listings)); } catch {}
    notifyAll();
  }, []);

  const clearAll = useCallback(() => {
    _listings = [];
    try { localStorage.removeItem(LS_KEY); } catch {}
    notifyAll();
  }, []);

  const isSelected = useCallback((id: number) => listings.some((l) => l.id === id), [listings]);

  const canAdd = listings.length < MAX_COMPARADOR;

  return { listings, addListing, removeListing, clearAll, isSelected, canAdd, max: MAX_COMPARADOR };
}
