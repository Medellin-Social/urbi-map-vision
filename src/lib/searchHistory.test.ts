import { describe, it, expect, beforeEach } from "vitest";
import { saveSearch, getSearches, removeSearch, describeSearch, hasAnyFilter } from "./searchHistory";
import { EMPTY_SHARED_FILTERS, type SharedFilters } from "@/components/MapFilterBar";

const f = (p: Partial<SharedFilters>): SharedFilters => ({ ...EMPTY_SHARED_FILTERS, ...p });

describe("searchHistory", () => {
  beforeEach(() => localStorage.clear());

  it("dedups identical filters and keeps newest on top", () => {
    saveSearch(f({ tipoOp: "venta", precioMax: 500 }));
    saveSearch(f({ tipoOp: "arriendo", habitaciones: 2 }));
    saveSearch(f({ tipoOp: "venta", precioMax: 500 })); // dup del primero
    const list = getSearches();
    expect(list).toHaveLength(2);
    expect(list[0].filters.tipoOp).toBe("venta"); // el dup subió al tope
  });

  it("ignores `orden` when deduping", () => {
    saveSearch(f({ tipoOp: "venta", orden: "precio_asc" }));
    saveSearch(f({ tipoOp: "venta", orden: "precio_desc" }));
    expect(getSearches()).toHaveLength(1);
  });

  it("removeSearch drops by id", () => {
    saveSearch(f({ tipoOp: "venta" }));
    removeSearch(getSearches()[0].id);
    expect(getSearches()).toHaveLength(0);
  });

  it("hasAnyFilter catches fields activeFilterCount ignored (estrato, etc.)", () => {
    expect(hasAnyFilter(f({}))).toBe(false);                        // default = sin filtro
    expect(hasAnyFilter(f({ tipoOp: "arriendo" }))).toBe(false);    // tipoOp no es filtro
    expect(hasAnyFilter(f({ estrato: [4] }))).toBe(true);           // estrato sí
    expect(hasAnyFilter(f({ amoblado: false }))).toBe(true);        // distinto del default null
  });

  it("describeSearch summarizes active filters", () => {
    const s = describeSearch(f({ tipoOp: "arriendo", habitaciones: 3, tipoInmueble: ["apartamento"] }));
    expect(s).toContain("Arriendo");
    expect(s).toContain("3+ hab");
    expect(s).toContain("apartamento");
  });
});
