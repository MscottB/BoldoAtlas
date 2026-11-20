import { describe, expect, it } from "vitest";
import { escalaQueCabe, nombreArchivo } from "./formatos";

describe("escala_que_cabe", () => {
  it("deja la escala pedida si cabe", () => {
    expect(escalaQueCabe(2000, 1000, 2)).toEqual({ escala: 2, bajada: false });
    expect(escalaQueCabe(4096, 4096, 4)).toEqual({ escala: 4, bajada: false });
  });
  it("baja por el lado más largo", () => {
    // 10000 × 4 = 40000 > 16384: cabe a 1,6384
    const r = escalaQueCabe(10000, 100, 4);
    expect(r.bajada).toBe(true);
    expect(r.escala).toBeCloseTo(1.6384, 4);
    expect(10000 * r.escala).toBeLessThanOrEqual(16384);
  });
  it("baja por el área", () => {
    // cuadrado: lado y área coinciden en 2,048; el resultado cumple las dos reglas
    const r = escalaQueCabe(8000, 8000, 4);
    expect(r.bajada).toBe(true);
    expect(8000 * r.escala).toBeLessThanOrEqual(16384);
    expect(8000 * 8000 * r.escala ** 2).toBeLessThanOrEqual(268435456);
    expect(r.escala).toBeCloseTo(2.048, 3);
  });
});

describe("nombre_archivo_seguro", () => {
  it("no lleva caracteres que Windows rechaza", () => {
    const n = nombreArchivo('Mi: "Org"/<1>|?*', "Rama \ Ventas", "presentacion", "png", "2026-11-20");
    expect(n).not.toMatch(/[\/:*?"<>|]/);
    expect(n.endsWith("_2026-11-20.png")).toBe(true);
  });
  it("conserva letras con tilde y ordena organización, alcance y nivel", () => {
    expect(nombreArchivo("Ñuñoa", "Toda la organización", "estructura", "svg", "2026-11-20")).toBe(
      "Ñuñoa_Toda_la_organización_estructura_2026-11-20.svg",
    );
  });
  it("si no queda nada usa BoldoAtlas", () => {
    expect(nombreArchivo("???", "", "pantalla", "jpg", "2026-11-20")).toBe(
      "BoldoAtlas_pantalla_2026-11-20.jpg",
    );
  });
});
