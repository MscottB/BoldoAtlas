import { readFileSync } from "node:fs";

const repo = new URL("../..", import.meta.url);

// Lo que el sitio no puede decir: versiones, fechas de versión, «Próximamente», «por ahora», fases ni «cumple».
export const PROHIBIDO =
  /\b(alpha|alfa|beta)\b|\bv\d+\.\d+|\bversi[oó]n\s+\d|\bversion\s+\d|\d{4}-\d{2}-\d{2}|pr[oó]ximamente|coming soon|por ahora|\bfor now\b|\bfase\s+\d|\bphase\s+\d|cumpl[ea]|compl(y|ies)\b/i;

export const slugTitulo = (titulo) =>
  titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export const anclasAyuda = (idioma, pagina) =>
  [...readFileSync(new URL(`ayuda/${idioma}/${pagina}.md`, repo), "utf8").matchAll(/^#{2,3} +(.+)$/gm)].map(
    (m) => slugTitulo(m[1]),
  );

// Recorre en profundidad objetos y arreglos de JSON; llama a visita(valor, clave) con cada valor.
export function recorrer(nodo, visita, clave) {
  visita(nodo, clave);
  if (Array.isArray(nodo)) nodo.forEach((v, i) => recorrer(v, visita, i));
  else if (nodo && typeof nodo === "object")
    for (const [k, v] of Object.entries(nodo)) recorrer(v, visita, k);
}
