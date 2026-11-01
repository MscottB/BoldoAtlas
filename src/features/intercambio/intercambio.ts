import { onMounted, onUnmounted, ref } from "vue";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Unidad } from "@/db/tipos";
import { mensajeFallo } from "@/features/respaldos/respaldos";
import { i18n } from "@/i18n";

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
  etapa: string;
  hecho: number;
  total: number;
}

/** El avance que informa Rust mientras trabaja en otro hilo. */
export function useAvance() {
  const avance = ref<Avance | null>(null);
  let soltar: UnlistenFn | undefined;
  onMounted(async () => {
    soltar = await listen<Avance>("intercambio-avance", (e) => (avance.value = e.payload));
  });
  onUnmounted(() => soltar?.());
  return avance;
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
