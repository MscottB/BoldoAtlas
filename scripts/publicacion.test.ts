import { describe, it, expect } from "vitest";
import {
  compararSemver,
  notasDeVersion,
  parsearSemver,
  publicacion,
  salidaGithub,
  siguienteVersion,
} from "./publicacion.mjs";

const orden = (lista: string[]) =>
  [...lista].sort((a, b) => compararSemver(parsearSemver(a)!, parsearSemver(b)!));

describe("compararSemver", () => {
  it("ordena como SemVer 2.0 (números, pre-releases y final)", () =>
    expect(
      orden([
        "1.0.0",
        "1.0.0-alpha.10",
        "1.0.0-beta",
        "1.0.0-alpha.2",
        "0.9.9",
        "1.0.0-alpha",
        "1.0.0-alpha.beta",
      ]),
    ).toEqual([
      "0.9.9",
      "1.0.0-alpha",
      "1.0.0-alpha.2",
      "1.0.0-alpha.10",
      "1.0.0-alpha.beta",
      "1.0.0-beta",
      "1.0.0",
    ]));
  it("ignora la metadata de compilación", () =>
    expect(compararSemver(parsearSemver("v1.2.3+abc")!, parsearSemver("1.2.3")!)).toBe(0));
  it("rechaza etiquetas que no son versiones", () => expect(parsearSemver("prueba")).toBeNull());
});

describe("siguienteVersion", () => {
  const tags = ["v0.1.0-alpha.1", "v0.1.0-alpha.2", "v0.1.0-alpha.10", "otra", "v0.0.9"];
  it("sin etiquetas de salto avanza la alpha desde la más alta (no la última por texto)", () =>
    expect(siguienteVersion(tags)).toBe("0.1.0-alpha.11"));
  it("la primera vez", () => expect(siguienteVersion([])).toBe("0.1.0-alpha.1"));
  it("labels ajenos no cuentan", () =>
    expect(siguienteVersion(["v0.1.0-alpha.1"], ["bug"])).toBe("0.1.0-alpha.2"));
  it("pre-release sin número al final", () => expect(siguienteVersion(["v1.0.0-rc"])).toBe("1.0.0-rc.1"));
  it("después de una final, sin label, es un parche", () =>
    expect(siguienteVersion(["v0.1.0", "v0.1.0-alpha.9"])).toBe("0.1.1"));

  describe("con label gana la versión limpia X.Y.Z", () => {
    const alpha = ["v0.1.0-alpha.3"];
    it("parche sale de la alpha", () => expect(siguienteVersion(alpha, ["version:parche"])).toBe("0.1.0"));
    it("menor sale de la alpha", () => expect(siguienteVersion(alpha, ["version:menor"])).toBe("0.1.0"));
    it("mayor", () => expect(siguienteVersion(alpha, ["version:mayor"])).toBe("1.0.0"));
    it("mayor desde 1.0.0-beta.1 queda en 1.0.0", () =>
      expect(siguienteVersion(["v1.0.0-beta.1"], ["version:mayor"])).toBe("1.0.0"));
    it("menor desde 0.1.2-rc.1 sube la menor", () =>
      expect(siguienteVersion(["v0.1.2-rc.1"], ["version:menor"])).toBe("0.2.0"));
    const final = ["v1.2.3"];
    it("parche", () => expect(siguienteVersion(final, ["version:parche"])).toBe("1.2.4"));
    it("menor", () => expect(siguienteVersion(final, ["version:menor"])).toBe("1.3.0"));
    it("mayor", () => expect(siguienteVersion(final, ["version:mayor"])).toBe("2.0.0"));
    it("con varias gana la mayor", () =>
      expect(siguienteVersion(final, ["version:parche", "version:mayor", "version:menor"])).toBe("2.0.0"));
    it("sin etiquetas previas", () => expect(siguienteVersion([], ["version:menor"])).toBe("0.1.0"));
  });
});

describe("notasDeVersion", () => {
  const cuerpo = [
    "## Qué cambia",
    "Cosas internas",
    "",
    "## Notas de la versión",
    "<!-- Lo que verá quien descarga -->",
    "- Nuevo: pestañas",
    "### Detalle",
    "- arreglo",
    "",
    "## Pruebas",
    "npm test",
  ].join("\r\n");
  it("toma solo su sección, sin comentarios, y admite subtítulos ###", () =>
    expect(notasDeVersion(cuerpo, "Título")).toBe("- Nuevo: pestañas\n### Detalle\n- arreglo"));
  it("la sección al final del cuerpo", () =>
    expect(notasDeVersion("## Notas de la versión\nSolo esto\n", "T")).toBe("Solo esto"));
  it("sin la sección usa el título", () => expect(notasDeVersion("Algo", "Pestañas")).toBe("Pestañas"));
  it("sección vacía (solo el comentario de la plantilla) usa el título", () =>
    expect(notasDeVersion("## Notas de la versión\n<!-- escribe aquí -->\n\n## Otra", "Pestañas")).toBe(
      "Pestañas",
    ));
  it("cuerpo nulo usa el título", () => expect(notasDeVersion(null, " Pestañas ")).toBe("Pestañas"));
});

describe("publicacion", () => {
  const pr = {
    number: 4,
    title: "Pestañas",
    body: "## Notas de la versión\n- Pestañas",
    labels: [{ name: "bug" }],
  };
  it("calcula etiqueta, prerelease, versión de prueba y notas", () =>
    expect(publicacion(pr, ["v0.1.0-alpha.1"])).toEqual({
      publicar: "true",
      pr: "4",
      version: "0.1.0-alpha.2",
      etiqueta: "v0.1.0-alpha.2",
      prerelease: "true",
      version_prueba: "0.1.0-alpha.2+pr4",
      notas: "- Pestañas",
    }));
  it("una versión final no es prerelease", () =>
    expect(publicacion({ ...pr, labels: [{ name: "version:menor" }] }, ["v0.1.0-alpha.1"]).prerelease).toBe(
      "false",
    ));
  it("sin PR (push a main que no es un merge) no publica", () =>
    expect(publicacion(null, ["v0.1.0-alpha.1"])).toEqual({ publicar: "false" }));
});

describe("salidaGithub", () => {
  it("una línea con =, varias con delimitador", () =>
    expect(salidaGithub({ a: "1", notas: "x\ny" }, "FIN")).toBe("a=1\nnotas<<FIN\nx\ny\nFIN\n"));
});
