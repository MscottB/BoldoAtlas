// Traduce el texto de error de SQLite al idioma activo (claves errores.*). Lo no reconocido se devuelve tal cual.
import { i18n } from "@/i18n";

const esCheck = (t: string) => t.includes("CHECK constraint failed");

const reglas: [(texto: string) => boolean, string][] = [
  [(t) => t.includes("ux_trabajadores_correo"), "errores.correoDuplicado"],
  [(t) => t.includes("ux_etiquetas_nombre"), "errores.etiquetaDuplicada"],
  // Índice sobre columnas simples: SQLite informa las columnas, no el nombre del índice.
  [(t) => t.includes("UNIQUE constraint failed: unidad_etiquetas."), "errores.unidadYaEtiquetada"],
  [(t) => t.includes("UNIQUE constraint failed: subarboles_guardados."), "errores.ramaYaGuardada"],
  [(t) => t.includes("ux_vistas_nombre"), "errores.vistaDuplicada"],
  [
    (t) => /ux_(cargos|tipos_contrato|sedes|jornadas|tipos_unidad|leyendas)_nombre/.test(t),
    "errores.valorDuplicado",
  ],
  // Titular y reemplazo vigentes usan índices sobre la misma columna: SQLite no los distingue.
  [(t) => t.includes("UNIQUE constraint failed: asignaciones."), "errores.asignacionVigenteDuplicada"],
  [(t) => esCheck(t) && t.includes("hasta >= desde"), "errores.fechasInvertidas"],
  [(t) => esCheck(t) && t.includes("color GLOB"), "errores.colorInvalido"],
  [(t) => t.includes("NOT NULL constraint failed: trabajadores.nombre"), "errores.personaSinNombre"],
  [(t) => esCheck(t) && t.includes("origen_id"), "errores.conexionConsigoMisma"],
  [(t) => t.includes("FOREIGN KEY constraint failed"), "errores.relacionInexistente"],
];

// Mensajes de arranque de la parte nativa (Rust, escritos en español): se reconocen por su texto y se vuelven a
// decir en el idioma activo con sus datos (ruta, versiones). El detalle del sistema operativo se deja como llega.
const nativos: [RegExp, string][] = [
  [/dentro de un \.zip \((?<ruta>.+?)\)\./s, "errores.desdeZip"],
  [/esquema (?<actual>\d+); esta app conoce hasta el (?<conocida>\d+)/, "errores.esquemaNuevo"],
  [/^No se puede escribir en (?<ruta>.+?)\. Mueve .*Detalle: (?<detalle>.*)$/s, "errores.sinPermiso"],
  [/^No se encontró la carpeta APPDATA/, "errores.sinAppdata"],
  [/^No se pudo ubicar la carpeta del programa|^No se ubicó la carpeta de datos/, "errores.sinCarpeta"],
  [/^La base de datos no está abierta|estado inválido/, "errores.baseNoDisponible"],
  [/modo solo lectura/, "errores.baseSoloLectura"],
];

export function traducirError(e: unknown): string {
  const texto = typeof e === "string" ? e : e instanceof Error ? e.message : String(e);
  const clave = reglas.find(([coincide]) => coincide(texto))?.[1];
  if (clave) return i18n.global.t(clave);
  for (const [re, k] of nativos) {
    const m = re.exec(texto);
    if (m) return i18n.global.t(k, { ...m.groups });
  }
  return texto;
}
