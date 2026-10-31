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
