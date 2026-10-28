// Traduce el texto de error de SQLite a un mensaje en español. Lo no reconocido se devuelve tal cual.
const esCheck = (t: string) => t.includes("CHECK constraint failed");

const reglas: [(texto: string) => boolean, string][] = [
  [(t) => t.includes("ux_trabajadores_correo"), "Ya existe una persona con ese correo."],
  [(t) => t.includes("ux_etiquetas_nombre"), "Ya existe una etiqueta con ese nombre."],
  // Índice sobre columnas simples: SQLite informa las columnas, no el nombre del índice.
  [(t) => t.includes("UNIQUE constraint failed: unidad_etiquetas."), "La unidad ya tiene esa etiqueta."],
  [(t) => /ux_(cargos|tipos_contrato|sedes|jornadas)_nombre/.test(t), "Ese valor ya existe en la lista."],
  [(t) => esCheck(t) && t.includes("cargo_id"), "Una vacante necesita un cargo."],
  [(t) => esCheck(t) && t.includes("estado") && t.includes("nombre"), "Falta el nombre de la persona."],
  [(t) => esCheck(t) && t.includes("origen_id"), "Una unidad no puede conectarse consigo misma."],
  [(t) => t.includes("FOREIGN KEY constraint failed"), "La unidad o persona relacionada ya no existe."],
];

export function traducirError(e: unknown): string {
  const texto = typeof e === "string" ? e : e instanceof Error ? e.message : String(e);
  return reglas.find(([coincide]) => coincide(texto))?.[1] ?? texto;
}
