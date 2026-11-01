import { describe, it, expect } from "vitest";
import {
  compararSemver,
  notasCombinadas,
  notasDeVersion,
  numerosDePrs,
  parsearSemver,
  prDeAsunto,
  prDelEvento,
  publicacion,
  salidaGithub,
  seccionNotas,
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
  it("acepta ### y dos puntos en el título de la sección", () =>
    expect(notasDeVersion("### Notas de la versión:\n- uno\n### Otra\nno", "T")).toBe("- uno"));
  it("acepta acentos descompuestos (NFD)", () =>
    expect(notasDeVersion("## Notas de la versión".normalize("NFD") + "\n- uno", "T")).toBe("- uno"));
  it("un # dentro de un bloque de código no corta la sección", () =>
    expect(
      notasDeVersion("## Notas de la versión\n```sh\n# comentario\nnpm ci\n```\n- fin\n## Otra", "T"),
    ).toBe("```sh\n# comentario\nnpm ci\n```\n- fin"));
});

describe("seccionNotas", () => {
  it("vacía cuando falta (el CLI avisa y usa el título)", () => expect(seccionNotas("## Otra\nx")).toBe(""));
  it("sin el pie de Claude Code del PR", () =>
    expect(
      seccionNotas(
        "## Notas de la versión\n\n- Algo nuevo.\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)",
      ),
    ).toBe("- Algo nuevo."));
});

describe("prDeAsunto", () => {
  it("merge de GitHub", () =>
    expect(prDeAsunto("Merge pull request #1 from MscottB/fase1-fundaciones")).toBe(1));
  it("asunto propio del autor con (#N) al final", () =>
    expect(prDeAsunto("Pestañas de trabajo (#3)")).toBe(3));
  it("un (#N) en medio no cuenta", () => expect(prDeAsunto("Revierte (#3) y más")).toBeNull());
  it("commit normal", () => expect(prDeAsunto("fix(arbol): foco")).toBeNull());
});

describe("numerosDePrs", () => {
  const asuntos = [
    "Pestañas de trabajo (#3)",
    "Merge branch 'main' into x",
    "Merge pull request #2 from a/b",
  ];
  it("del más antiguo al más nuevo, con el que dispara al final", () =>
    expect(numerosDePrs(asuntos, 4)).toEqual([2, 3, 4]));
  it("sin repetir el que dispara si ya está en el log", () =>
    expect(numerosDePrs(asuntos, 3)).toEqual([2, 3]));
  it("sin PR que dispare", () => expect(numerosDePrs([], null)).toEqual([]));
});

describe("prDelEvento", () => {
  const pr = { number: 4, title: "T" };
  it("evento pull_request", () => expect(prDelEvento({ action: "opened", pull_request: pr })).toBe(pr));
  it("PR suelto de la API", () => expect(prDelEvento(pr)).toBe(pr));
  it("evento push no es un PR", () =>
    expect(prDelEvento({ ref: "refs/heads/main", commits: [] })).toBeNull());
  it("archivo vacío", () => expect(prDelEvento(null)).toBeNull());
});

describe("notasCombinadas", () => {
  const prs = [
    { number: 2, title: "Fase 2", body: "## Notas de la versión\n- Núcleo" },
    { number: 3, title: "Pestañas de trabajo", body: "sin sección" },
    { number: 4, title: "CI", body: "## Notas de la versión\n- Releases solos\n- Versión en Acerca de" },
  ];
  it("un PR: sus notas tal cual", () => expect(notasCombinadas([prs[0]])).toBe("- Núcleo"));
  it("varios PR: un ### por PR en orden; sin sección queda solo el título", () =>
    expect(notasCombinadas(prs)).toBe(
      [
        "### Fase 2 (#2)",
        "",
        "- Núcleo",
        "",
        "### Pestañas de trabajo (#3)",
        "",
        "### CI (#4)",
        "",
        "- Releases solos",
        "- Versión en Acerca de",
      ].join("\n"),
    ));
  const deps = [
    { number: 22, title: "build(deps): bump tauri from 2.12.4 to 2.12.5", body: "Bumps tauri" },
    { number: 23, title: "build(deps-dev): bump vite from 8.0.1 to 8.0.2", body: "Bumps vite" },
  ];
  it("solo dependencias: la nota fija, sin títulos en inglés", () =>
    expect(notasCombinadas(deps)).toBe("- Actualización interna de dependencias, sin cambios visibles."));
  it("una función y dependencias: las dependencias van juntas al final", () =>
    expect(notasCombinadas([deps[0], prs[0], deps[1]])).toBe(
      [
        "### Fase 2 (#2)",
        "",
        "- Núcleo",
        "",
        "### Mantenimiento (#22, #23)",
        "",
        "- Actualización interna de dependencias, sin cambios visibles.",
      ].join("\n"),
    ));
});

describe("publicacion", () => {
  const pr = {
    number: 4,
    title: "Pestañas",
    body: "## Notas de la versión\n- Pestañas",
    labels: [{ name: "bug" }],
  };
  it("calcula etiqueta, prerelease, versión de prueba y notas", () =>
    expect(publicacion([pr], ["v0.1.0-alpha.1"])).toEqual({
      publicar: "true",
      pr: "#4",
      version: "0.1.0-alpha.2",
      etiqueta: "v0.1.0-alpha.2",
      prerelease: "true",
      version_prueba: "0.1.0-alpha.2+pr4",
      notas: "- Pestañas",
    }));
  it("una versión final no es prerelease", () =>
    expect(publicacion([{ ...pr, labels: [{ name: "version:menor" }] }], ["v0.1.0-alpha.1"]).prerelease).toBe(
      "false",
    ));
  it("varios PR: cuentan los labels de todos y la versión de prueba usa el último", () => {
    const v = publicacion(
      [{ number: 3, title: "A", labels: [{ name: "version:menor" }] }, pr],
      ["v0.1.0-alpha.1"],
    );
    expect([v.version, v.pr, v.version_prueba]).toEqual(["0.1.0", "#3 #4", "0.1.0+pr4"]);
  });
  it("sin PR (push a main que no es un merge, o ya publicado) no publica", () =>
    expect(publicacion([], ["v0.1.0-alpha.1"])).toEqual({ publicar: "false" }));
});

describe("salidaGithub", () => {
  it("una línea con =, varias con delimitador", () =>
    expect(salidaGithub({ a: "1", notas: "x\ny" }, "FIN")).toBe("a=1\nnotas<<FIN\nx\ny\nFIN\n"));
});
