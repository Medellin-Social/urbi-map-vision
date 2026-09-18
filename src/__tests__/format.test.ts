import { describe, it, expect } from "vitest";
import { formatCOP, formatPct, yieldColor } from "@/lib/format";

describe("formatCOP", () => {
  it("formats millions with M suffix", () => {
    expect(formatCOP(300_000_000)).toMatch(/300/);
  });

  it("formats zero without crashing", () => {
    expect(() => formatCOP(0)).not.toThrow();
  });

  it("puts the minus sign before the $, not after it", () => {
    expect(formatCOP(-344_400)).toBe("-$344K COP");
    expect(formatCOP(-2_500_000)).toBe("-$3M COP");
    expect(formatCOP(-500)).toBe("-$500 COP");
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
