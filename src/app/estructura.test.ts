import { describe, expect, it } from "vitest";
import { barraColapsada, destinoInicial, infoSiFalloCarga } from "./estructura";

describe("destinoInicial", () => {
  it("va a la bienvenida solo si cargó y no hay unidades", () => {
    expect(destinoInicial(true, true)).toBe("/bienvenida");
    expect(destinoInicial(true, false)).toBeNull();
  });
  it("no redirige si la carga falló (vacia es true antes de cargar)", () => {
    expect(destinoInicial(false, true)).toBeNull();
  });
});

describe("barraColapsada", () => {
  it("se colapsa bajo 1100 px y no desde 1100", () => {
    expect(barraColapsada(1099, null)).toBe(true);
    expect(barraColapsada(1100, null)).toBe(false);
  });
  it("la elección manual manda sobre el ancho", () => {
    expect(barraColapsada(800, false)).toBe(false);
    expect(barraColapsada(1600, true)).toBe(true);
  });
});

describe("infoSiFalloCarga", () => {
  it("devuelve los datos de la pantalla de error con el mensaje si la carga falló", () => {
    expect(infoSiFalloCarga({ ok: false, mensaje: "No se pudo leer la base" })).toMatchObject({
      error: "No se pudo leer la base",
      versionEsquema: 0,
    });
  });
  it("devuelve null si la carga salió bien", () => {
    expect(infoSiFalloCarga({ ok: true })).toBeNull();
  });
});
