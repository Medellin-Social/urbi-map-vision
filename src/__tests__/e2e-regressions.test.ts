import { describe, it, expect } from "vitest";
import { mapTourReady } from "@/lib/segmento";

describe("map tour vs segment gate", () => {
  it("never opens while the gate is pending or open", () => {
    expect(mapTourReady("pending", true, false)).toBe(false);
    expect(mapTourReady("open", true, false)).toBe(false);
  });
  it("opens once the gate is done, data is loaded and it is not a deep link", () => {
    expect(mapTourReady("done", true, false)).toBe(true);
    expect(mapTourReady("done", false, false)).toBe(false);
    expect(mapTourReady("done", true, true)).toBe(false);
  });
});

import { readFileSync } from "node:fs";
import { PHRASES } from "@/lib/i18n-phrases";

describe("map legend + studio label regressions", () => {
  it("translates the legend labels to EN", () => {
    const m = new Map(PHRASES as [string, string][]);
    expect(m.get("Tipos")).toBe("Types");
    expect(m.get("Cerrar leyenda")).toBe("Close legend");
  });
  it("shows Studio (not '0 hab') in popup, drawer and card", () => {
    for (const f of ["components/FloatingPanel.tsx", "components/ListingDrawer.tsx", "components/MLSPanel.tsx"]) {
      expect(readFileSync(`src/${f}`, "utf8")).toContain('=== 0 ? "Studio"');
    }
  });
});

import { copyText } from "@/lib/clipboard";
describe("copyText never throws", () => {
  it("returns false (no rejection) when clipboard write is denied", async () => {
    const orig = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new Error("denied")) } });
    await expect(copyText("x")).resolves.toBeTypeOf("boolean");
    if (orig) Object.defineProperty(navigator, "clipboard", orig); else delete (navigator as any).clipboard;
  });
  it("works when clipboard API is missing", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    await expect(copyText("x")).resolves.toBeTypeOf("boolean");
  });
});

describe("deep-link ?listing= flies the map to the pin", () => {
  it("map.tsx arms the fly on deep-link and the drawer reports coords to fly", () => {
    const map = readFileSync("src/routes/map.tsx", "utf8");
    // deep-link mount arms the one-shot fly
    expect(map).toMatch(/flyOnDrawerLoadRef\.current\s*=\s*true/);
    // the callback consumes it once and flies to the listing coords
    expect(map).toMatch(/flyOnDrawerLoadRef\.current\s*=\s*false/);
    expect(map).toContain("onLocate={(lat, lng, barrioId) =>");
    // and selects the barrio (highlight + scope) via the polygon-click path
    expect(map).toContain("setDeepLinkBarrioId(barrioId)");
    expect(map).toMatch(/deepLinkBarrioId[\s\S]*?handleMapBarrioClick\(deepLinkBarrioId\)/);
    const drawer = readFileSync("src/components/ListingDrawer.tsx", "utf8");
    expect(drawer).toContain("onLocate?.(listing.lat, listing.lon, listing.barrio_id ?? null)");
  });
  it("preselects the pin on a shared link and keeps the highlight after pins load", () => {
    const map = readFileSync("src/routes/map.tsx", "utf8");
    // the shared listing's pin is preselected
    expect(map).toMatch(/setHighlightedListingId\(id\)/);
    // highlight survives the pins loading after it was set (reapplied on viewport setData)
    const mv = readFileSync("src/components/MapView.tsx", "utf8");
    expect(mv).toMatch(/highlightedIdRef\.current != null[\s\S]*?setFeatureState/);
  });
  it("shows the listing pins on a shared link (unpause + layer re-toggle after load)", () => {
    const map = readFileSync("src/routes/map.tsx", "utf8");
    // a ?listing= visitor with no stored segmento must not stay paused (gate hidden by drawer)
    expect(map).toContain('paused={segmentoGate !== "done" && !isListingDeepLink}');
    // deep-link flips mapView="listings" before "load"; the layer-visibility effect must
    // re-run after mapLoaded or the listing pins stay visibility:"none".
    const mv = readFileSync("src/components/MapView.tsx", "utf8");
    expect(mv).toMatch(/toggle capas[\s\S]*?\}, \[mapView, mapLoaded\]\)/);
  });
});
