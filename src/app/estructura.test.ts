import { describe, expect, it } from "vitest";
import {
  barraColapsada,
  destinoAlCerrar,
  destinoInicial,
  esVistaCerrable,
  infoSiFalloCarga,
  tituloVentana,
} from "./estructura";

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

describe("destinoAlCerrar", () => {
  it("vuelve atrás si hay una ruta anterior dentro de la app", () => {
    expect(destinoAlCerrar("/directorio")).toBe("atras");
    expect(destinoAlCerrar("/")).toBe("atras");
  });
  it("sin historia (se abrió directo en esa vista) va al árbol", () => {
    expect(destinoAlCerrar(null)).toBe("/");
    expect(destinoAlCerrar(undefined)).toBe("/");
    expect(destinoAlCerrar("")).toBe("/");
  });
});

describe("esVistaCerrable", () => {
  it("solo Configuración, Ayuda y Acerca de se cierran", () => {
    expect(["configuracion", "ayuda", "acerca"].every(esVistaCerrable)).toBe(true);
    expect(["arbol", "directorio", "mantenedores", "bienvenida", undefined].some(esVistaCerrable)).toBe(
      false,
    );
  });
});

describe("tituloVentana", () => {
  it("lleva el nombre de la organización", () => {
    expect(tituloVentana(" Acme ")).toBe("BoldoAtlas — Acme");
  });
  it("sin nombre queda solo el de la app", () => {
    expect(tituloVentana("  ")).toBe("BoldoAtlas");
  });
});
