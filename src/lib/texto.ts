/** Las iniciales de un nombre para su avatar: las de las dos primeras palabras («Ana María Rojas» → «AM»). */
export const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

/** Para comparar nombres: minúsculas, sin tildes ni diéresis, espacios colapsados y recortados. */
export function normalizarTexto(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * `texto` partido en antes, coincidencia y después, para resaltar. `buscado` ya viene normalizado; se compara carácter
 * a carácter para volver del texto sin tildes a la posición original. `null` si no está.
 */
export function partirCoincidencia(texto: string, buscado: string): [string, string, string] | null {
  if (!buscado) return null;
  let plano = "";
  const origen: number[] = [];
  for (let i = 0; i < texto.length; i++) {
    // Como `normalizarTexto`, varios espacios seguidos cuentan como uno.
    const c = /\s/.test(texto[i]) ? (plano.endsWith(" ") ? "" : " ") : normalizarTexto(texto[i]);
    plano += c;
    for (let k = 0; k < c.length; k++) origen.push(i);
  }
  const desde = plano.indexOf(buscado);
  if (desde < 0) return null;
  const inicio = origen[desde];
  const fin = origen[desde + buscado.length - 1] + 1;
  return [texto.slice(0, inicio), texto.slice(inicio, fin), texto.slice(fin)];
}
