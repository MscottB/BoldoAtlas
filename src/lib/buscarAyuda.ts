// Buscador de la Ayuda: parte cada página en secciones (por encabezado) y busca por palabras, sin tildes ni mayúsculas.
import { generadorDeIds } from "@/lib/markdownAyuda";
import { normalizarTexto, partirCoincidencia } from "@/lib/texto";

export interface PaginaAyuda {
  slug: string;
  titulo: string;
  texto: string;
}

export interface Seccion {
  slug: string;
  pagina: string;
  encabezado: string;
  /** Id del encabezado en la página (vacío en la introducción). */
  id: string;
  lineas: string[];
}

export interface Resultado {
  slug: string;
  pagina: string;
  encabezado: string;
  id: string;
  /** El extracto partido en antes, coincidencia y después. */
  extracto: [string, string, string];
}

/** Quita lo que no se lee: énfasis, código, enlaces `[texto](url)` y las marcas de los avisos. */
const limpiar = (l: string) =>
  l
    .replace(/!\[[^\]]*\]\([^)]*\)(\{[^}]*\})?/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/^\s*(:::\s*\w*|[-*]\s|\d+\.\s|>\s?)/, "")
    .replace(/^\|?\s*[-:| ]+\|?$/, "")
    .trim();

/** Descripción corta de una página: el primer párrafo de su «En resumen» (`::: info …`). */
export function resumenDe(texto: string): string {
  const m = /^:::\s*info\s+.+\n+([\s\S]*?)\n+:::\s*$/m.exec(texto.replace(/\r\n/g, "\n"));
  return m ? limpiar(m[1]!.split(/\n\s*\n/)[0]!.replace(/\n/g, " ")) : "";
}

export function seccionesDe(paginas: PaginaAyuda[]): Seccion[] {
  const salida: Seccion[] = [];
  for (const p of paginas) {
    const idDe = generadorDeIds();
    let actual: Seccion = { slug: p.slug, pagina: p.titulo, encabezado: p.titulo, id: "", lineas: [] };
    let codigo = false;
    for (const l of p.texto.replace(/\r\n/g, "\n").split("\n")) {
      if (/^(```|~~~)/.test(l)) codigo = !codigo;
      const h = !codigo && /^(#{1,6})\s+(.+?)\s*$/.exec(l);
      if (h) {
        // el id se calcula con todos los encabezados, el título incluido, igual que en el HTML
        const id = idDe(h[2]!);
        if (h[1]!.length === 1) continue;
        salida.push(actual);
        actual = { slug: p.slug, pagina: p.titulo, encabezado: limpiar(h[2]!), id, lineas: [] };
      } else {
        const limpia = limpiar(l);
        if (limpia) actual.lineas.push(limpia);
      }
    }
    salida.push(actual);
  }
  return salida;
}

/** La búsqueda solo se ejecuta con al menos dos letras; antes, la vista no debe decir «sin resultados». */
export const consultaValida = (consulta: string) => normalizarTexto(consulta).replace(/ /g, "").length >= 2;

/** Secciones que contienen todas las palabras (en el encabezado o el texto), con un extracto de la primera coincidencia. */
export function buscarEnAyuda(secciones: Seccion[], consulta: string, maximo = 30): Resultado[] {
  if (!consultaValida(consulta)) return [];
  const palabras = normalizarTexto(consulta).split(" ").filter(Boolean);
  const resultados: Resultado[] = [];
  for (const s of secciones) {
    const todo = normalizarTexto([s.pagina, s.encabezado, ...s.lineas].join(" "));
    if (!palabras.every((w) => todo.includes(w))) continue;
    const candidatas = [s.encabezado, ...s.lineas];
    const linea =
      candidatas.find((l) => palabras.every((w) => normalizarTexto(l).includes(w))) ??
      candidatas.find((l) => normalizarTexto(l).includes(palabras[0]!)) ??
      s.encabezado;
    const palabra = palabras.find((w) => normalizarTexto(linea).includes(w)) ?? palabras[0]!;
    const [antes, medio, despues] = partirCoincidencia(linea, palabra) ?? [linea, "", ""];
    resultados.push({
      slug: s.slug,
      pagina: s.pagina,
      encabezado: s.encabezado,
      id: s.id,
      extracto: [
        antes.length > 50 ? `…${antes.slice(-50)}` : antes,
        medio,
        despues.length > 70 ? `${despues.slice(0, 70)}…` : despues,
      ],
    });
    if (resultados.length >= maximo) break;
  }
  return resultados;
}
