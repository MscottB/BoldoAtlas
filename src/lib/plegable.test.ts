import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import { usePlegable } from "./plegable";

afterEach(() => vi.unstubAllGlobals());

const conAlmacen = (inicial: Record<string, string> = {}) => {
  const datos = new Map(Object.entries(inicial));
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => datos.set(k, v),
  });
  return datos;
};

describe("usePlegable", () => {
  it.each([null, "false", '"true"', "1", "{roto"])("empieza plegado sin un true guardado (%s)", (crudo) => {
    conAlmacen(crudo === null ? {} : { "boldo:plegado:x": crudo });
    expect(usePlegable("x").abierto.value).toBe(false);
  });

  it("un true guardado lo abre, y abrir o plegar se guarda por clave", async () => {
    const datos = conAlmacen({ "boldo:plegado:x": "true" });
    const { abierto, alPlegar } = usePlegable("x");
    expect(abierto.value).toBe(true);
    alPlegar(false);
    await nextTick();
    expect(abierto.value).toBe(false);
    expect(datos.get("boldo:plegado:x")).toBe("false");
    expect(datos.has("boldo:plegado:y")).toBe(false);
  });

  it("forzar lo abre sin guardar nada y queda abierto hasta que el usuario lo pliega", async () => {
    const datos = conAlmacen();
    const error = ref(false);
    const { abierto, alPlegar } = usePlegable("x", () => error.value);
    expect(abierto.value).toBe(false);
    error.value = true;
    expect(abierto.value).toBe(true);
    alPlegar(true); // el toggle que dispara la apertura forzada
    await nextTick();
    expect(datos.has("boldo:plegado:x")).toBe(false);
    error.value = false; // p. ej. vaciar el campo con el foco: no se cierra bajo el cursor
    expect(abierto.value).toBe(true);
    alPlegar(false);
    await nextTick();
    expect(abierto.value).toBe(false);
    expect(datos.has("boldo:plegado:x")).toBe(false);
  });

  it("forzado desde el inicio (destino de un salto) abre sin guardar", () => {
    const datos = conAlmacen();
    expect(usePlegable("x", () => true).abierto.value).toBe(true);
    expect(datos.size).toBe(0);
  });
});
