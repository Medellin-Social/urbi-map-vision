import { describe, it, expect } from "vitest";
import { contactoSchema } from "@/components/agentes/agenteShared";

// El form de contacto del agente: la validación es trust boundary (se repite en el
// server). Estos casos fijan el contrato: consentimiento obligatorio, al menos un
// canal de contacto, email bien formado.
const base = { nombre: "Ana", email: "", telefono: "", interes: "comprar" as const, mensaje: "", consentimiento: true };

describe("contactoSchema", () => {
  it("acepta con email + consentimiento", () => {
    expect(contactoSchema.safeParse({ ...base, email: "ana@x.com" }).success).toBe(true);
  });

  it("acepta solo con teléfono", () => {
    expect(contactoSchema.safeParse({ ...base, telefono: "3001234567" }).success).toBe(true);
  });

  it("rechaza sin consentimiento", () => {
    const r = contactoSchema.safeParse({ ...base, email: "ana@x.com", consentimiento: false });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.path[0] === "consentimiento")).toBe(true);
  });

  it("rechaza sin email ni teléfono", () => {
    const r = contactoSchema.safeParse(base);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.path[0] === "email")).toBe(true);
  });

  it("rechaza email mal formado", () => {
    expect(contactoSchema.safeParse({ ...base, email: "no-es-email" }).success).toBe(false);
  });

  it("rechaza nombre vacío", () => {
    expect(contactoSchema.safeParse({ ...base, email: "ana@x.com", nombre: "  " }).success).toBe(false);
  });
});
