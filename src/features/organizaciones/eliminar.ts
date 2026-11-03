import { computed, ref, watch } from "vue";
import type { AvanceEliminar, Organizacion } from "@/db/cliente";
import type { Pestana } from "@/features/pestanas/pestanas";

/** El título de la sección: adonde va el foco si lo que lo tenía ya no está. */
export const ID_SECCION = "cfg-organizaciones";

const limpio = (s: string) => s.normalize("NFC").trim().replace(/\s+/g, " ");
const legible = (bytes: number | null) => (typeof bytes === "number" && Number.isFinite(bytes) ? bytes : 0);

/** Lo que se muestra y se pide escribir: el diálogo no puede pedir algo que no se ve. */
export const textoAConfirmar = (o: Pick<Organizacion, "nombre">, sinNombre: string): string =>
  limpio(o.nombre) || sinNombre;

/** Coincide salvo por los espacios de los extremos y repetidos, y por la forma Unicode de las tildes. */
export function confirmaEliminar(escrito: string, esperado: string): boolean {
  const e = limpio(esperado);
  return e !== "" && limpio(escrito) === e;
}

/**
 * El nombre escrito confirma las opciones de ese momento. Si pasan a ser sin archivo, lo que se va a hacer es otra cosa: borrar los
 * respaldos sin copia. Hay que escribirlo otra vez, y un Enter mantenido o repetido no decide por nadie. Tras un fallo de Rust se
 * vacía sin ceder el hilo: el archivo pudo irse, y lo escrito no puede esperar a que llegue la lista, que quizá no llegue.
 */
export function useConfirmacion(nombre: () => string, sinArchivo: () => boolean, confirmar: () => unknown) {
  const escrito = ref("");
  const confirmado = computed(() => confirmaEliminar(escrito.value, nombre()));
  watch(sinArchivo, () => (escrito.value = ""));
  const alEnter = (e: KeyboardEvent) => {
    if (!e.repeat) void confirmar();
  };
  const trasFallo = (codigo: string | undefined) => {
    if (codigo) escrito.value = "";
  };
  return { escrito, confirmado, alEnter, trasFallo };
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

/** Lo que se sabe tras un fallo: lo que dijo Rust, sumado a lo anterior. Un segundo intento no deshace lo que hizo el primero. */
export function intentoTrasFallo(
  anterior: AvanceEliminar | undefined,
  avance: AvanceEliminar | undefined,
): AvanceEliminar | undefined {
  if (!avance) return anterior;
  return {
    archivoBorrado: !!anterior?.archivoBorrado || avance.archivoBorrado,
    copia: avance.copia ?? anterior?.copia ?? null,
  };
}

/** Qué texto explica lo que se va a borrar y lo que no, dentro de `organizaciones.eliminar.seBorra`. */
export function claveQueSeBorra(
  o: Organizacion,
  sinArchivo: boolean,
  borrarArchivo: boolean,
  intento?: AvanceEliminar,
): string {
  if (sinArchivo && intento?.archivoBorrado) return intento.copia ? "reintentoConCopia" : "reintentoSinCopia";
  if (o.externa) return sinArchivo ? "externaSinArchivo" : borrarArchivo ? "externaConArchivo" : "externa";
  if (sinArchivo) return "internaSinArchivo";
  return esPrincipal(o) ? "principal" : "interna";
}

/** Qué aviso dar al terminar, dentro de `organizaciones.eliminar`: lo que solo salió de la lista no se dice eliminado. */
export function claveHecha(
  o: Organizacion,
  opciones: OpcionesEliminar,
  sinArchivo: boolean,
  intento?: AvanceEliminar,
): string {
  if (o.externa && !opciones.borrarArchivo && !intento?.archivoBorrado)
    return sinArchivo ? "salioSinArchivo" : "salio";
  return opciones.guardarCopia || intento?.copia ? "hechaConCopia" : "hecha";
}

/** `boldo.db` no se pasa a sí misma. */
export const claveAbierta = (o: Organizacion): string => (esPrincipal(o) ? "abiertaPrincipal" : "abierta");

/**
 * El aviso si el diálogo ya no está, dentro de `organizaciones.eliminar`; null si basta el motivo. `boldo.db`, la última: Rust ya la
 * vació y abrió otra con su lugar en la lista, así que no hay nada que reintentar. `sigueEnLaLista` null: no se pudo leer.
 */
export function claveFalloFuera(f: { pasoAOtra: boolean; sigueEnLaLista: boolean | null }): string | null {
  if (!f.pasoAOtra) return null;
  if (f.sigueEnLaLista === null) return "falloYaEnOtraSinLista";
  return f.sigueEnLaLista ? "falloYaEnOtra" : "falloSinVuelta";
}

/** Si conviene decir que se puede eliminar sin copia. Con un enlace no: lo que falla es borrarlo, no copiarlo. */
export const aconsejaSinCopia = (codigo: string, detalle: string): boolean =>
  codigo === "danado" || (codigo === "contenido_invalido" && detalle !== "enlace");
