import { describe, expect, it } from "vitest";
import { mensajeFallo } from "./respaldos";

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
