import { afterEach, describe, expect, it, vi } from "vitest";
import { traducirError } from "@/db/errores";
import { i18n } from "@/i18n";
import { instalarPuente } from "./puente";

const LADO = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const ABIERTA = "0190a1b2-c3d4-7e5f-8a9b-ffffffffffff";

afterEach(() => vi.unstubAllGlobals());

// El padre: la ventana de la app con el IPC de Tauri. El iframe solo lo alcanza por el puente.
function conPadre(respuesta: unknown = [{ id: "u1" }]) {
  const internos = {
    invoke: vi.fn<(cmd: string, args?: object, opciones?: unknown) => Promise<unknown>>(
      async () => respuesta,
    ),
    convertFileSrc: vi.fn((ruta: string, protocolo = "asset") => `http://${protocolo}.localhost/${ruta}`),
    transformCallback: vi.fn<(llamada?: () => void) => number>(() => 7),
    metadata: { currentWindow: { label: "main" } },
  };
  const iframe: Record<string, unknown> = {};
  vi.stubGlobal("window", iframe);
  instalarPuente(LADO, { __TAURI_INTERNALS__: internos } as unknown as Window);
  const puente = iframe.__TAURI_INTERNALS__ as typeof internos;
  return { internos, puente };
}

describe("instalarPuente", () => {
  it("puente_solo_deja_db_consultar_con_el_id_del_lado", async () => {
    const { internos, puente } = conPadre();
    for (const cmd of ["db_lote", "foto_bytes", "info_app", "plugin:event|listen"])
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
    const { puente } = conPadre(filas);
    const r = await puente.invoke("db_consultar", { sql: "SELECT 1", params: [] });
    expect(r).toEqual(filas);
    expect(r).not.toBe(filas);
    expect((r as typeof filas)[0]).not.toBe(filas[0]);
  });

  it("las fotos, las llamadas de vuelta y la ventana son las del padre", () => {
    const { internos, puente } = conPadre();
    expect(puente.convertFileSrc(LADO, "foto")).toBe(`http://foto.localhost/${LADO}`);
    expect(puente.transformCallback()).toBe(7);
    expect(puente.metadata).toBe(internos.metadata);
  });

  it("solo_lectura_se_traduce", async () => {
    const { puente } = conPadre();
    const e = await puente.invoke("foto_bytes", {}).catch((x: unknown) => x);
    expect(traducirError(e)).toBe(i18n.global.t("respaldos.error.solo_lectura"));
    expect(traducirError(e)).not.toBe("solo_lectura");
  });
});

describe("modo lado", () => {
  afterEach(() => vi.resetModules());
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
