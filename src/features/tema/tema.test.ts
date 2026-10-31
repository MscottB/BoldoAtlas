import { describe, expect, it } from "vitest";
import { ACENTOS, MARCA_TEXTO, contraste, marcaTenue, textoSobre } from "./tema";

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

describe("MARCA_TEXTO", () => {
  // background, card y sidebar de main.css (oklch → sRGB): claro 0.96 / 1 / 0.945; oscuro 0.145 / 0.205 / 0.205.
  const FONDOS = { claro: ["#f2f2f2", "#ffffff", "#ededed"], oscuro: ["#0a0a0a", "#171717", "#171717"] };
  it.each(Object.keys(ACENTOS) as (keyof typeof ACENTOS)[])(
    "%s como texto cumple AA en los dos temas",
    (a) => {
      for (const tema of ["claro", "oscuro"] as const)
        for (const fondo of FONDOS[tema])
          expect(contraste(MARCA_TEXTO[a][tema], fondo)).toBeGreaterThanOrEqual(4.5);
    },
  );
});

describe("marcaTenue", () => {
  it("el azul marino de Gerencia General se pierde en la tarjeta oscura, no en la clara", () => {
    expect(marcaTenue("#1e2a38", true)).toBe(true);
    expect(marcaTenue("#1e2a38", false)).toBe(false);
  });
  it("un amarillo claro se pierde en la tarjeta clara; los acentos no", () => {
    expect(marcaTenue("#fde68a", false)).toBe(true);
    for (const c of Object.values(ACENTOS)) expect(marcaTenue(c, false) || marcaTenue(c, true)).toBe(false);
  });
});
