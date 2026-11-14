import type { Hoja } from "./libro";

/** Lo que una lista (o la exportación completa) exporta: lo que se ve en el momento de aceptar el aviso. */
export interface Lista {
  /** Qué lista es, para la hoja Información. */
  nombre: string;
  /** Sus hojas; Información va al final. */
  hojas: Hoja[];
  /** Filtros aplicados, ya traducidos: [qué, valor]. Solo los activos; la exportación completa no tiene. */
  filtros?: [string, string][];
  /** Exportación completa: el alcance elegido, ya traducido. Información dice también qué hojas lleva. */
  alcance?: string;
  orden?: string;
  /** AAAA-MM-DD que muestra la lista si sigue a «Organigrama a una fecha»; si no, hoy. */
  fecha?: string | null;
}

export interface Pasos {
  /** El aviso obligatorio de spec §11 (sin cifrar, responsabilidad de quien genera): true si se aceptó. */
  aceptar: () => Promise<boolean>;
  armar: () => Promise<{ nombre: string; hojas: Hoja[] }>;
  escribir: (hojas: Hoja[]) => Promise<Uint8Array>;
  /** «Guardar como»: el nombre del archivo guardado, o null si no se eligió un lugar. */
  guardar: (nombre: string, libro: Uint8Array) => Promise<string | null>;
}

/** Se pregunta en cada exportación; sin aceptar no se arma ni se escribe nada. */
export async function exportar(p: Pasos): Promise<string | null> {
  if (!(await p.aceptar())) return null;
  const { nombre, hojas } = await p.armar();
  return p.guardar(nombre, await p.escribir(hojas));
}
