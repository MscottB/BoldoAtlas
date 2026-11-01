import MarkdownIt from "markdown-it";
import { describe, expect, it } from "vitest";
import { reglasAyuda } from "./markdownAyuda";
import { buscarEnAyuda, consultaValida, resumenDe, seccionesDe } from "./buscarAyuda";

const paginas = [
  {
    slug: "arbol",
    titulo: "El árbol",
    texto: [
      "# El árbol",
      "",
      "::: info En resumen",
      "Arma y recorre el **organigrama** de tu organización.",
      "",
      "Segundo párrafo.",
      ":::",
      "",
      "## Plegar y desplegar ramas",
      "",
      "El botón de abajo muestra cuántas subunidades tiene ocultas.",
      "",
      "```",
      "# no es un encabezado",
      "```",
      "",
      "## Mover una unidad",
      "",
      "Arrastra una tarjeta y suéltala sobre otra. Ver [Puestos](puestos.md).",
    ].join("\n"),
  },
  {
    slug: "respaldos",
    titulo: "Respaldos",
    texto: "# Respaldos\n\n## Restaurar\n\nPulsa **Restaurar** en la fila.",
  },
];

describe("buscarAyuda", () => {
  it("el resumen es el primer párrafo del aviso «En resumen»", () => {
    expect(resumenDe(paginas[0]!.texto)).toBe("Arma y recorre el organigrama de tu organización.");
    expect(resumenDe("# Sin aviso\n\ntexto")).toBe("");
  });

  it("parte en secciones y no toma un # dentro de un bloque de código", () => {
    const s = seccionesDe(paginas);
    expect(s.map((x) => x.id)).toEqual(["", "plegar-y-desplegar-ramas", "mover-una-unidad", "", "restaurar"]);
  });

  it("busca sin tildes ni mayúsculas y da el extracto con la coincidencia", () => {
    const [r] = buscarEnAyuda(seccionesDe(paginas), "SUBUNIDADES");
    expect(r).toMatchObject({ slug: "arbol", id: "plegar-y-desplegar-ramas" });
    expect(r!.extracto[1].toLowerCase()).toBe("subunidades");
  });

  it("pide todas las palabras y menos de dos letras no busca", () => {
    expect(buscarEnAyuda(seccionesDe(paginas), "arrastra tarjeta")).toHaveLength(1);
    expect(buscarEnAyuda(seccionesDe(paginas), "arrastra respaldo")).toHaveLength(0);
    expect(buscarEnAyuda(seccionesDe(paginas), "a")).toEqual([]);
  });

  it("los enlaces se leen por su texto", () => {
    const [r] = buscarEnAyuda(seccionesDe(paginas), "puestos");
    expect(r!.extracto.join("")).not.toContain("puestos.md");
  });

  it("un ## con el mismo nombre que el # del título lleva el id -2, igual que en el HTML", () => {
    const texto = [
      "# Árboles",
      "",
      "Intro.",
      "",
      "## Árboles",
      "",
      "Cada árbol es una raíz.",
      "",
      "## Otro",
      "",
      "y más",
    ].join("\n");
    const secciones = seccionesDe([{ slug: "arboles", titulo: "Árboles", texto }]);
    expect(secciones.map((x) => x.id)).toEqual(["", "arboles-2", "otro"]);
    // los ids del buscador son los mismos que pone la regla `anclas` en el HTML
    const md = new MarkdownIt({ html: false });
    reglasAyuda(md, { anclas: true });
    const enHtml = [...md.render(texto).matchAll(/<h\d id="([^"]+)"/g)].map((m) => m[1]);
    expect(enHtml).toEqual(["arboles", "arboles-2", "otro"]);
    expect(secciones.slice(1).map((x) => x.id)).toEqual(enHtml.slice(1));
    expect(buscarEnAyuda(secciones, "raiz")[0]!.id).toBe("arboles-2");
  });

  it("la consulta solo corre con dos letras o más", () => {
    expect(consultaValida("a")).toBe(false);
    expect(consultaValida("  a ")).toBe(false);
    expect(consultaValida("ar")).toBe(true);
  });
});
