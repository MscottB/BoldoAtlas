import { onMounted, onUnmounted, ref } from "vue";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { intercambioCancelar } from "@/db/cliente";
import type { Unidad } from "@/db/tipos";
import { mensajeFallo } from "@/features/respaldos/respaldos";
import { i18n } from "@/i18n";
import { nuevoId } from "@/lib/ids";

export const RUTA_INTERCAMBIO = "/importar-exportar";

export type Intento<T> = { ok: true; valor: T } | { ok: false; codigo: string; mensaje: string };

const codigoDe = (e: unknown): string =>
  typeof e === "object" && e !== null && "codigo" in e ? String(e.codigo) : "fallo";

/** Lo mismo que el contrato del store: no lanza, y el fallo ya viene traducido. */
export async function intentar<T>(hacer: () => Promise<T>): Promise<Intento<T>> {
  try {
    return { ok: true, valor: await hacer() };
  } catch (e) {
    const { t, te } = i18n.global;
    const codigo = codigoDe(e);
    const clave = `intercambio.error.${codigo}`;
    return { ok: false, codigo, mensaje: te(clave) ? t(clave) : mensajeFallo(e) };
  }
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
