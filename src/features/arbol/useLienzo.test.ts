import { describe, expect, it } from "vitest";
import { unidades } from "./fixture";
import { coincideFiltro, destinoAlSoltar, tipoHijo } from "./useLienzo";

const mantencion = unidades.find((x) => x.id === "mantencion")!;

describe("lógica del lienzo", () => {
  it("tipoHijo sugiere gerencia → área → subárea → otra", () => {
    expect(tipoHijo("gerencia")).toBe("area");
    expect(tipoHijo("area")).toBe("subarea");
    expect(tipoHijo("subarea")).toBe("otra");
    expect(tipoHijo("otra")).toBe("otra");
  });

  it("coincideFiltro: sin filtros todo coincide", () => {
    expect(coincideFiltro(mantencion, "", null)).toBe(true);
    expect(coincideFiltro(mantencion, "   ", null)).toBe(true);
  });

  it("coincideFiltro por texto ignora tildes y mayúsculas", () => {
    expect(coincideFiltro(mantencion, "MANTENCION", null)).toBe(true);
    expect(coincideFiltro(mantencion, "tenci", null)).toBe(true);
    expect(coincideFiltro(mantencion, "finanzas", null)).toBe(false);
  });

  it("coincideFiltro por etiqueta y, con ambos, exige los dos", () => {
    expect(coincideFiltro(mantencion, "", new Set(["mantencion"]))).toBe(true);
    expect(coincideFiltro(mantencion, "", new Set(["finanzas"]))).toBe(false);
    expect(coincideFiltro(mantencion, "mante", new Set(["mantencion"]))).toBe(true);
    expect(coincideFiltro(mantencion, "otra", new Set(["mantencion"]))).toBe(false);
  });

  it("destinoAlSoltar da la tarjeta bajo el centro de la arrastrada, nunca ella misma", () => {
    const pos = new Map([
      ["a", { x: 0, y: 0 }],
      ["b", { x: 300, y: 0 }],
    ]);
    const tam = { ancho: 220, alto: 112 };
    expect(destinoAlSoltar("a", { x: 310, y: 10 }, pos, tam)).toBe("b"); // centro en (420, 66)
    expect(destinoAlSoltar("a", { x: 0, y: 0 }, pos, tam)).toBeNull(); // sobre sí misma
    expect(destinoAlSoltar("a", { x: 0, y: 500 }, pos, tam)).toBeNull(); // en el vacío
  });
});
