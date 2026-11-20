import { describe, expect, it } from "vitest";
import { escalaQueCabe, fondoDePng, nombreArchivo } from "./formatos";

describe("escala_que_cabe", () => {
  it("deja la escala pedida si cabe", () => {
    expect(escalaQueCabe(2000, 1000, 2)).toEqual({ escala: 2, bajada: false });
    expect(escalaQueCabe(2500, 2500, 4)).toEqual({ escala: 4, bajada: false });
  });
  it("baja por el lado más largo", () => {
    // 10000 × 4 = 40000 > 16384: cabe a 1,6384
    const r = escalaQueCabe(10000, 100, 4);
    expect(r.bajada).toBe(true);
    expect(r.escala).toBeCloseTo(1.6384, 4);
    expect(10000 * r.escala).toBeLessThanOrEqual(16384);
  });
  it("baja por el área", () => {
    // 10000 × 9000 a 2x: el lado (20000) ya pasa, pero a 1,15x el lado cabe y el área (90M × escala²) manda
    const r = escalaQueCabe(10000, 9000, 2);
    expect(r.bajada).toBe(true);
    expect(10000 * r.escala).toBeLessThan(16384);
    expect(10000 * 9000 * r.escala ** 2).toBeLessThanOrEqual(120_000_000);
    expect(r.escala).toBeCloseTo(Math.sqrt(120_000_000 / 90_000_000), 3);
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
  it("corta los nombres largos", () => {
    const n = nombreArchivo("O".repeat(300), "A".repeat(300), "presentacion", "png", "2026-11-20");
    expect(n.length).toBeLessThanOrEqual(150);
    expect(n.endsWith("_presentacion_2026-11-20.png")).toBe(true);
  });
  it("si no queda nada usa BoldoAtlas", () => {
    expect(nombreArchivo("???", "", "pantalla", "jpg", "2026-11-20")).toBe(
      "BoldoAtlas_pantalla_2026-11-20.jpg",
    );
  });
});

describe("fondo_de_png", () => {
  it("el fondo elegido solo cuenta en PNG; JPG y SVG van en blanco", () => {
    expect(fondoDePng("png", "transparente")).toBe("transparente");
    expect(fondoDePng("png", "blanco")).toBe("blanco");
    expect(fondoDePng("jpg", "transparente")).toBe("blanco");
    expect(fondoDePng("svg", "transparente")).toBe("blanco");
  });
});
