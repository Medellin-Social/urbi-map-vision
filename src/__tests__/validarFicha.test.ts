import { describe, it, expect } from "vitest";
import { validarFicha, FICHA_LIMITES } from "@/lib/realtorApi";

// Reglas espejo de ListingPatchRequest (api/routers/realtor.py): área gt=0 y topes
// numéricos. El editor valida antes para evitar el 422 silencioso del backend.
describe("validarFicha", () => {
  it("acepta un patch válido y uno vacío", () => {
    expect(validarFicha({})).toEqual({});
    expect(validarFicha({ precio: 450_000_000, area_m2: 95, habitaciones: 3, administracion: 650_000, antiguedad_anios: 8 })).toEqual({});
  });

  it("solo valida las llaves presentes (patch parcial)", () => {
    expect(validarFicha({ nombre_edificio: "Torre X" })).toEqual({});
  });

  it("rechaza área construida 0 o fuera de rango (gt=0)", () => {
    expect(validarFicha({ area_m2: 0 }).area_m2).toBeTruthy();
    expect(validarFicha({ area_m2: FICHA_LIMITES.areaMax + 1 }).area_m2).toBeTruthy();
    expect(validarFicha({ area_m2: 95 }).area_m2).toBeUndefined();
  });

  it("rechaza área de lote 0 o fuera de rango", () => {
    expect(validarFicha({ area_lote_m2: 0 }).area_lote_m2).toBeTruthy();
    expect(validarFicha({ area_lote_m2: 200 }).area_lote_m2).toBeUndefined();
  });

  it("rechaza precio <=0 o sobre el tope", () => {
    expect(validarFicha({ precio: 0 }).precio).toBeTruthy();
    expect(validarFicha({ precio: FICHA_LIMITES.precioMax + 1 }).precio).toBeTruthy();
  });

  it("rechaza administración y antigüedad fuera de rango", () => {
    expect(validarFicha({ administracion: FICHA_LIMITES.adminMax + 1 }).administracion).toBeTruthy();
    expect(validarFicha({ antiguedad_anios: 301 }).antiguedad_anios).toBeTruthy();
    expect(validarFicha({ antiguedad_anios: 8 }).antiguedad_anios).toBeUndefined();
  });

  it("rechaza conteos fuera de 0–100 y estrato fuera de 0–6", () => {
    expect(validarFicha({ habitaciones: 101 }).habitaciones).toBeTruthy();
    expect(validarFicha({ banos: 101 }).banos).toBeTruthy();
    expect(validarFicha({ estrato: 7 }).estrato).toBeTruthy();
    expect(validarFicha({ estrato: 6 }).estrato).toBeUndefined();
  });
});
