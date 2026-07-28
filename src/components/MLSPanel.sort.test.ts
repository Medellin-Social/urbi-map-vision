import { describe, it, expect } from "vitest";
import { sortListings } from "./MLSPanel";
import type { ApiListing } from "@/lib/adapters";

const L = (id: number, precio_cop: number | null, area_m2: number | null, dias: number | null) =>
  ({ id, precio_cop, area_m2, dias_en_mercado: dias } as unknown as ApiListing);

describe("sortListings", () => {
  const base = [L(1, 300, 50, 10), L(2, 100, 90, 2), L(3, 200, 70, 30)];

  it("destacados conserva orden del server", () => {
    expect(sortListings(base, "destacados").map((x) => x.id)).toEqual([1, 2, 3]);
  });
  it("precio asc/desc", () => {
    expect(sortListings(base, "precio_asc").map((x) => x.id)).toEqual([2, 3, 1]);
    expect(sortListings(base, "precio_desc").map((x) => x.id)).toEqual([1, 3, 2]);
  });
  it("nuevo = menos días primero", () => {
    expect(sortListings(base, "nuevo").map((x) => x.id)).toEqual([2, 1, 3]);
  });
  it("área desc", () => {
    expect(sortListings(base, "area_desc").map((x) => x.id)).toEqual([2, 3, 1]);
  });
  it("nulls van al final (no rompen orden)", () => {
    const withNull = [L(1, 300, 50, 10), L(2, null, null, null), L(3, 200, 70, 30)];
    expect(sortListings(withNull, "precio_asc").map((x) => x.id)).toEqual([3, 1, 2]);
    expect(sortListings(withNull, "precio_desc").map((x) => x.id)).toEqual([1, 3, 2]);
  });
  it("no muta el array original", () => {
    const orig = [...base];
    sortListings(base, "precio_asc");
    expect(base.map((x) => x.id)).toEqual(orig.map((x) => x.id));
  });
});
