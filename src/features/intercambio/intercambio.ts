import { onMounted, onUnmounted, ref } from "vue";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { toast } from "vue-sonner";
import { intercambioCancelar, type ResumenImportacion, type ValorCampo } from "@/db/cliente";
import type { Unidad } from "@/db/tipos";
import { dondeDe, excesoDe, mensajeFallo, mensajeTope } from "@/features/respaldos/respaldos";
import { i18n } from "@/i18n";
import { tamano } from "@/lib/formato";
import { nuevoId } from "@/lib/ids";
import { conTrabajo, deLaAbierta, iniciarTrabajo } from "@/lib/trabajos";

export const RUTA_INTERCAMBIO = "/importar-exportar";

export type ModoImportar = "nueva" | "agregar" | "revisar" | "reemplazar";

/**
 * La opción que viene marcada: como organización nueva, también con un parcial. Con la lista protegida Rust no puede
 * agregar otra: lo que este archivo permite sobre la abierta.
 */
export const modoInicial = (r: ResumenImportacion, listaProtegida = false): ModoImportar =>
  !listaProtegida ? "nueva" : r.informe ? "agregar" : r.parcial ? "revisar" : "reemplazar";

/** La que se está creando desde un archivo. Sigue aunque se salga del panel, y al volver hay que decirlo. */
export const organizacionEnCreacion = ref<string | null>(null);

/** El archivo ya pasó la revisión al abrirlo: si su copia no se deja leer, no es que el archivo no sirva. */
export const mensajeComoNueva = (f: { codigo: string; mensaje: string }): string =>
  f.codigo === "contenido_invalido" ? i18n.global.t("intercambio.importar.nuevaNoSeCreo") : f.mensaje;

export type Intento<T> = { ok: true; valor: T } | { ok: false; codigo: string; mensaje: string };

const codigoDe = (e: unknown): string =>
  typeof e === "object" && e !== null && "codigo" in e ? String(e.codigo) : "fallo";

function mensajeDe(e: unknown): string {
  const { t, te } = i18n.global;
  const donde = dondeDe(e);
  if (donde) return mensajeTope(donde);
  const clave = `intercambio.error.${codigoDe(e)}`;
  if (!te(clave)) return mensajeFallo(e);
  return t(clave, { exceso: excesoDe(e) });
}

/** Lo mismo que el contrato del store: no lanza, y el fallo ya viene traducido. */
export async function intentar<T>(hacer: () => Promise<T>): Promise<Intento<T>> {
  try {
    return { ok: true, valor: await hacer() };
  } catch (e) {
    return { ok: false, codigo: codigoDe(e), mensaje: mensajeDe(e) };
  }
}

/**
 * `intentar` anotado como trabajo en curso: cerrar pregunta mientras dura y la bandeja avisa al terminar. Cancelar es una
 * decisión de quien está mirando, no un fallo: no trae la ventana al frente.
 */
export async function intentarTrabajo<T>(nombre: string, hacer: () => Promise<T>): Promise<Intento<T>> {
  const cancelado = Symbol();
  return intentar(async () => {
    const r = await conTrabajo(nombre, async () => {
      try {
        return await hacer();
      } catch (e) {
        if (codigoDe(e) === "cancelado") return cancelado;
        throw e;
      }
    });
    if (r === cancelado) throw { codigo: "cancelado", detalle: "" };
    return r as T;
  });
}

export interface Avance {
  trabajo?: string;
  etapa: string;
  hecho: number;
  total: number;
}

/** El avance que informa Rust mientras trabaja en otro hilo; solo el del trabajo actual. */
export function useAvance(trabajo: () => string | null) {
  const avance = ref<Avance | null>(null);
  let soltar: UnlistenFn | undefined;
  let desmontado = false;
  onMounted(async () => {
    const f = await listen<Avance>("intercambio-avance", (e) => {
      if (e.payload.trabajo === trabajo()) avance.value = e.payload;
    });
    if (desmontado) f();
    else soltar = f;
  });
  onUnmounted(() => {
    desmontado = true;
    soltar?.();
  });
  return avance;
}

/** Un trabajo del asistente: cancelarlo o reemplazarlo deja sin efecto lo que termine tarde. */
export function useTrabajo() {
  const actual = ref<string | null>(null);
  return {
    actual,
    nuevo: () => (actual.value = nuevoId()),
    /** Lo olvida aquí y en Rust, donde se borran sus temporales. */
    soltar: async () => {
      const t = actual.value;
      actual.value = null;
      if (t) await intercambioCancelar(t);
    },
  };
}

