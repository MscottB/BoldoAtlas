import { computed, ref, watch } from "vue";
import type { Organizacion } from "@/db/cliente";
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
 * respaldos sin copia. Hay que escribirlo otra vez, y un Enter mantenido o repetido no decide por nadie.
 */
export function useConfirmacion(nombre: () => string, sinArchivo: () => boolean, confirmar: () => unknown) {
  const escrito = ref("");
  const confirmado = computed(() => confirmaEliminar(escrito.value, nombre()));
  watch(sinArchivo, () => (escrito.value = ""));
  const alEnter = (e: KeyboardEvent) => {
    if (!e.repeat) void confirmar();
  };
  return { escrito, confirmado, alEnter };
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

/**
 * Lo que queda anotado tras un fallo. Un `no_encontrado` o un cancelado no tocaron nada. Reintentar sin las casillas no borra lo que
 * logró el anterior: su copia sigue ahí. Con el archivo aún ahí vale el último, porque el anterior no llegó a borrarlo.
 */
export function intentoTrasFallo(
  anterior: OpcionesEliminar | undefined,
  pedidas: OpcionesEliminar,
  sinArchivo: boolean,
  codigo: string | undefined,
): OpcionesEliminar | undefined {
  return !codigo || codigo === "no_encontrado" || sinArchivo ? anterior : pedidas;
}

/**
 * El intento anterior, si fue la app la que borró el archivo. Rust copia antes de borrar: sin archivo, la copia que pidió está hecha.
 * shortcut: un fallo antes de borrar seguido de retirar el pendrive se contaría como borrado; para distinguirlo, Rust tendría que decirlo.
 */
export const intentoQueBorro = (
  o: Organizacion,
  intento: OpcionesEliminar | undefined,
): OpcionesEliminar | undefined =>
  intento && !o.existe && (!o.externa || intento.borrarArchivo) ? intento : undefined;

/** Qué texto explica lo que se va a borrar y lo que no, dentro de `organizaciones.eliminar.seBorra`. */
export function claveQueSeBorra(
  o: Organizacion,
  sinArchivo: boolean,
  borrarArchivo: boolean,
  yaBorro?: OpcionesEliminar,
): string {
  if (yaBorro) return yaBorro.guardarCopia ? "reintentoConCopia" : "reintentoSinCopia";
  if (o.externa) return sinArchivo ? "externaSinArchivo" : borrarArchivo ? "externaConArchivo" : "externa";
  if (sinArchivo) return "internaSinArchivo";
  return esPrincipal(o) ? "principal" : "interna";
}

/** Qué aviso dar al terminar, dentro de `organizaciones.eliminar`: lo que solo salió de la lista no se dice eliminado. */
export function claveHecha(o: Organizacion, opciones: OpcionesEliminar, yaBorro?: OpcionesEliminar): string {
  if (o.externa && !opciones.borrarArchivo && !yaBorro) return "salio";
  return opciones.guardarCopia || yaBorro?.guardarCopia ? "hechaConCopia" : "hecha";
}

/**
 * El aviso si el diálogo ya no está, dentro de `organizaciones.eliminar`; null si basta el motivo. `boldo.db`, la última: Rust ya la
 * vació y abrió otra con su lugar en la lista, así que no hay nada que reintentar.
 */
export function claveFalloFuera(f: { pasoAOtra: boolean; sigueEnLaLista: boolean }): string | null {
  if (!f.pasoAOtra) return null;
  return f.sigueEnLaLista ? "falloYaEnOtra" : "falloSinVuelta";
}

/** Si conviene decir que se puede eliminar sin copia. Con un enlace no: lo que falla es borrarlo, no copiarlo. */
export const aconsejaSinCopia = (codigo: string, detalle: string): boolean =>
  codigo === "danado" || (codigo === "contenido_invalido" && detalle !== "enlace");
