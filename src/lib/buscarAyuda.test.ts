import { describe, expect, it } from "vitest";
import { buscarEnAyuda, resumenDe, seccionesDe } from "./buscarAyuda";

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
});
