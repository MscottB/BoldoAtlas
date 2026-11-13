import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { conPuertoAbierto, dentroDe, enCI, esErrorDeConsola, exigirPortable } from "./probar-app.mjs";

describe("esErrorDeConsola", () => {
  it("errores de la consola, excepciones y errores del navegador; no avisos ni la salida del proceso", () => {
    for (const l of [
      "[consola error] fallo",
      "[excepción] TypeError: x",
      "[network error] Failed to load resource",
    ])
      expect(esErrorDeConsola(l), l).toBe(true);
    for (const l of [
      "[consola warn] No se pudo soltar",
      "[consola log] hola",
      "[proceso] error de Rust",
      "error suelto",
    ])
      expect(esErrorDeConsola(l), l).toBe(false);
  });
});

describe("conPuertoAbierto", () => {
  const WRY = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection";

  it("cambia solo ese texto, con el mismo largo", () => {
    const exe = Buffer.from(`antes${WRY}despues`);
    const parchado = conPuertoAbierto(exe).toString();
    expect(parchado).toHaveLength(exe.length);
    expect(parchado).toMatch(/^antes--remote-debugging-port=\d+ --remote-allow-origins=\* +despues$/);
  });

  it("falla si el texto no está o está dos veces, en vez de abrir la app sin puerto", () => {
    expect(() => conPuertoAbierto(Buffer.from("otra cosa"))).toThrow(/una sola vez/);
    expect(() => conPuertoAbierto(Buffer.from(WRY + WRY))).toThrow(/una sola vez/);
  });

  it("falla si lo nuevo no cabe, en vez de pisar lo que sigue en el exe", () => {
    const exe = Buffer.from(`antes${WRY}despues`);
    expect(() => conPuertoAbierto(exe, "x".repeat(WRY.length + 1))).toThrow(/no cabe/);
    expect(conPuertoAbierto(exe, "x".repeat(WRY.length)).toString()).toBe(
      `antes${"x".repeat(WRY.length)}despues`,
    );
  });
});

describe("enCI", () => {
  const RUNNER = {
    CI: "true",
    GITHUB_ACTIONS: "true",
    RUNNER_TEMP: "D:\\a\\_temp",
    GITHUB_RUN_ID: "1",
    RUNNER_ENVIRONMENT: "github-hosted",
  };

  it("solo con todas las variables de un runner de GitHub", () => {
    expect(enCI(RUNNER)).toBe(true);
    expect(enCI({})).toBe(false);
    expect(enCI({ ...RUNNER, CI: "1" })).toBe(false);
    for (const falta of Object.keys(RUNNER)) expect(enCI({ ...RUNNER, [falta]: undefined })).toBe(false);
  });

  it("no en un runner propio, que puede ser el equipo de alguien", () => {
    expect(enCI({ ...RUNNER, RUNNER_ENVIRONMENT: "self-hosted" })).toBe(false);
  });
});

describe("exigirPortable", () => {
  /** Una carpeta como la extraída del zip, dentro de una temporal. */
  function armar(...entradas: ("portable.flag" | "datos")[]) {
    const temp = mkdtempSync(join(tmpdir(), "boldo-portable-"));
    const carpeta = join(temp, "copia");
    mkdirSync(carpeta);
    if (entradas.includes("portable.flag")) writeFileSync(join(carpeta, "portable.flag"), "");
    if (entradas.includes("datos")) mkdirSync(join(carpeta, "datos"));
    return { temp, exe: join(carpeta, "BoldoAtlas.exe") };
  }

  it("deja pasar una portable completa dentro de la carpeta temporal", () => {
    const { temp, exe } = armar("portable.flag", "datos");
    expect(() => exigirPortable(exe, temp)).not.toThrow();
  });

  it("sin portable.flag la app abriría los datos reales: no se lanza", () => {
    const { temp, exe } = armar("datos");
    expect(() => exigirPortable(exe, temp)).toThrow(/portable\.flag/);
  });

  it("sin la carpeta datos tampoco", () => {
    const { temp, exe } = armar("portable.flag");
    expect(() => exigirPortable(exe, temp)).toThrow(/datos/);
  });

  it("fuera de la carpeta temporal tampoco", () => {
    const { exe } = armar("portable.flag", "datos");
    expect(() => exigirPortable(exe, join(tmpdir(), "otra-carpeta"))).toThrow(/carpeta temporal/);
    expect(() => exigirPortable(exe, undefined)).toThrow(/carpeta temporal/);
  });
});

describe("dentroDe", () => {
  const carpeta = "D:\\a\\_temp\\boldo-humo-x";

  it("acepta lo que está bajo la carpeta temporal, sin importar mayúsculas", () => {
    expect(dentroDe(`${carpeta}\\datos\\boldo.db`, carpeta)).toBe(true);
    expect(dentroDe("d:\\A\\_TEMP\\boldo-humo-x\\datos\\boldo.db", carpeta)).toBe(true);
  });

  it("rechaza la carpeta misma, otra vecina y los datos reales", () => {
    expect(dentroDe(carpeta, carpeta)).toBe(false);
    expect(dentroDe(`${carpeta}-otra\\boldo.db`, carpeta)).toBe(false);
    expect(dentroDe(`${carpeta}\\..\\boldo.db`, carpeta)).toBe(false);
    expect(dentroDe("C:\\Users\\x\\AppData\\Roaming\\io.github.mscottb.boldoatlas\\boldo.db", carpeta)).toBe(
      false,
    );
    expect(dentroDe("", carpeta)).toBe(false);
  });
});
