import { afterEach, describe, expect, it, vi } from "vitest";
import * as hijos from "node:child_process";
import { comoLoInstalaNsis, principal, problemas } from "./probar-actualizacion.mjs";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
  spawn: vi.fn(),
  spawnSync: vi.fn(),
}));

const entrada = { id: "abc", ruta: "boldo.db", nombre: "Prueba CI", color: "#b83280" };
const BIEN = {
  lista: { organizaciones: [entrada] },
  dbId: "abc",
  nombre: "Prueba CI",
  unidades: ["Unidad de prueba CI"],
  respaldo: true,
  dbIdAntes: "abc",
};

describe("problemas", () => {
  it("nada si la organización sigue igual, con o sin db_id previo", () => {
    expect(problemas(BIEN)).toEqual([]);
    expect(problemas({ ...BIEN, dbIdAntes: null })).toEqual([]);
  });

  it("dice cada cosa que falla", () => {
    expect(problemas({ ...BIEN, lista: {} })).toHaveLength(4);
    const lejos = { organizaciones: [{ ...entrada, ruta: "organizaciones/x/organizacion.db" }] };
    expect(problemas({ ...BIEN, lista: lejos })).toEqual([expect.stringContaining("boldo.db")]);
    expect(problemas({ ...BIEN, dbId: "otro" })).toHaveLength(2);
    expect(problemas({ ...BIEN, nombre: null, unidades: [], respaldo: false })).toHaveLength(3);
  });

  it("exige el color solo si la versión anterior ya tenía lista", () => {
    const otro = { organizaciones: [{ ...entrada, color: "#3b6fb5" }] };
    expect(problemas({ ...BIEN, lista: otro })).toEqual([]);
    expect(problemas({ ...BIEN, lista: otro, colorAntes: "#b83280" })).toEqual([
      expect.stringContaining("color"),
    ]);
    expect(problemas({ ...BIEN, colorAntes: "#b83280" })).toEqual([]);
  });
});

describe("principal", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("fuera de un runner de GitHub sale con 1 sin lanzar ni cerrar nada", async () => {
    vi.stubEnv("CI", "");
    vi.stubEnv("GITHUB_ACTIONS", "");
    const aviso = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await principal([])).toBe(1);
    expect(aviso).toHaveBeenCalledWith(expect.stringContaining("Solo en CI"));
    for (const f of [hijos.spawn, hijos.spawnSync, hijos.execFileSync]) expect(f).not.toHaveBeenCalled();
  });
});

describe("comoLoInstalaNsis", () => {
  it("cambia solo el tipo de paquete, con el mismo largo", () => {
    const exe = Buffer.from("antes__TAURI_BUNDLE_TYPE_VAR_UNKdespues");
    expect(comoLoInstalaNsis(exe).toString()).toBe("antes__TAURI_BUNDLE_TYPE_VAR_NSSdespues");
    expect(exe.toString()).toContain("_UNK");
  });

  it("falla si el marcador no está o está dos veces", () => {
    expect(() => comoLoInstalaNsis(Buffer.from("nada"))).toThrow(/una sola vez/);
    expect(() => comoLoInstalaNsis(Buffer.from("__TAURI_BUNDLE_TYPE_VAR_UNK".repeat(2)))).toThrow(
      /una sola vez/,
    );
  });
});
