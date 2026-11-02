import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function simularAlmacen(inicial: Record<string, string> = {}) {
  const datos = new Map(Object.entries(inicial));
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => datos.set(k, v),
  });
  return datos;
}

// useVista guarda su estado a nivel de módulo: cada prueba lo importa de nuevo (y baseActiva con él).
async function cargar() {
  vi.resetModules();
  const base = await import("@/lib/baseActiva");
  const { useVista } = await import("./useVista");
  return { ...useVista(), ...base };
}

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe("useVista por organización", () => {
  it("al soltar los datos carga la vista de la otra organización", async () => {
    simularAlmacen({ "boldo:minimapa:A": "true" });
    const { minimapa, fijarBase, soltarDatos } = await cargar();
    fijarBase("A");
    soltarDatos();
    expect(minimapa.value).toBe(true);
    fijarBase("B");
    soltarDatos();
    expect(minimapa.value).toBe(false);
  });

  it("lo de A no se guarda con la clave de B", async () => {
    const datos = simularAlmacen();
    const { minimapa, fijarBase, soltarDatos } = await cargar();
    fijarBase("A");
    soltarDatos();
    minimapa.value = true;
    expect(datos.get("boldo:minimapa:A")).toBe("true");
    fijarBase("B");
    soltarDatos();
    expect(datos.get("boldo:minimapa:B")).not.toBe("true");
    expect(datos.get("boldo:minimapa:A")).toBe("true");
  });

  it("importado antes de fijarBase, tras soltarDatos() lee lo guardado", async () => {
    simularAlmacen({ "boldo:minimapa:A": "true", "boldo:vista:A": '{"direccion":"horizontal"}' });
    const { minimapa, config, fijarBase, soltarDatos } = await cargar();
    expect(minimapa.value).toBe(false);
    expect(config.value.direccion).toBe("vertical");
    fijarBase("A");
    soltarDatos();
    expect(minimapa.value).toBe(true);
    expect(config.value.direccion).toBe("horizontal");
  });
});
