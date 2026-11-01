import { describe, expect, it } from "vitest";
import { compararVersiones, leerNovedades, notasEntre, novedadesPendientes, type Novedad } from "./novedades";

const n = (version: string): Novedad => ({ version, fecha: "2026-10-31", notas: `- ${version}` });
const LISTA = ["0.1.0-alpha.12", "0.1.0-alpha.11", "0.1.0-alpha.10", "0.1.0-alpha.9", "0.1.0-alpha.2"].map(n);
const versiones = (l: Novedad[]) => l.map((x) => x.version);

describe("compararVersiones", () => {
  it("sigue SemVer: pre-release antes que final, números como números", () => {
    expect(compararVersiones("0.1.0-alpha.10", "0.1.0-alpha.9")).toBeGreaterThan(0);
    expect(compararVersiones("1.0.0-rc.1", "1.0.0")).toBeLessThan(0);
    expect(compararVersiones("1.0.0+28102026", "1.0.0")).toBe(0);
    expect(compararVersiones("0.1.0-alpha.11.dev.3", "0.1.0-alpha.11")).toBeGreaterThan(0);
    expect(compararVersiones("basura", "0.0.1")).toBeLessThan(0);
  });
});

describe("notasEntre", () => {
  it("todas las versiones que se salta, sin la actual y con la nueva, de la más nueva a la más antigua", () => {
    expect(versiones(notasEntre(LISTA, "0.1.0-alpha.9", "0.1.0-alpha.12"))).toEqual([
      "0.1.0-alpha.12",
      "0.1.0-alpha.11",
      "0.1.0-alpha.10",
    ]);
  });

  it("un build de desarrollo cuenta desde su versión base", () => {
    expect(versiones(notasEntre(LISTA, "0.1.0-alpha.11.dev.4", "0.1.0-alpha.12"))).toEqual([
      "0.1.0-alpha.12",
    ]);
  });

  it("nada si no hay versiones en el rango", () => {
    expect(notasEntre(LISTA, "0.1.0-alpha.12", "0.1.0-alpha.12")).toEqual([]);
    expect(notasEntre([], "0.1.0", "0.2.0")).toEqual([]);
  });
});

describe("novedadesPendientes", () => {
  it("al abrir una versión nueva muestra lo publicado desde la última usada en este PC", () => {
    expect(versiones(novedadesPendientes(LISTA, "0.1.0-alpha.10", "0.1.0-alpha.12"))).toEqual([
      "0.1.0-alpha.12",
      "0.1.0-alpha.11",
    ]);
  });

  it("nada en el primer uso, con la misma versión o al volver a una anterior", () => {
    expect(novedadesPendientes(LISTA, null, "0.1.0-alpha.12")).toEqual([]);
    expect(novedadesPendientes(LISTA, "0.1.0-alpha.12", "0.1.0-alpha.12")).toEqual([]);
    expect(novedadesPendientes(LISTA, "0.1.0-alpha.12", "0.1.0-alpha.11")).toEqual([]);
  });
});

describe("leerNovedades", () => {
  it("acepta novedades.json y descarta lo que no tiene su forma", () => {
    expect(leerNovedades({ versiones: [n("1.0.0"), { version: 1 }, null] })).toEqual([n("1.0.0")]);
    expect(leerNovedades(null)).toEqual([]);
    expect(leerNovedades({ versiones: "x" })).toEqual([]);
  });
});
