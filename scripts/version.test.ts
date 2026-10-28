import { describe, it, expect } from "vitest";
import { parsearDescribe, fechaDDMMAAAA, formatearVersion, verificarEtiqueta } from "./version.mjs";

describe("verificarEtiqueta", () => {
  it("acepta cuando la versión calculada es la de la etiqueta publicada", () =>
    expect(verificarEtiqueta("0.1.0", "v0.1.0")).toBeNull());
  it("rechaza si git describe eligió otra etiqueta del mismo commit", () =>
    expect(verificarEtiqueta("0.1.0-beta.1", "v0.1.0")).toMatch(/0\.1\.0-beta\.1.*v0\.1\.0/));
});

const f = "28102026";

describe("formatearVersion", () => {
  it("en etiqueta exacta", () =>
    expect(
      formatearVersion({ tag: "v1.2.0", distancia: 0, sha: "3f2a1bc", sucio: false, fecha: f }).completa,
    ).toBe("1.2.0+28102026"));
  it("commits después", () =>
    expect(
      formatearVersion({ tag: "v1.2.0", distancia: 5, sha: "3f2a1bc", sucio: false, fecha: f }).completa,
    ).toBe("1.2.0-dev.5+28102026.3f2a1bc"));
  it("sucio", () =>
    expect(
      formatearVersion({ tag: "v1.2.0", distancia: 5, sha: "3f2a1bc", sucio: true, fecha: f }).completa,
    ).toBe("1.2.0-dev.5+28102026.3f2a1bc.sucio"));
  it("sucio en etiqueta exacta", () =>
    expect(
      formatearVersion({ tag: "v1.2.0", distancia: 0, sha: "3f2a1bc", sucio: true, fecha: f }).completa,
    ).toBe("1.2.0+28102026.3f2a1bc.sucio"));
  it("sin etiquetas", () =>
    expect(
      formatearVersion({ tag: null, distancia: 12, sha: "3f2a1bc", sucio: false, fecha: f }).completa,
    ).toBe("0.0.0-dev.12+28102026.3f2a1bc"));
  it("sin git", () =>
    expect(formatearVersion({ tag: null, distancia: 0, sha: "", sucio: false, fecha: f }).completa).toBe(
      "0.0.0-dev.0+28102026",
    ));
  it("pre-release con commits después", () =>
    expect(
      formatearVersion({ tag: "v1.3.0-beta.1", distancia: 2, sha: "abc1234", sucio: false, fecha: f })
        .completa,
    ).toBe("1.3.0-beta.1.dev.2+28102026.abc1234"));
  it("numerica descarta pre-release", () =>
    expect(
      formatearVersion({ tag: "v1.3.0-beta.1", distancia: 0, sha: "", sucio: false, fecha: f }).numerica,
    ).toBe("1.3.0"));
});

describe("fechaDDMMAAAA", () => {
  it("rellena con ceros", () => expect(fechaDDMMAAAA(new Date("2026-03-05T15:00:00Z"))).toBe("05032026"));
  it("usa la hora de Chile, no UTC", () =>
    expect(fechaDDMMAAAA(new Date("2026-10-29T02:00:00Z"))).toBe("28102026"));
});

describe("parsearDescribe", () => {
  it("lee etiqueta, distancia, sha y sucio", () =>
    expect(parsearDescribe("v1.2.0-5-g3f2a1bc-dirty")).toEqual({
      tag: "v1.2.0",
      distancia: 5,
      sha: "3f2a1bc",
      sucio: true,
    }));
  it("acepta etiquetas con guiones", () =>
    expect(parsearDescribe("v1.3.0-beta.1-0-gabc1234")).toEqual({
      tag: "v1.3.0-beta.1",
      distancia: 0,
      sha: "abc1234",
      sucio: false,
    }));
});
