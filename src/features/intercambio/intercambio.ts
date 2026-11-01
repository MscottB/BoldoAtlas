import { onMounted, onUnmounted, ref } from "vue";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { toast } from "vue-sonner";
import { intercambioCancelar } from "@/db/cliente";
import type { Unidad } from "@/db/tipos";
import { mensajeFallo } from "@/features/respaldos/respaldos";
import { i18n } from "@/i18n";
import { nuevoId } from "@/lib/ids";
import { conTrabajo } from "@/lib/trabajos";

export const RUTA_INTERCAMBIO = "/importar-exportar";

export type Intento<T> = { ok: true; valor: T } | { ok: false; codigo: string; mensaje: string };

interface Donde {
  tabla: string;
  columna: string;
  nombre: string | null;
}

const codigoDe = (e: unknown): string =>
  typeof e === "object" && e !== null && "codigo" in e ? String(e.codigo) : "fallo";

/** Dónde está lo que se pasó de un tope, con etiquetas legibles. Una tabla o columna desconocida no se muestra tal cual. */
function mensajeTope(d: Donde): string {
  const { t, te } = i18n.global;
  const tabla = `intercambio.tablas.${d.tabla}`;
  const columna = `intercambio.columnas.${d.columna}`;
  const datos = {
    tabla: te(tabla) ? t(tabla) : t("intercambio.columnas.otra"),
    columna: te(columna) ? t(columna) : t("intercambio.columnas.otra"),
    nombre: d.nombre ?? "",
  };
  return t(d.nombre ? "intercambio.error.muy_pesado_fila" : "intercambio.error.muy_pesado", datos);
}

function mensajeDe(e: unknown): string {
  const { t, te } = i18n.global;
  const donde = typeof e === "object" && e !== null && "donde" in e ? (e.donde as Donde | null) : null;
  if (donde) return mensajeTope(donde);
  const clave = `intercambio.error.${codigoDe(e)}`;
  return te(clave) ? t(clave) : mensajeFallo(e);
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

/** Para mostrar una lista de filas sin los ceros. */
export const conFilas = <T extends { tabla: string }>(filas: T[], valor: (f: T) => number): T[] =>
  filas.filter((f) => valor(f) > 0);

/**
 * Un código que se dejó atrás sin copiar. No se retiene la navegación (las pestañas no la esperan): se sale, y un diálogo
 * global lo sigue mostrando hasta que se copie o se descarte a sabiendas. Vive solo en memoria.
 */
export const codigoSinCopiar = ref<string | null>(null);

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
