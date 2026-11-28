import { describe, it, expect } from "vitest";
import { buildBuscarQS } from "@/components/agentes/agenteShared";

// Contrato filtros → querystring del endpoint /listings/agentes/buscar.
// Es lo que hace compartibles las URLs del directorio y funcionar el botón atrás.
const opts = { ciudad: "medellin", pg: 1, pageSize: 20 };
const parse = (qs: string) => Object.fromEntries(new URLSearchParams(qs));

describe("buildBuscarQS", () => {
  it("defaults: ciudad, orden=relevantes, pg, page_size", () => {
    const q = parse(buildBuscarQS({}, opts));
    expect(q).toMatchObject({ ciudad: "medellin", orden: "relevantes", pg: "1", page_size: "20" });
    expect(q.zona).toBeUndefined();
  });

  it("incluye solo los filtros presentes", () => {
    const q = parse(buildBuscarQS({ zona: "El Poblado", idiomas: "Inglés", especialidad: "extranjeros", rating_min: 4.5 }, opts));
    expect(q.zona).toBe("El Poblado");
    expect(q.idiomas).toBe("Inglés");
    expect(q.especialidad).toBe("extranjeros");
    expect(q.rating_min).toBe("4.5");
    expect(q.nombre).toBeUndefined();
    expect(q.tipo).toBeUndefined();
  });

  it("respeta orden e intención explícitos", () => {
    const q = parse(buildBuscarQS({ orden: "mas-vendidos", intencion: "comprar" }, opts));
    expect(q.orden).toBe("mas-vendidos");
    expect(q.intencion).toBe("comprar");
  });

  it("paginación va a la URL", () => {
    expect(parse(buildBuscarQS({}, { ...opts, pg: 3 })).pg).toBe("3");
  });

  it("rating_min=0 no se envía (falsy)", () => {
    expect(parse(buildBuscarQS({ rating_min: 0 }, opts)).rating_min).toBeUndefined();
  });

  it("tipo_agente (deep-link del aviso no-registrado) viaja al endpoint", () => {
    const q = parse(buildBuscarQS({ tipo_agente: "certified,preferred" }, opts));
    expect(q.tipo_agente).toBe("certified,preferred");
  });
});
