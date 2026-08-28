import { describe, expect, it } from "vitest";
import { translateString } from "@/lib/i18n";

// Fase 1 (POT/estrato manzana) y Fase 2 (mercado real) agregaron español nuevo
// a FloatingPanel.tsx/ListingDrawer.tsx. translateString hace substring
// .includes()/.split().join() ordenado por longitud — no regex de
// word-boundary real (comentario en i18n.tsx:6-9 es aspiracional, no aplicado
// en código). Frases cortas ya existentes ("Valor", "Mes", "Área", "Venta")
// corrompían estos textos nuevos a medias antes de agregar las entradas largas
// (memoria: bug real previo "Bueno"→"Buenos Aires" por la misma causa).
// Este test fija la traducción exacta esperada — si algo la corrompe a un
// híbrido es-en, el valor no calza y el test avisa.
const CASOS: Array<[string, string]> = [
  ["Áreas y corredores de alta mixtura", "High mixed-use areas and corridors"],
  ["Áreas y corredores de media mixtura", "Medium mixed-use areas and corridors"],
  ["Áreas de baja mixtura", "Low mixed-use areas"],
  ["Uso Dotacional", "Institutional use"],
  ["Espacio Público Existente", "Existing public space"],
  ["Espacio Público Proyectado", "Planned public space"],
  ["Uso de suelo (POT)", "Land use (POT)"],
  ["Ventas cerradas", "Closed sales"],
  ["Valor mediana cierre", "Median closing value"],
  ["Variación anual", "Annual change"],
  ["Meses de inventario", "Months of inventory"],
  ["Mercado de vendedor", "Seller's market"],
  ["Mercado de comprador", "Buyer's market"],
  ["Mercado balanceado", "Balanced market"],
  ["Valor absoluto, no controla mezcla de tipo/tamaño de inmueble.", "Absolute value, does not control for property type/size mix."],
];

describe("i18n: strings nuevos de Fase 1/2 traducen limpio, sin corrupción a medias", () => {
  it.each(CASOS)("%s → %s", (es, en) => {
    expect(translateString(es)).toBe(en);
  });

  it("una frase con el texto nuevo embebido (nodo real de FloatingPanel) también traduce limpio", () => {
    // Reproduce el patrón real: "Ventas cerradas {anio}" como un solo text node.
    expect(translateString("Ventas cerradas 2025")).toBe("Closed sales 2025");
    // Reproduce "Cierra en {pct}% del precio pedido".
    expect(translateString("Cierra en 92.3% del precio pedido")).toBe("Closes at 92.3% of asking price");
  });
});
