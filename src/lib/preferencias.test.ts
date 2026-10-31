import { afterEach, describe, expect, it, vi } from "vitest";
import { guardarPreferencia, leerPreferencia } from "./preferencias";

afterEach(() => vi.unstubAllGlobals());

describe("preferencias", () => {
  it("leerPreferencia usa el valor por defecto si localStorage falla", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("bloqueado");
      },
    });
    expect(leerPreferencia("tema", "claro")).toBe("claro");
    expect(() => guardarPreferencia("tema", "oscuro")).not.toThrow();
  });

  it("guarda y lee JSON con prefijo boldo:", () => {
    const datos = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => datos.get(k) ?? null,
      setItem: (k: string, v: string) => datos.set(k, v),
    });
    guardarPreferencia("escala", 110);
    expect(datos.get("boldo:escala")).toBe("110");
    expect(leerPreferencia("escala", 100)).toBe(110);
  });

  it("devuelve el valor por defecto si el JSON guardado es inválido", () => {
    vi.stubGlobal("localStorage", { getItem: () => "{roto", setItem: () => {} });
    expect(leerPreferencia("escala", 100)).toBe(100);
  });
});
