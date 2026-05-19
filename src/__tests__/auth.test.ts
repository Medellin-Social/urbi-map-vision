import { describe, it, expect, beforeEach } from "vitest";
import { auth, recommendation } from "@/lib/auth";
import type { Goal } from "@/lib/auth";

// localStorage is available in jsdom (vitest default env)
beforeEach(() => localStorage.clear());

describe("auth.get / auth.set / auth.clear", () => {
  it("returns null when nothing stored", () => {
    expect(auth.get()).toBeNull();
  });

  it("stores and retrieves user", () => {
    auth.set({ name: "Ana", email: "ana@test.co" });
    expect(auth.get()?.name).toBe("Ana");
  });

  it("clear removes user", () => {
    auth.set({ name: "Ana", email: "ana@test.co" });
    auth.clear();
    expect(auth.get()).toBeNull();
  });
});

describe("auth.patch", () => {
  it("merges partial update", () => {
    auth.set({ name: "Ana", email: "ana@test.co", mapStyle: "dark" });
    auth.patch({ mapStyle: "satellite" });
    const u = auth.get();
    expect(u?.mapStyle).toBe("satellite");
    expect(u?.name).toBe("Ana");
  });
});

describe("auth.toggleFavorite", () => {
  it("adds new favorite", () => {
    auth.set({ name: "Ana", email: "ana@test.co" });
    auth.toggleFavorite({ id: 1, nombre: "El Poblado", yield: 7.2 });
    expect(auth.get()?.favorites).toHaveLength(1);
  });

  it("removes existing favorite on second toggle", () => {
    auth.set({ name: "Ana", email: "ana@test.co" });
    auth.toggleFavorite({ id: 1, nombre: "El Poblado", yield: 7.2 });
    auth.toggleFavorite({ id: 1, nombre: "El Poblado", yield: 7.2 });
    expect(auth.get()?.favorites).toHaveLength(0);
  });
});

describe("recommendation()", () => {
  const goals: Goal[] = ["airbnb", "renta-larga", "valorizacion", "nomadas"];

  it.each(goals)("returns non-empty string for goal %s", (goal) => {
    expect(recommendation(goal).length).toBeGreaterThan(10);
  });

  it("returns fallback for undefined goal", () => {
    expect(recommendation(undefined)).toContain("barrio");
  });
});
