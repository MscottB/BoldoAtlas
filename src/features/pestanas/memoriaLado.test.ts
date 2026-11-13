import { describe, expect, it } from "vitest";
import { BASE_LADO, POR_PERSONA, POR_UNIDAD, caben } from "./memoriaLado";

const info = { id: "B", personas: 1000, unidades: 100 };
const estimado = BASE_LADO + 1000 * POR_PERSONA + 100 * POR_UNIDAD;

describe("caben", () => {
  it("caben_con_y_sin_performance_memory", () => {
    // Sin `performance.memory` (otro navegador) no se pregunta.
    expect(caben(info)).toBe(true);
    expect(caben(info, undefined)).toBe(true);
    // Hasta el 80 % del límite, sí; un byte más, no.
    const limite = 4 * 2 ** 30;
    const tope = 0.8 * limite;
    expect(caben(info, { usedJSHeapSize: tope - estimado, jsHeapSizeLimit: limite })).toBe(true);
    expect(caben(info, { usedJSHeapSize: tope - estimado + 1, jsHeapSizeLimit: limite })).toBe(false);
  });

  it("la estimación crece con las personas y las unidades", () => {
    const limite = 1000 * 2 ** 20;
    const usado = 0.8 * limite - BASE_LADO - 10;
    expect(
      caben({ id: "B", personas: 0, unidades: 0 }, { usedJSHeapSize: usado, jsHeapSizeLimit: limite }),
    ).toBe(true);
    expect(
      caben({ id: "B", personas: 1, unidades: 0 }, { usedJSHeapSize: usado, jsHeapSizeLimit: limite }),
    ).toBe(false);
    expect(
      caben({ id: "B", personas: 0, unidades: 1 }, { usedJSHeapSize: usado, jsHeapSizeLimit: limite }),
    ).toBe(false);
  });
});

describe("constantes medidas", () => {
  it("con la grande (10.000 personas, 2.000 unidades) estiman el 50 % sobre lo medido en CI (+23,6 MB)", () => {
    const grande = BASE_LADO + 10_000 * POR_PERSONA + 2_000 * POR_UNIDAD;
    expect(grande).toBeGreaterThanOrEqual(1.5 * 23.6 * 2 ** 20);
    // y no tanto más: con el límite de CI y lo que usa la app, no pregunta
    expect(grande).toBeLessThan(2 * 1.5 * 23.6 * 2 ** 20);
    expect(
      caben(
        { id: "B", personas: 10_000, unidades: 2_000 },
        { usedJSHeapSize: 43_301_810, jsHeapSizeLimit: 4_395_630_592 },
      ),
    ).toBe(true);
  });
});
