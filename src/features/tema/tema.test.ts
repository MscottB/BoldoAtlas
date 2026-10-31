import { describe, expect, it } from "vitest";
import { ACENTOS, contraste, textoSobre } from "./tema";

describe("contraste", () => {
  it("blanco sobre negro es 21", () => {
    expect(contraste("#ffffff", "#000000")).toBeCloseTo(21, 5);
  });
  it("es simétrico y acepta #RGB", () => {
    expect(contraste("#fff", "#000")).toBeCloseTo(21, 5);
    expect(contraste("#000000", "#ffffff")).toBeCloseTo(21, 5);
  });
});

describe("textoSobre", () => {
  it("elige el de mayor contraste para el cobre", () => {
    const t = textoSobre("#C8743F");
    const otro = t === "#ffffff" ? "#111827" : "#ffffff";
    expect(contraste(t, "#C8743F")).toBeGreaterThanOrEqual(contraste(otro, "#C8743F"));
  });
  it("blanco sobre violeta", () => {
    expect(textoSobre("#7C3AED")).toBe("#ffffff");
  });
  it("oscuro sobre amarillo claro", () => {
    expect(textoSobre("#FDE68A")).toBe("#111827");
  });
});

describe("ACENTOS", () => {
  it("define los cuatro acentos", () => {
    expect(ACENTOS).toEqual({ cobre: "#C8743F", azul: "#2563EB", verde: "#0D9488", violeta: "#7C3AED" });
  });
  it("el texto sobre cada acento cumple AA para texto chico (≥ 4,5), p. ej. el chip de vacantes", () => {
    for (const c of Object.values(ACENTOS)) expect(contraste(textoSobre(c), c)).toBeGreaterThanOrEqual(4.5);
  });
});
