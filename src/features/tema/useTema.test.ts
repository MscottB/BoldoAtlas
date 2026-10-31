import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => vi.resetModules()); // el estado de useTema se lee al importar
afterEach(() => vi.unstubAllGlobals());

describe("useTema", () => {
  it("importarlo sin window (node) no lanza", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null }); // evita el aviso de localStorage de Node
    await expect(import("./useTema")).resolves.toBeDefined();
  });
});

describe("escala de la interfaz", () => {
  const conPreferencia = async (crudo: string | null) => {
    vi.stubGlobal("localStorage", { getItem: (k: string) => (k === "boldo:escala" ? crudo : null) });
    return (await import("./useTema")).useTema().escala.value;
  };

  it.each(["90", "100", "110", "125"])("acepta la guardada (%s)", async (crudo) => {
    expect(await conPreferencia(crudo)).toBe(Number(crudo));
  });
  it.each([null, "150", '"110"', "texto", "null"])(
    "usa 100 con una preferencia inválida (%s)",
    async (crudo) => {
      expect(await conPreferencia(crudo)).toBe(100);
    },
  );
});
