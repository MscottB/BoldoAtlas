// Un libro de Excel como datos: hojas con su nombre, sus columnas y sus filas. Lo arman funciones puras (listas.ts y la
// exportación completa); escribir.ts le da el formato de spec §11 al pasarlo a .xlsx.

/** Texto, número o fecha (Date ya ajustada con `fechaExcel` o `momentoExcel`); null = celda vacía. */
export type Celda = string | number | Date | null;

export interface Hoja {
  nombre: string;
  columnas: string[];
  filas: Celda[][];
  /** Una imagen junto a los datos (el logo en Información): base64 de un PNG, como `meta.logo_png`. */
  imagen?: { png: string };
}

/** Lo que traduce los títulos: `t` de vue-i18n. */
export type Traducir = (clave: string, valores?: Record<string, unknown>) => string;

/** Ancho y alto de un PNG (base64) según su cabecera; null si no es un PNG. */
export function medidasPng(base64: string): { ancho: number; alto: number } | null {
  let b: string;
  try {
    b = atob(base64.slice(0, 32)); // 24 bytes: firma, largo y tipo de IHDR, ancho y alto
  } catch {
    return null;
  }
  if (b.length < 24 || !b.startsWith("\x89PNG\r\n\x1a\n") || b.slice(12, 16) !== "IHDR") return null;
  const u32 = (i: number) => [0, 1, 2, 3].reduce((n, k) => n * 256 + b.charCodeAt(i + k), 0);
  const ancho = u32(16);
  const alto = u32(20);
  return ancho && alto ? { ancho, alto } : null;
}

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
  /** Exportación completa: el alcance elegido y las hojas que lleva, ya traducidos. */
  alcance?: string;
  hojas?: string[];
  /** Filtros aplicados de una lista, ya traducidos: [qué, valor]. La exportación completa no tiene. */
  filtros?: [string, string][];
  /** El orden de la lista, ya traducido, si se puede elegir. */
  orden?: string;
  /** El logo de la organización (base64 de `meta.logo_png`); sin él, la hoja no lleva imagen. */
  logo?: string | null;
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
      ...(d.alcance ? [fila("alcance", d.alcance)] : []),
      ...(d.hojas ? [fila("hojas", d.hojas.join(", "))] : []),
      // «Filtro: Unidad»: que no se lean como datos de la organización
      ...(!d.filtros
        ? []
        : d.filtros.length
          ? d.filtros.map(([que, valor]) => [t("excel.info.filtro", { que }), valor])
          : [[t("excel.info.filtros"), t("excel.info.sinFiltros")]]),
      ...(d.orden ? [fila("orden", d.orden)] : []),
    ],
    ...(d.logo ? { imagen: { png: d.logo } } : {}),
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
