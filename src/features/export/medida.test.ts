import { describe, expect, it } from "vitest";
import { anchoTexto, partir, recortar } from "./medida";

describe("medida del texto sin DOM", () => {
  it("el ancho crece con el texto, las mayúsculas y la negrita", () => {
    expect(anchoTexto("", 12)).toBe(0);
    expect(anchoTexto("abc", 12)).toBe(anchoTexto("abc", 12));
    expect(anchoTexto("ABC", 12)).toBeGreaterThan(anchoTexto("abc", 12));
    expect(anchoTexto("abc", 12, true)).toBeGreaterThan(anchoTexto("abc", 12));
    expect(anchoTexto("abc", 24)).toBe(2 * anchoTexto("abc", 12));
  });

  it("recortar deja lo que cabe y agrega «…»", () => {
    expect(recortar("Finanzas", 200, 12)).toBe("Finanzas");
    const corto = recortar("Gerencia de Operaciones Regionales", 80, 12);
    expect(corto.endsWith("…")).toBe(true);
    expect(anchoTexto(corto, 12)).toBeLessThanOrEqual(80);
  });

  it("partir corta por palabras y no pasa del máximo de líneas", () => {
    const lineas = partir("Gerencia de Operaciones y Logística Regional del Norte", 120, 14, 2, true);
    expect(lineas).toHaveLength(2);
    expect(lineas[0]).toBe("Gerencia de");
    expect(lineas[1]!.endsWith("…")).toBe(true);
    for (const l of lineas) expect(anchoTexto(l, 14, true)).toBeLessThanOrEqual(120);
    expect(partir("Finanzas", 120, 14, 2)).toEqual(["Finanzas"]);
    expect(partir("", 120, 14, 2)).toEqual([]);
  });
});
