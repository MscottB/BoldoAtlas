import { describe, expect, it } from "vitest";
import { conRespaldoPrevio, mensajeFallo } from "./respaldos";

describe("mensajeFallo", () => {
  it("traduce el código que devuelve Rust", () => {
    expect(mensajeFallo({ codigo: "en_uso", detalle: "C:\\x\\boldo.db" })).toMatch(
      /Otra ventana de BoldoAtlas/,
    );
  });

  it("un código desconocido o un error sin código muestran el detalle", () => {
    expect(mensajeFallo({ codigo: "raro", detalle: "disco lleno" })).toMatch(/disco lleno$/);
    expect(mensajeFallo("command not found")).toMatch(/command not found$/);
  });
});

describe("conRespaldoPrevio", () => {
  const ok = { ok: true } as const;

  it("respalda y luego ejecuta la acción", async () => {
    const orden: string[] = [];
    const r = await conRespaldoPrevio(
      async () => void orden.push("respaldo"),
      async () => (orden.push("accion"), ok),
    );
    expect(r).toEqual(ok);
    expect(orden).toEqual(["respaldo", "accion"]);
  });

  it("si el respaldo falla no ejecuta la acción y devuelve el motivo", async () => {
    let corrio = false;
    const r = await conRespaldoPrevio(
      () => Promise.reject({ codigo: "en_uso", detalle: "x" }),
      async () => ((corrio = true), ok),
    );
    expect(corrio).toBe(false);
    expect(r).toMatchObject({ ok: false, mensaje: expect.stringMatching(/Otra ventana/) });
  });
});
