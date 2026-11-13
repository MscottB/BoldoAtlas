import { afterEach, describe, expect, it, vi } from "vitest";
import { traducirError } from "@/db/errores";
import { i18n } from "@/i18n";

const LADO = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const ABIERTA = "0190a1b2-c3d4-7e5f-8a9b-ffffffffffff";
const VEDADOS = ["db_lote", "foto_bytes", "info_app", "info_proyecto", "plugin:event|listen"];

vi.stubGlobal("__APP_VERSION__", "prueba");
afterEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal("__APP_VERSION__", "prueba");
  vi.doUnmock("@tauri-apps/api/core");
  vi.resetModules();
});

// Los módulos leen `?lado=` al cargarse: se vuelven a cargar con la dirección de cada prueba.
async function enLado(search = `?lado=${LADO}`) {
  vi.stubGlobal("location", { search });
  vi.resetModules();
  return import("./puente");
}

// El IPC de Tauri, el del padre o el que Tauri mismo le puso al iframe.
function internosTauri(respuesta: unknown = [{ id: "u1" }]) {
  return {
    invoke: vi.fn<(cmd: string, args?: object, opciones?: unknown) => Promise<unknown>>(
      async () => respuesta,
    ),
    convertFileSrc: vi.fn((ruta: string, protocolo = "asset") => `http://${protocolo}.localhost/${ruta}`),
    transformCallback: vi.fn<(llamada?: () => void) => number>(() => 7),
    unregisterCallback: vi.fn<(id: number) => void>(),
    metadata: { currentWindow: { label: "main" } },
  };
}

describe("filtrarLado", () => {
  it("solo deja db_consultar, con el id del lado aunque se pida con otro", async () => {
    const { filtrarLado } = await enLado();
    for (const cmd of VEDADOS) expect(filtrarLado(cmd, { baseId: LADO }), cmd).toBeNull();
    expect(filtrarLado("db_consultar", { baseId: ABIERTA, sql: "SELECT 1" })).toEqual({
      baseId: LADO,
      sql: "SELECT 1",
    });
  });
});

describe("el cliente en modo lado", () => {
  it("Tauri ya le dio IPC al iframe (Windows): no se toca, y el cliente filtra", async () => {
    const tauri = internosTauri();
    // como lo define Tauri: sin `writable` ni `configurable`
    const iframe = {};
    Object.defineProperty(iframe, "__TAURI_INTERNALS__", { value: tauri });
    vi.stubGlobal("window", iframe);
    const { instalarPuente } = await enLado();
    expect(() => instalarPuente({} as Window)).not.toThrow();
    expect((iframe as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__).toBe(tauri);

    vi.doMock("@tauri-apps/api/core", () => ({ invoke: tauri.invoke }));
    const c = await import("@/db/cliente");
    (await import("@/lib/baseActiva")).fijarBase(ABIERTA);
    for (const llamada of [
      () => c.infoApp(),
      () => c.lote([{ sql: "DELETE FROM unidades" }]),
      () => c.colorOrganizacion(ABIERTA, "#000000"),
      () => c.infoProyecto(),
    ])
      await expect(llamada()).rejects.toBe("solo_lectura");
    expect(tauri.invoke).not.toHaveBeenCalled();
    await c.consultar("SELECT 1");
    expect(tauri.invoke).toHaveBeenCalledWith("db_consultar", { sql: "SELECT 1", params: [], baseId: LADO });
  });

  it("fuera del modo lado el cliente no filtra", async () => {
    const tauri = internosTauri();
    vi.doMock("@tauri-apps/api/core", () => ({ invoke: tauri.invoke }));
    await enLado("");
    const c = await import("@/db/cliente");
    await c.infoApp();
    expect(tauri.invoke).toHaveBeenCalledWith("info_app");
  });
});

describe("instalarPuente, sin IPC propio (macOS y Linux)", () => {
  async function conPadre(respuesta?: unknown) {
    const internos = internosTauri(respuesta);
    const iframe: Record<string, unknown> = {};
    vi.stubGlobal("window", iframe);
    const { instalarPuente } = await enLado();
    instalarPuente({ __TAURI_INTERNALS__: internos } as unknown as Window);
    return { internos, puente: iframe.__TAURI_INTERNALS__ as typeof internos };
  }

  it("puente_solo_deja_db_consultar_con_el_id_del_lado", async () => {
    const { internos, puente } = await conPadre();
    for (const cmd of VEDADOS)
      await expect(puente.invoke(cmd, { baseId: LADO })).rejects.toBe("solo_lectura");
    expect(internos.invoke).not.toHaveBeenCalled();
    await puente.invoke("db_consultar", { baseId: ABIERTA, sql: "SELECT 1", params: [] });
    expect(internos.invoke).toHaveBeenCalledWith(
      "db_consultar",
      { baseId: LADO, sql: "SELECT 1", params: [] },
      undefined,
    );
  });

  it("puente_devuelve_objetos_del_iframe", async () => {
    const filas = [{ id: "u1", nombre: "Finanzas" }];
    const { puente } = await conPadre(filas);
    const r = await puente.invoke("db_consultar", { sql: "SELECT 1", params: [] });
    expect(r).toEqual(filas);
    expect(r).not.toBe(filas);
    expect((r as typeof filas)[0]).not.toBe(filas[0]);
  });

  it("los errores de Rust también se copian", async () => {
    const { internos, puente } = await conPadre();
    const fallo = { codigo: "otra_base", detalle: "" };
    internos.invoke.mockRejectedValueOnce(fallo);
    const e = await puente.invoke("db_consultar", {}).catch((x: unknown) => x);
    expect(e).toEqual(fallo);
    expect(e).not.toBe(fallo);
  });

  it("las fotos, las llamadas de vuelta y la ventana son las del padre", async () => {
    const { internos, puente } = await conPadre();
    expect(puente.convertFileSrc(LADO, "foto")).toBe(`http://foto.localhost/${LADO}`);
    expect(puente.transformCallback()).toBe(7);
    puente.unregisterCallback(7);
    expect(internos.unregisterCallback).toHaveBeenCalledWith(7);
    expect(puente.metadata).toBe(internos.metadata);
  });

  it("solo_lectura_se_traduce", async () => {
    const { puente } = await conPadre();
    const e = await puente.invoke("foto_bytes", {}).catch((x: unknown) => x);
    expect(traducirError(e)).toBe(i18n.global.t("respaldos.error.solo_lectura"));
    expect(traducirError(e)).not.toBe("solo_lectura");
  });
});

describe("modo lado", () => {
  const leer = async (search: string) => {
    vi.stubGlobal("location", { search });
    vi.resetModules();
    return import("./modo");
  };

  it("se activa con un id de organización", async () => {
    const m = await leer(`?lado=${LADO}`);
    expect([m.MODO_LADO, m.idLado()]).toEqual([true, LADO]);
  });

  it("sin id, o con uno que no es un id canónico, es la app de siempre", async () => {
    for (const search of ["", "?lado=", "?lado=../x", `?lado=${LADO.toUpperCase()}`, `?lado=${LADO}x`]) {
      const m = await leer(search);
      expect([m.MODO_LADO, m.idLado()], search).toEqual([false, ""]);
    }
  });
});
