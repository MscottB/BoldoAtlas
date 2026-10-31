/** Para comparar nombres: minúsculas, sin tildes ni diéresis, espacios colapsados y recortados. */
export function normalizarTexto(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
