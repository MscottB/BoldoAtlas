import { describe, expect, it } from "vitest";
import { iniciales, normalizarTexto, partirCoincidencia } from "./texto";

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

describe("partirCoincidencia", () => {
  it("encuentra sin tildes ni mayúsculas y devuelve el texto original", () => {
    expect(partirCoincidencia("Ana Pérez", "perez")).toEqual(["Ana ", "Pérez", ""]);
    expect(partirCoincidencia("MECÁNICA norte", "canica")).toEqual(["ME", "CÁNICA", " norte"]);
  });
  it("varios espacios seguidos cuentan como uno, como en el filtro", () => {
    expect(partirCoincidencia("Ana  Pérez", "ana p")).toEqual(["", "Ana  P", "érez"]);
    expect(partirCoincidencia("Ana  Pérez  Soto", "soto")).toEqual(["Ana  Pérez  ", "Soto", ""]);
  });
  it("sin búsqueda o sin coincidencia, null", () => {
    expect(partirCoincidencia("Ana", "")).toBeNull();
    expect(partirCoincidencia("Ana", "zz")).toBeNull();
  });
});
