import { describe, expect, it } from "vitest";
import { conPuertoAbierto, dentroDe, enCI } from "./probar-app.mjs";

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
});

describe("enCI", () => {
  it("solo con las tres variables del runner", () => {
    expect(enCI({ CI: "true", GITHUB_ACTIONS: "true", RUNNER_TEMP: "D:\\a\\_temp" })).toBe(true);
    expect(enCI({})).toBe(false);
    expect(enCI({ CI: "true" })).toBe(false);
    expect(enCI({ CI: "true", GITHUB_ACTIONS: "true" })).toBe(false);
    expect(enCI({ CI: "1", GITHUB_ACTIONS: "true", RUNNER_TEMP: "x" })).toBe(false);
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
