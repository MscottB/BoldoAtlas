import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref } from "vue";

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

describe("useVista con la vista dividida", () => {
  async function dos() {
    const datos = simularAlmacen();
    vi.resetModules();
    const base = await import("@/lib/baseActiva");
    const { recordarPorArbol, useVista } = await import("./useVista");
    base.fijarBase("A");
    base.soltarDatos();
    const ambito = effectScope();
    const claves = { principal: ref<string | null>(null), lado: ref<string | null>(null) };
    const montar = (panel: "principal" | "lado", clave: string | null) => {
      claves[panel].value = clave;
      ambito.run(() => recordarPorArbol(claves[panel], panel));
    };
    return { datos, montar, ambito, principal: useVista("principal").config, lado: useVista("lado").config };
  }

  it("el mismo árbol guardado en los dos paneles: lo que cambia uno llega al otro, sin su resaltado", async () => {
    const { datos, montar, ambito, principal, lado } = await dos();
    montar("principal", "x");
    montar("lado", "x");
    lado.value = { ...lado.value, resaltar: { ...lado.value.resaltar, texto: "ana" } };
    await nextTick();
    principal.value = { ...principal.value, direccion: "horizontal" };
    await nextTick();
    expect(lado.value.direccion).toBe("horizontal");
    expect(lado.value.resaltar.texto).toBe("ana");
    expect(principal.value.resaltar.texto).toBe("");
    expect(JSON.parse(datos.get("boldo:vista:x:A")!).direccion).toBe("horizontal");

    // El otro cambia algo más: no pisa lo del primero.
    lado.value = { ...lado.value, densidad: "compacta" };
    await nextTick();
    expect(principal.value.direccion).toBe("horizontal");
    expect(principal.value.densidad).toBe("compacta");
    const guardada = JSON.parse(datos.get("boldo:vista:x:A")!);
    expect([guardada.direccion, guardada.densidad]).toEqual(["horizontal", "compacta"]);
    ambito.stop();
  });

  it("al lado en una rama sin guardar: parte de la del principal y sigue a la general; otro árbol no cambia", async () => {
    const { montar, ambito, principal, lado } = await dos();
    montar("principal", "x");
    principal.value = { ...principal.value, direccion: "horizontal" };
    await nextTick();
    montar("lado", null);
    expect(lado.value.direccion).toBe("horizontal");

    principal.value = { ...principal.value, densidad: "compacta" };
    await nextTick();
    expect(lado.value.densidad).toBe("compacta"); // la general la escribe cada cambio: la rama sin guardar la muestra

    lado.value = { ...lado.value, direccion: "vertical" };
    await nextTick();
    expect(principal.value.direccion).toBe("horizontal"); // el árbol «x» guarda la suya
    ambito.stop();
  });
});
