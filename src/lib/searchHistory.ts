// Historial de búsquedas del mapa, en localStorage (single-device, sin backend).
// Guarda el objeto SharedFilters completo — todo es serializable. El mapa captura
// la búsqueda actual (debounced) y ofrece "Ver última búsqueda"; /perfil → Historial
// lista todas. Para cross-device graduar a una fila `busqueda` en el historial server.
import { EMPTY_SHARED_FILTERS, type SharedFilters } from "@/components/MapFilterBar";
import { formatCOP } from "@/lib/format";

export type SavedSearch = { id: string; filters: SharedFilters; createdAt: number };

const KEY = "medellin-social.search-history";
const MAX = 15;
const EVENT = "search-history-changed";

function read(): SavedSearch[] {
  if (typeof window === "undefined") return [];
  try {
    const arr = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function write(list: SavedSearch[]) {
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  window.dispatchEvent(new CustomEvent(EVENT));
}

// Clave de igualdad: ignora `orden` (sort de UI, no un filtro distinto) para no
// guardar una "nueva" búsqueda solo porque cambió el orden de la lista.
function key(f: SharedFilters): string {
  const { orden: _orden, ...rest } = f;
  return JSON.stringify(rest);
}

// ¿Hay algún filtro real aplicado? Cuenta cualquier campo distinto del default,
// salvo los que no son "un filtro" (orden/tipoOp/segmento/ocultarDestacados).
// Diff contra EMPTY para cubrir estrato/amenidades/amoblado/diasMercado/etc. que
// activeFilterCount (hint banner) no contaba.
const IGNORE = new Set(["orden", "tipoOp", "segmento", "ocultarDestacados"]);
export function hasAnyFilter(f: SharedFilters): boolean {
  return (Object.keys(EMPTY_SHARED_FILTERS) as (keyof SharedFilters)[]).some(
    (k) => !IGNORE.has(k as string) && JSON.stringify(f[k]) !== JSON.stringify(EMPTY_SHARED_FILTERS[k]),
  );
}

export function getSearches(): SavedSearch[] {
  return read();
}

export function saveSearch(filters: SharedFilters): void {
  const k = key(filters);
  const deduped = read().filter((s) => key(s.filters) !== k); // mueve el duplicado al tope
  deduped.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    filters,
    createdAt: Date.now(),
  });
  write(deduped);
}

export function removeSearch(id: string): void {
  write(read().filter((s) => s.id !== id));
}

export function clearSearches(): void {
  write([]);
}

// Resumen humano para el chip del mapa y la lista del historial.
export function describeSearch(f: SharedFilters): string {
  const parts: string[] = [
    f.tipoOp === "arriendo" ? "Arriendo" : f.tipoOp === "venta" ? "Venta" : "Venta/Arriendo",
  ];
  if (f.tipoInmueble?.length) parts.push(f.tipoInmueble.join("/"));
  if (f.precioMin != null || f.precioMax != null) {
    const a = f.precioMin != null ? formatCOP(f.precioMin) : null;
    const b = f.precioMax != null ? formatCOP(f.precioMax) : null;
    parts.push(a && b ? `${a}–${b}` : a ? `desde ${a}` : `hasta ${b}`);
  }
  if (f.habitaciones != null) parts.push(`${f.habitaciones}+ hab`);
  if (f.banos != null) parts.push(`${f.banos}+ baños`);
  if (f.areaMin != null || f.areaMax != null) {
    const a = f.areaMin != null ? `${f.areaMin}` : null;
    const b = f.areaMax != null ? `${f.areaMax}` : null;
    parts.push((a && b ? `${a}–${b}` : a ? `desde ${a}` : `hasta ${b}`) + " m²");
  }
  if (f.estrato?.length) parts.push(`estrato ${f.estrato.join(",")}`);
  if (f.busqueda) parts.push(`"${f.busqueda}"`);
  return parts.join(" · ");
}
