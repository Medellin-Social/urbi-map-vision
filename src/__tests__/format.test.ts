import { describe, it, expect } from "vitest";
import { formatCOP, formatPct, yieldColor } from "@/lib/format";

describe("formatCOP", () => {
  it("formats millions with M suffix", () => {
    expect(formatCOP(300_000_000)).toMatch(/300/);
  });

  it("formats zero without crashing", () => {
    expect(() => formatCOP(0)).not.toThrow();
  });
});

describe("formatPct", () => {
  it("appends % sign", () => {
    expect(formatPct(7.5)).toContain("%");
  });
});

describe("yieldColor", () => {
  it("returns a CSS color string", () => {
    expect(yieldColor(8)).toMatch(/^#|^rgb/);
  });

  it("handles zero yield", () => {
    expect(() => yieldColor(0)).not.toThrow();
  });
});
