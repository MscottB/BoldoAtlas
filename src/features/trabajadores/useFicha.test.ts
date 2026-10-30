import { describe, expect, it } from "vitest";
import { decidirApertura } from "./useFicha";

describe("decidirApertura", () => {
  it("confirma solo si hay otra ficha abierta con cambios sin guardar", () => {
    expect(decidirApertura({ id: "a" }, "b", true)).toBe("confirmar");
    expect(decidirApertura({ id: null }, "b", true)).toBe("confirmar"); // ficha nueva a medio llenar
    expect(decidirApertura({ id: "a" }, "b", false)).toBe("abrir");
    expect(decidirApertura({ id: "a" }, "a", true)).toBe("abrir"); // la misma ficha
    expect(decidirApertura(null, "b", true)).toBe("abrir"); // no hay ficha abierta
  });
});
