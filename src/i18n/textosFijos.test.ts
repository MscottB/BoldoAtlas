import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "vue/compiler-sfc";

// Todo texto visible pasa por i18n: este test falla si una plantilla .vue tiene texto o atributos accesibles fijos,
// o si un toast se llama con un literal. Revisa plantillas (no el script): los textos que arma el código van en
// los .ts de cada función con `t()` y los cubren sus pruebas.
const RAIZ = join(process.cwd(), "src");
const SALTAR = [join("src", "dev")];

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const ruta = join(dir, n);
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return ruta.endsWith(".vue") && !SALTAR.some((s) => relative(process.cwd(), ruta).startsWith(s)) ? [ruta] : [];
  });
}

// Marcas y símbolos que no se traducen: el nombre del programa, teclas y el código de idioma.
const PERMITIDOS = new Set(["BoldoAtlas", "Boldo", "Atlas", "Ctrl", "Esc", "Enter", "Shift", "Alt", "K", "T", "ES", "EN"]);
const ATRIBUTOS = ["aria-label", "title", "placeholder", "alt", "label", "description", "aria-description", "aria-roledescription", "aria-valuetext"];
const ATAJO = /^(Ctrl|Alt|Shift)[ +]\S+$/; // «Ctrl K», «Ctrl+D»: teclas, no se traducen
const conLetras = (s: string) => /\p{L}{2,}/u.test(s) && !PERMITIDOS.has(s.trim()) && !ATAJO.test(s.trim());

// Literal suelto o rama de un ternario / || / ?? / &&: `x ? "Sí" : "No"`. Se saltan las claves de i18n («a.b»), los
// literales con ${} y los que no tienen letras.
function literales(exp: string): string[] {
  const entero = /^\s*(["'`])((?:(?!\1).)*)\1\s*$/.exec(exp);
  const ramas = [...exp.matchAll(/(?:\?\?|\|\||&&|[?:])\s*(["'`])((?:(?!\1).)*?)\1/g)].map((m) => m[2]!);
  return [...(entero ? [entero[2]!] : []), ...ramas].filter((l) => !l.includes("${") && !/^\w+(\.\w+)+$/.test(l) && conLetras(l));
}

interface Nodo {
  type: number;
  content?: string | { content?: string };
  children?: Nodo[];
  props?: { type: number; name: string; value?: { content: string }; exp?: { content: string }; arg?: { content: string } }[];
  loc: { start: { line: number } };
}

function hallazgos(ruta: string): string[] {
  const { descriptor } = parse(readFileSync(ruta, "utf8"));
  const salida: string[] = [];
  const ver = (n: Nodo) => {
    const donde = `${relative(process.cwd(), ruta)}:${n.loc.start.line}`;
    if (n.type === 2 && typeof n.content === "string" && conLetras(n.content.trim()))
      salida.push(`${donde} texto «${n.content.trim()}»`);
    for (const p of n.props ?? []) {
      // Atributo estático (type 6) o enlace con un literal entre comillas (type 7).
      if (p.type === 6 && ATRIBUTOS.includes(p.name) && p.value && conLetras(p.value.content))
        salida.push(`${donde} ${p.name}="${p.value.content}"`);
      if (p.type === 7 && p.exp) {
        if (p.arg && ATRIBUTOS.includes(p.arg.content))
          for (const l of literales(p.exp.content)) salida.push(`${donde} :${p.arg.content} «${l}»`);
        // Toasts en un manejador de evento (@click="toast('texto')").
        for (const m of p.exp.content.matchAll(/toast(?:\.\w+)?\(\s*(["'`])([^"'`]*\p{L}{2,}[^"'`]*)\1/gu))
          salida.push(`${donde} toast «${m[2]}»`);
      }
    }
    // Interpolaciones: {{ "texto" }} o {{ cond ? "Sí" : "No" }}
    if (n.type === 5 && typeof n.content === "object" && n.content?.content)
      for (const l of literales(n.content.content)) salida.push(`${donde} {{ «${l}» }}`);
    n.children?.forEach(ver);
  };
  if (descriptor.template?.ast) ver(descriptor.template.ast as unknown as Nodo);
  // Toasts con texto literal (fuera de la plantilla, en el script).
  const script = (descriptor.script?.content ?? "") + (descriptor.scriptSetup?.content ?? "");
  for (const m of script.matchAll(/toast(?:\.\w+)?\(\s*(["'`])([^"'`]*\p{L}{2,}[^"'`]*)\1/gu))
    salida.push(`${relative(process.cwd(), ruta)} toast «${m[2]}»`);
  return salida;
}

describe("textos fijos en plantillas", () => {
  it("ninguna plantilla .vue tiene texto visible fuera de i18n", () => {
    const todos = archivos(RAIZ).flatMap(hallazgos);
    expect(todos).toEqual([]);
  });
});
