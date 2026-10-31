import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Las páginas de ayuda viven en ayuda/<idioma>/<tema>.md (también las usa el sitio web): las dos versiones deben
// tener las mismas páginas y la misma estructura. Es un control grueso: no compara las palabras.
const RAIZ = join(process.cwd(), "ayuda");
const paginas = (idioma: string) => readdirSync(join(RAIZ, idioma)).filter((f) => f.endsWith(".md")).sort();
const leer = (idioma: string, f: string) => readFileSync(join(RAIZ, idioma, f), "utf8").replace(/\r\n/g, "\n");

// Encabezados por nivel, ítems de lista y filas de tabla, sin contar lo que hay dentro de bloques de código.
function estructura(texto: string) {
  const lineas = texto.split("\n");
  let codigo = false;
  const e = { encabezados: [] as number[], items: 0, filas: 0, bloques: 0 };
  for (const l of lineas) {
    if (/^```/.test(l)) {
      codigo = !codigo;
      e.bloques++;
      continue;
    }
    if (codigo) continue;
    const h = /^(#{1,6}) /.exec(l);
    if (h) e.encabezados.push(h[1]!.length);
    else if (/^\s*([-*]|\d+\.) /.test(l)) e.items++;
    else if (/^\|/.test(l)) e.filas++;
  }
  return e;
}

describe("ayuda en español e inglés", () => {
  it("tienen las mismas páginas", () => {
    expect(paginas("en")).toEqual(paginas("es"));
    expect(paginas("es").length).toBeGreaterThan(0);
  });

  it.each(paginas("es"))("%s tiene la misma estructura en los dos idiomas", (f) => {
    expect(estructura(leer("en", f))).toEqual(estructura(leer("es", f)));
  });

  it.each(paginas("en"))("%s empieza con un título de primer nivel", (f) => {
    expect(leer("en", f)).toMatch(/^# \S/);
    expect(leer("es", f)).toMatch(/^# \S/);
  });
});
