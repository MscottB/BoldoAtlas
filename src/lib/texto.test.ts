import { describe, expect, it } from "vitest";
import { iniciales, normalizarTexto } from "./texto";

describe("iniciales", () => {
  it("las de las dos primeras palabras, en mayúsculas; sin nombre, vacío", () => {
    expect(iniciales("ana maría rojas")).toBe("AM");
    expect(iniciales("  Luis  ")).toBe("L");
    expect(iniciales("")).toBe("");
  });
});

describe("normalizarTexto", () => {
  it("colapsa espacios y pasa a minúsculas", () =>
    expect(normalizarTexto("  Analista  de  Compras ")).toBe("analista de compras"));

  it("quita tildes y diéresis", () => expect(normalizarTexto("Muñoz")).toBe("munoz"));
});
