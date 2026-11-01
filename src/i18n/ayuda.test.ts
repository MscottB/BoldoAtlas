import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Las páginas de ayuda viven en ayuda/<idioma>/<tema>.md (también las usa el sitio web): las dos versiones deben
// tener las mismas páginas y la misma estructura. Es un control grueso: no compara las palabras.
const RAIZ = join(process.cwd(), "ayuda");
const paginas = (idioma: string) =>
  readdirSync(join(RAIZ, idioma))
    .filter((f) => f.endsWith(".md"))
    .sort();
const leer = (idioma: string, f: string) =>
  readFileSync(join(RAIZ, idioma, f), "utf8").replace(/\r\n/g, "\n");
const IMG = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)(?:\{([^}]*)\})?/g;

/** Las imágenes `![alt](ruta "pie"){width=… height=…}` de una página, fuera de los bloques de código. */
function imagenes(texto: string) {
  return [...sinCodigo(texto).matchAll(IMG)].map((m) => ({
    alt: m[1]!,
    ruta: m[2]!,
    pie: m[3] ?? "",
    attrs: m[4] ?? "",
  }));
}
const sinCodigo = (texto: string) => texto.replace(/^(```|~~~)[\s\S]*?^\1/gm, "");
/** Avisos `::: tipo Título`, en orden. */
const avisos = (texto: string) =>
  [...sinCodigo(texto).matchAll(/^:::[ \t]*(\w+)(?:[ \t]+(.*))?$/gm)].filter((m) => m[1]);

// Encabezados por nivel, ítems de lista, filas de tabla, imágenes y avisos, sin contar lo que hay dentro de bloques de código.
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
  return {
    ...e,
    imagenes: imagenes(texto).map((i) => i.ruta.split("/").pop()),
    avisos: avisos(texto).map((a) => a[1]),
    // el orden de un aviso respecto de las imágenes tampoco cambia
    cierres: (sinCodigo(texto).match(/^:::[ \t]*$/gm) ?? []).length,
  };
}

/** Ancho y alto de un WebP leyendo su cabecera (VP8, VP8L o VP8X). */
function medidasWebp(ruta: string): { ancho: number; alto: number } {
  const b = readFileSync(ruta);
  expect(b.toString("ascii", 0, 4)).toBe("RIFF");
  expect(b.toString("ascii", 8, 12)).toBe("WEBP");
  const tipo = b.toString("ascii", 12, 16);
  if (tipo === "VP8 ") return { ancho: b.readUInt16LE(26) & 0x3fff, alto: b.readUInt16LE(28) & 0x3fff };
  if (tipo === "VP8L") {
    const bits = b.readUInt32LE(21);
    return { ancho: (bits & 0x3fff) + 1, alto: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (tipo === "VP8X") return { ancho: b.readUIntLE(24, 3) + 1, alto: b.readUIntLE(27, 3) + 1 };
  throw new Error(`WebP desconocido (${tipo}) en ${ruta}`);
}

describe("ayuda en español e inglés", () => {
  it("tienen las mismas páginas", () => {
    expect(paginas("en")).toEqual(paginas("es"));
    expect(paginas("es").length).toBeGreaterThan(0);
  });

  it("el orden de los temas (orden.json) lista cada página una vez", () => {
    const orden = JSON.parse(readFileSync(join(RAIZ, "orden.json"), "utf8")) as string[];
    expect([...orden].sort()).toEqual(paginas("es").map((f) => f.slice(0, -3)));
  });

  it.each(paginas("es"))("%s tiene la misma estructura en los dos idiomas", (f) => {
    expect(estructura(leer("en", f))).toEqual(estructura(leer("es", f)));
  });

  it.each(paginas("en"))("%s empieza con un título de primer nivel", (f) => {
    expect(leer("en", f)).toMatch(/^# \S/);
    expect(leer("es", f)).toMatch(/^# \S/);
  });

  it.each(["es", "en"])("%s: ninguna página habla de funciones que aún no existen", (idioma) => {
    for (const f of paginas(idioma))
      expect(leer(idioma, f), `${idioma}/${f}`).not.toMatch(
        /Próximamente|Coming soon|\bFases? \d|\bPhases? \d|\.boldo\b|\bExcel\b/i,
      );
  });
});

describe("avisos de la ayuda", () => {
  it.each(paginas("es"))("%s: empieza con «En resumen» y todos los avisos tienen título y cierre", (f) => {
    for (const idioma of ["es", "en"]) {
      const texto = leer(idioma, f);
      expect(texto, `${idioma}/${f}`).toMatch(/^# .+\n\n::: info \S/);
      const abiertos = avisos(texto);
      for (const a of abiertos) {
        expect(["info", "tip", "warning"], `${idioma}/${f}: ${a[0]}`).toContain(a[1]);
        expect(a[2]?.trim(), `${idioma}/${f}: aviso sin título`).toBeTruthy();
      }
      expect(estructura(texto).cierres).toBe(abiertos.length);
    }
  });
});

describe("imágenes de la ayuda", () => {
  for (const idioma of ["es", "en"]) {
    describe(idioma, () => {
      it.each(paginas(idioma))(
        "%s: cada imagen existe, es del idioma y trae texto alternativo, pie y tamaño",
        (f) => {
          for (const img of imagenes(leer(idioma, f))) {
            const donde = `${idioma}/${f}: ${img.ruta}`;
            expect(img.ruta, donde).toMatch(new RegExp(`^\\.\\./img/${idioma}/[\\w-]+\\.webp$`));
            const archivo = join(RAIZ, "img", idioma, img.ruta.split("/").pop()!);
            expect(existsSync(archivo), `${donde} no existe`).toBe(true);
            expect(img.alt.trim().length, `${donde}: falta el texto alternativo`).toBeGreaterThan(10);
            expect(img.pie.trim(), `${donde}: falta el pie`).not.toBe("");
            expect(img.pie, `${donde}: el pie no puede llevar {{ ni comillas`).not.toMatch(/\{\{|"/);
            const ancho = Number(/width=(\d+)/.exec(img.attrs)?.[1]);
            const alto = Number(/height=(\d+)/.exec(img.attrs)?.[1]);
            expect(ancho > 0 && alto > 0, `${donde}: faltan width y height`).toBe(true);
            // las capturas se toman al doble de densidad de lo que se muestra: nunca más chicas que lo declarado
            const real = medidasWebp(archivo);
            expect(real.ancho, `${donde}: ancho real`).toBeGreaterThanOrEqual(ancho);
            expect(Math.abs(real.ancho / real.alto - ancho / alto), `${donde}: proporción`).toBeLessThan(
              0.01,
            );
          }
        },
      );

      it("no sobra ninguna imagen: todas las de la carpeta se usan", () => {
        const carpeta = join(RAIZ, "img", idioma);
        const todas = readdirSync(carpeta).map((n) => join(carpeta, n));
        const citadas = new Set(
          paginas(idioma).flatMap((f) =>
            imagenes(leer(idioma, f)).map((i) => join(carpeta, i.ruta.split("/").pop()!)),
          ),
        );
        expect(todas.filter((t) => !citadas.has(t))).toEqual([]);
        expect(todas.every((t) => t.endsWith(".webp"))).toBe(true);
      });
    });
  }

  it("las dos carpetas tienen las mismas imágenes", () => {
    expect(readdirSync(join(RAIZ, "img", "en")).sort()).toEqual(readdirSync(join(RAIZ, "img", "es")).sort());
  });
});

describe("enlaces entre páginas de la ayuda", () => {
  it.each(["es", "en"])("%s: todo enlace a otra página (x.md#ancla) apunta a una que existe", (idioma) => {
    const existentes = paginas(idioma);
    for (const f of paginas(idioma))
      for (const m of sinCodigo(leer(idioma, f)).matchAll(/\]\(([\w-]+\.md)(#[^)]*)?\)/g))
        expect(existentes, `${idioma}/${f} enlaza a ${m[1]}`).toContain(m[1]);
  });
});
