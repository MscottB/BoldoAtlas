import { describe, expect, it } from "vitest";
import { normalizarTexto } from "./texto";

describe("normalizarTexto", () => {
  it("colapsa espacios y pasa a minúsculas", () =>
    expect(normalizarTexto("  Analista  de  Compras ")).toBe("analista de compras"));

  it("quita tildes y diéresis", () => expect(normalizarTexto("Muñoz")).toBe("munoz"));
});
