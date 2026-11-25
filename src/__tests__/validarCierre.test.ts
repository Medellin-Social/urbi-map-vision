import { describe, it, expect } from "vitest";
import { validarCierre, CIERRE_LIMITES } from "@/lib/realtorApi";

// Reglas espejo de CerrarListingRequest (api/routers/realtor.py, commit 75c5634):
// precio >0 y <=1e13 · matrícula obligatoria, <=30, charset · catastral opcional,
// <=40, charset · fecha no futura. El modal valida antes para evitar el 422.
const HOY = "2026-11-24";

describe("validarCierre", () => {
  it("acepta un reporte válido completo", () => {
    expect(
      validarCierre(
        { precio_cierre: 450_000_000, matricula_inmobiliaria: "001-123456", cedula_catastral: "05001-0-01-0001", fecha_cierre: "2026-11-01" },
        HOY,
      ),
    ).toEqual({});
  });

  it("acepta sin fecha ni catastral (opcionales)", () => {
    expect(validarCierre({ precio_cierre: 1, matricula_inmobiliaria: "ABC 123" }, HOY)).toEqual({});
  });

  it("rechaza precio <= 0 y precio sobre el tope", () => {
    expect(validarCierre({ precio_cierre: 0, matricula_inmobiliaria: "001" }, HOY).precio).toBeTruthy();
    expect(validarCierre({ precio_cierre: CIERRE_LIMITES.precioMax + 1, matricula_inmobiliaria: "001" }, HOY).precio).toBeTruthy();
  });

  it("exige matrícula y rechaza charset/largo inválidos", () => {
    expect(validarCierre({ precio_cierre: 1, matricula_inmobiliaria: "" }, HOY).matricula).toBeTruthy();
    expect(validarCierre({ precio_cierre: 1, matricula_inmobiliaria: "001/123#" }, HOY).matricula).toBeTruthy();
    expect(validarCierre({ precio_cierre: 1, matricula_inmobiliaria: "x".repeat(31) }, HOY).matricula).toBeTruthy();
  });

  it("rechaza cédula catastral con caracteres o largo inválidos", () => {
    expect(validarCierre({ precio_cierre: 1, matricula_inmobiliaria: "001", cedula_catastral: "abc.def" }, HOY).catastral).toBeTruthy();
    expect(validarCierre({ precio_cierre: 1, matricula_inmobiliaria: "001", cedula_catastral: "y".repeat(41) }, HOY).catastral).toBeTruthy();
  });

  it("rechaza fecha futura, acepta hoy y pasado", () => {
    expect(validarCierre({ precio_cierre: 1, matricula_inmobiliaria: "001", fecha_cierre: "2026-11-25" }, HOY).fecha).toBeTruthy();
    expect(validarCierre({ precio_cierre: 1, matricula_inmobiliaria: "001", fecha_cierre: HOY }, HOY).fecha).toBeUndefined();
    expect(validarCierre({ precio_cierre: 1, matricula_inmobiliaria: "001", fecha_cierre: "2020-01-01" }, HOY).fecha).toBeUndefined();
  });
});
