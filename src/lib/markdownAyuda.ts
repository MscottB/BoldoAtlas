// Reglas de markdown-it para las páginas de ayuda (ayuda/<idioma>/*.md). Las usan la app (VistaAyuda) y el sitio
// (site/.vitepress/config.mts): una sola fuente, el mismo resultado. Sin dependencias: solo tipos de markdown-it.
//
//  - Figura: una imagen sola en su párrafo, `![texto alternativo](../img/es/x.webp "Pie de foto"){width=640 height=360}`,
//    se dibuja como <figure> con <figcaption>, ancho y alto explícitos y carga diferida.
//  - Avisos (solo la app; VitePress ya trae ::: tip): `::: info En resumen`, `::: tip Consejo`, `::: warning Importante`,
//    el título es obligatorio y se cierra con `:::`.
import type { MarkdownIt, StateBlock, StateCore, Token } from "markdown-it";

export interface OpcionesAyuda {
  /** Convierte la ruta relativa de una imagen en la URL que sirve la app. Sin esto, el src queda como está. */
  resolverImagen?: (src: string) => string;
  /** Convierte un enlace a otra página (`arbol.md#x`) en la ruta de la app. Sin esto, el enlace queda como está. */
  rutaPagina?: (slug: string, ancla: string) => string;
  /** Agrega un id a cada encabezado (VitePress ya lo hace). */
  anclas?: boolean;
}

const TIPOS_AVISO = /^:::\s*(info|tip|warning)\s+(\S.*?)\s*$/;
const ATRIBUTOS_IMAGEN = new Set(["width", "height"]);

/** Un id estable para un encabezado: minúsculas, sin tildes, guiones. */
export function idEncabezado(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function avisos(state: StateBlock, inicio: number, fin: number, silencioso: boolean): boolean {
  if (state.sCount[inicio] - state.blkIndent >= 4) return false;
  const linea = (n: number) => state.src.slice(state.bMarks[n] + state.tShift[n], state.eMarks[n]);
  const m = TIPOS_AVISO.exec(linea(inicio));
  if (!m) return false;
  let cierre = inicio + 1;
  while (cierre < fin && !/^:::\s*$/.test(linea(cierre))) cierre++;
  if (cierre >= fin) return false; // sin cierre no es un aviso
  if (silencioso) return true;

  const abre = state.push("aviso_open", "div", 1);
  abre.block = true;
  abre.attrSet("class", `aviso aviso-${m[1]}`);
  abre.attrSet("role", "note");
  abre.map = [inicio, cierre];
  const p = state.push("paragraph_open", "p", 1);
  p.attrSet("class", "aviso-titulo");
  const titulo = state.push("inline", "", 0);
  titulo.content = m[2]!;
  titulo.children = [];
  state.push("paragraph_close", "p", -1);

  const { parentType, lineMax } = state;
  state.parentType = "blockquote"; // un tipo de contenedor cualquiera: el contenido es bloque normal
  state.lineMax = cierre;
  state.md.block.tokenize(state, inicio + 1, cierre);
  state.parentType = parentType;
  state.lineMax = lineMax;

  state.push("aviso_close", "div", -1).block = true;
  state.line = cierre + 1;
  return true;
}

/** `{width=640 height=360}` justo después de una imagen (VitePress ya lo resuelve con markdown-it-attrs). */
function atributosDeImagen(hijos: Token[]) {
  for (let i = 0; i < hijos.length - 1; i++) {
    const img = hijos[i]!;
    const sig = hijos[i + 1]!;
    if (img.type !== "image" || sig.type !== "text") continue;
    const m = /^\{([^}]*)\}/.exec(sig.content);
    if (!m) continue;
    for (const [, k, v] of m[1]!.matchAll(/(\w+)=("[^"]*"|\S+)/g))
      if (ATRIBUTOS_IMAGEN.has(k!)) img.attrSet(k!, v!.replace(/^"|"$/g, ""));
    sig.content = sig.content.slice(m[0].length);
  }
}

export function reglasAyuda(md: MarkdownIt, opciones: OpcionesAyuda & { avisos?: boolean } = {}) {
  if (opciones.avisos)
    md.block.ruler.before("fence", "aviso", avisos, {
      alt: ["paragraph", "reference", "blockquote", "list"],
    });

  md.core.ruler.push("ayuda", (state: StateCore) => {
    const usados = new Map<string, number>();
    const ts = state.tokens;
    for (let i = 0; i < ts.length; i++) {
      const t = ts[i]!;
      if (opciones.anclas && t.type === "heading_open" && ts[i + 1]?.type === "inline") {
        const base = idEncabezado(ts[i + 1]!.content) || "seccion";
        const n = usados.get(base) ?? 0;
        usados.set(base, n + 1);
        t.attrSet("id", n ? `${base}-${n + 1}` : base);
      }
      if (t.type !== "inline" || !t.children) continue;
      atributosDeImagen(t.children);
      for (const h of t.children) {
        if (h.type === "image") {
          h.attrSet("loading", "lazy");
          h.attrSet("decoding", "async");
          const src = String(h.attrGet("src") ?? "");
          if (src && opciones.resolverImagen) h.attrSet("src", opciones.resolverImagen(src));
        } else if (h.type === "link_open" && opciones.rutaPagina) {
          const m = /^([\w-]+)\.md(#.*)?$/.exec(String(h.attrGet("href") ?? ""));
          if (m) h.attrSet("href", opciones.rutaPagina(m[1]!, m[2] ?? ""));
        }
      }
      // Una imagen sola en su párrafo es una figura; su título es el pie.
      const solo = t.children.filter((h) => h.type !== "text" || h.content.trim() !== "");
      if (
        solo.length === 1 &&
        solo[0]!.type === "image" &&
        ts[i - 1]?.type === "paragraph_open" &&
        !ts[i - 1]!.hidden
      ) {
        const img = solo[0]!;
        const pie = img.attrGet("title");
        img.attrs = img.attrs?.filter(([k]) => k !== "title") ?? null;
        ts[i - 1]!.tag = "figure";
        ts[i - 1]!.attrSet("class", "figura");
        ts[i + 1]!.tag = "figure";
        if (pie) {
          const leyenda = new state.Token("html_block", "", 0);
          leyenda.content = `<figcaption>${md.utils.escapeHtml(String(pie))}</figcaption>\n`;
          ts.splice(i + 1, 0, leyenda);
        }
      }
    }
    return true;
  });
}
