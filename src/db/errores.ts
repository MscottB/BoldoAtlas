// Traduce el texto de error de SQLite al idioma activo (claves errores.*). Lo no reconocido se devuelve tal cual.
import { i18n } from "@/i18n";

const esCheck = (t: string) => t.includes("CHECK constraint failed");

const reglas: [(texto: string) => boolean, string][] = [
  [(t) => t.includes("ux_trabajadores_correo"), "errores.correoDuplicado"],
  [(t) => t.includes("ux_etiquetas_nombre"), "errores.etiquetaDuplicada"],
  // Índice sobre columnas simples: SQLite informa las columnas, no el nombre del índice.
  [(t) => t.includes("UNIQUE constraint failed: unidad_etiquetas."), "errores.unidadYaEtiquetada"],
  [(t) => /ux_(cargos|tipos_contrato|sedes|jornadas)_nombre/.test(t), "errores.valorDuplicado"],
  [(t) => esCheck(t) && t.includes("cargo_id"), "errores.vacanteSinCargo"],
  [(t) => esCheck(t) && t.includes("estado") && t.includes("nombre"), "errores.personaSinNombre"],
  [(t) => esCheck(t) && t.includes("origen_id"), "errores.conexionConsigoMisma"],
  [(t) => t.includes("FOREIGN KEY constraint failed"), "errores.relacionInexistente"],
];

export function traducirError(e: unknown): string {
  const texto = typeof e === "string" ? e : e instanceof Error ? e.message : String(e);
  const clave = reglas.find(([coincide]) => coincide(texto))?.[1];
  return clave ? i18n.global.t(clave) : texto;
}