export interface FilaUnidad {
  unidad: Unidad;
  nivel: number;
  tieneHijos: boolean;
  /** Ya va porque se marcó una unidad superior. */
  cubierta: boolean;
}

/** Las filas que se ven de la lista de casillas: cada unidad sigue a su superior solo si este está abierto. */
export function filasVisibles(
  indice: Map<string | null, Unidad[]>,
  abiertas: ReadonlySet<string>,
  marcadas: ReadonlySet<string>,
): FilaUnidad[] {
  const filas: FilaUnidad[] = [];
  const pila: { unidad: Unidad; nivel: number; cubierta: boolean }[] = (indice.get(null) ?? [])
    .map((unidad) => ({ unidad, nivel: 0, cubierta: false }))
    .reverse();
  while (pila.length) {
    const { unidad, nivel, cubierta } = pila.pop()!;
    const hijos = indice.get(unidad.id) ?? [];
    filas.push({ unidad, nivel, cubierta, tieneHijos: hijos.length > 0 });
    if (!abiertas.has(unidad.id)) continue;
    const baja = cubierta || marcadas.has(unidad.id);
    for (let i = hijos.length - 1; i >= 0; i--)
      pila.push({ unidad: hijos[i]!, nivel: nivel + 1, cubierta: baja });
  }
  return filas;
}

/** El nombre de una columna para quien no sabe de bases de datos. */
export function nombreColumna(c: string): string {
  const { t, te } = i18n.global;
  return te(`intercambio.columnas.${c}`) ? t(`intercambio.columnas.${c}`) : t("intercambio.columnas.otra");
}

/** Un valor del detalle como se lee: una referencia ya viene por su nombre; una foto, por su tamaño. */
export function textoValor(columna: string, v: ValorCampo): string {
  const { t, te, locale } = i18n.global;
  if (v.oculto !== null && v.oculto !== undefined)
    return t("intercambio.revisar.valorOculto", { tamano: tamano(v.oculto, locale.value) });
  if (v.texto === null || v.texto === undefined) return t("intercambio.revisar.vacio");
  if (columna === "orden") return t("intercambio.revisar.posicion", { n: Number(v.texto) + 1 });
  const clave = `intercambio.valores.${columna}.${v.texto}`;
  return te(clave) ? t(clave) : v.texto;
}

/** Para mostrar una lista de filas sin los ceros. */
export const conFilas = <T extends { tabla: string }>(filas: T[], valor: (f: T) => number): T[] =>
  filas.filter((f) => valor(f) > 0);

/**
 * Un código que se dejó atrás sin copiar. No se retiene la navegación (las pestañas no la esperan): se sale, y un diálogo
 * global lo sigue mostrando hasta que se copie o se descarte a sabiendas. Vive solo en memoria.
 */
export const codigoSinCopiar = ref<string | null>(null);

/**
 * Una revisión con decisiones que se dejó atrás. Igual que el código: la navegación no se retiene, y un diálogo global
 * pregunta si se vuelve o se descarta. Las decisiones siguen en Rust, junto al trabajo, hasta que se elija.
 */
export interface RevisionDejada {
  trabajo: string;
  decisiones: number;
  lugares: Record<string, string | null>;
  /** Lo que se mostró del archivo antes de la revisión, para poder volver a las opciones. */
  importacion: ResumenImportacion;
  /** Se pidió volver: el panel de importar la retoma al montarse. */
  volviendo: boolean;
}
export const revisionDejada = ref<RevisionDejada | null>(null);

let terminarRevision: (() => void) | null = null;

/** Mientras haya decisiones sin aplicar, cerrar la app pregunta: se perderían. */
export function revisionConDecisiones(hay: boolean) {
  if (hay && !terminarRevision)
    terminarRevision = iniciarTrabajo(deLaAbierta(i18n.global.t("trabajos.revisionAbierta")));
  if (!hay && terminarRevision) {
    terminarRevision();
    terminarRevision = null;
  }
}

/** Copia el código y avisa. true si se pudo. */
export async function copiarCodigo(codigo: string): Promise<boolean> {
  const { t } = i18n.global;
  try {
    await navigator.clipboard.writeText(codigo);
    toast.success(t("intercambio.exportar.copiado"));
    return true;
  } catch {
    toast.error(t("intercambio.exportar.errorCopiar"));
    return false;
  }
}
