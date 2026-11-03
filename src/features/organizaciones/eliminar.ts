import type { Organizacion } from "@/db/cliente";
import type { Pestana } from "@/features/pestanas/pestanas";

/** El título de la sección: adonde va el foco si lo que lo tenía ya no está. */
export const ID_SECCION = "cfg-organizaciones";

const limpio = (s: string) => s.normalize("NFC").trim().replace(/\s+/g, " ");
const legible = (bytes: number) => (Number.isFinite(bytes) ? bytes : 0);

/** Lo que se muestra y se pide escribir: el diálogo no puede pedir algo que no se ve. */
export const textoAConfirmar = (o: Pick<Organizacion, "nombre">, sinNombre: string): string =>
  limpio(o.nombre) || sinNombre;

/** Coincide salvo por los espacios de los extremos y repetidos, y por la forma Unicode de las tildes. */
export function confirmaEliminar(escrito: string, esperado: string): boolean {
  const e = limpio(esperado);
  return e !== "" && limpio(escrito) === e;
}

export const espacioQueLibera = (o: Organizacion, borrarArchivo: boolean): number =>
  legible(o.bytesRespaldos) + (!o.externa || borrarArchivo ? legible(o.bytesBase) : 0);

export const pestanasDe = (lista: Pestana[], id: string): number => lista.filter((p) => p.org === id).length;

export interface OpcionesEliminar {
  guardarCopia: boolean;
  borrarArchivo: boolean;
}

/**
 * Lo que se le pide a Rust según lo marcado. Sin el archivo no se puede copiar ni borrar: daría `no_encontrado`, y solo termina
 * sin esas opciones. Una externa que solo sale de la lista no pierde su base: no hay nada que copiar.
 */
export function opcionesEliminar(
  o: Organizacion,
  marcadas: { copia: boolean; archivo: boolean },
  sinArchivo: boolean,
): OpcionesEliminar {
  if (sinArchivo) return { guardarCopia: false, borrarArchivo: false };
  const borrarArchivo = o.externa && marcadas.archivo;
  return { guardarCopia: (!o.externa || borrarArchivo) && marcadas.copia, borrarArchivo };
}

/** La lista solo da la ruta completa: `boldo.db` es la que está en su carpeta de datos con ese nombre. */
const esPrincipal = (o: Organizacion) => !o.externa && /[\\/]boldo\.db$/.test(o.ruta);

/** Qué texto explica lo que se va a borrar y lo que no, dentro de `organizaciones.eliminar.seBorra`. */
export function claveQueSeBorra(o: Organizacion, sinArchivo: boolean, borrarArchivo: boolean): string {
  if (o.externa) return sinArchivo ? "externaSinArchivo" : borrarArchivo ? "externaConArchivo" : "externa";
  if (sinArchivo) return "internaSinArchivo";
  return esPrincipal(o) ? "principal" : "interna";
}

/** Qué aviso dar al terminar, dentro de `organizaciones.eliminar`: lo que solo salió de la lista no se dice eliminado. */
export function claveHecha(o: Organizacion, opciones: OpcionesEliminar): string {
  if (o.externa && !opciones.borrarArchivo) return "salio";
  return opciones.guardarCopia ? "hechaConCopia" : "hecha";
}
