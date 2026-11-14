// Un libro de Excel como datos: hojas con su nombre, sus columnas y sus filas. Lo arman funciones puras (listas.ts y la
// exportación completa); escribir.ts le da el formato de spec §11 al pasarlo a .xlsx.

/** Texto, número o fecha (Date ya ajustada con `fechaExcel` o `momentoExcel`); null = celda vacía. */
export type Celda = string | number | Date | null;

export interface Hoja {
  nombre: string;
  columnas: string[];
  filas: Celda[][];
}

/** Lo que traduce los títulos: `t` de vue-i18n. */
export type Traducir = (clave: string) => string;

/** Para el nombre del archivo: como `nombre_limpio` de Rust (el `.boldo`), sin lo que un sistema de archivos no acepta. */
const limpio = (nombre: string) => nombre.trim().replace(/[^\p{L}\p{N}]/gu, "_");

/** `Organizacion_AAAA-MM-DD_rN.xlsx`, como el `.boldo`. */
export function nombreArchivo(organizacion: string, fecha: string, revision: string | number): string {
  return `${limpio(organizacion) || "BoldoAtlas"}_${fecha}_r${revision}.xlsx`;
}

/** Excel no acepta `\ / ? * [ ] :`, un apóstrofo al principio o al final, ni más de 31 caracteres en el nombre de una hoja. */
export const nombreHoja = (nombre: string): string =>
  nombre
    .replace(/[\\/?*[\]:]/g, "_")
    .trim()
    .replace(/^'+|'+$/g, "")
    .slice(0, 31) || "Hoja";

// Excel no tiene zona horaria: ExcelJS escribe la hora UTC de la Date. Se pasa la hora del reloj como si fuera UTC.
/** AAAA-MM-DD → ese día en Excel. */
export const fechaExcel = (iso: string): Date => new Date(`${iso}T00:00:00Z`);
/** Un momento → con la hora de este computador. */
export const momentoExcel = (d: Date): Date =>
  new Date(
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()),
  );

/** Lo que se ve de una fecha: con hora solo si la tiene. */
export function textoFecha(d: Date): string {
  const iso = d.toISOString();
  return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

export interface DatosInformacion {
  organizacion: string;
  generado: Date;
  versionApp: string;
  versionEsquema: number;
  revision: number;
  dbId: string;
  /** Qué lista se exportó. */
  lista: string;
  /** AAAA-MM-DD de los datos: hoy o el día que muestra «Organigrama a una fecha». */
  fecha: string;
  /** Filtros aplicados, ya traducidos: [qué, valor]. */
  filtros: [string, string][];
  /** El orden de la lista, ya traducido, si se puede elegir. */
  orden?: string;
}

/** La hoja Información (siempre incluida). Sin escenarios todavía: no tiene fila de escenario. */
export function hojaInformacion(d: DatosInformacion, t: Traducir): Hoja {
  const fila = (clave: string, valor: Celda): Celda[] => [t(`excel.info.${clave}`), valor];
  return {
    nombre: t("excel.info.hoja"),
    columnas: [t("excel.info.dato"), t("excel.info.valor")],
    filas: [
      fila("organizacion", d.organizacion),
      fila("generado", momentoExcel(d.generado)),
      fila("datosAl", fechaExcel(d.fecha)),
      fila("versionApp", d.versionApp),
      fila("versionEsquema", d.versionEsquema),
      fila("revision", d.revision),
      fila("dbId", d.dbId),
      fila("lista", d.lista),
      ...(d.filtros.length ? d.filtros : [[t("excel.info.filtros"), t("excel.info.sinFiltros")]]),
      ...(d.orden ? [fila("orden", d.orden)] : []),
    ],
  };
}

const ANCHO_MIN = 8;
const ANCHO_MAX = 60;

/** Ancho de cada columna en caracteres: el texto más largo (título incluido) y un margen, entre un mínimo y un máximo. */
export function anchos(h: Hoja): number[] {
  const largo = (c: Celda) => (c === null ? 0 : c instanceof Date ? textoFecha(c).length : String(c).length);
  return h.columnas.map((titulo, i) => {
    const mayor = h.filas.reduce((m, f) => Math.max(m, largo(f[i] ?? null)), titulo.length);
    return Math.min(ANCHO_MAX, Math.max(ANCHO_MIN, mayor + 2));
  });
}
