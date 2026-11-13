import type { Unidad } from "@/db/tipos";
import { indiceHijos } from "./jerarquia";

/** Hasta aquí hay un botón por nivel; con más, «−», el nivel actual y «+». */
export const MAX_BOTONES_NIVEL = 6;

/**
 * Cuántos niveles tiene lo que se dibuja (la raíz es el nivel 1). Una unidad cuyo superior no está en `unidades` (rama
 * enfocada) cuenta como raíz. Con `colapsados`, cuenta solo los que se ven: no baja bajo una unidad plegada.
 */
export function profundidad(
  unidades: (Unidad & { deleted_at?: string | null })[],
  colapsados?: ReadonlySet<string>,
): number {
  const indice = indiceHijos(unidades);
  const ids = new Set(unidades.filter((u) => !u.deleted_at).map((u) => u.id));
  const raices = unidades.filter((u) => !u.deleted_at && (u.parent_id === null || !ids.has(u.parent_id)));
  let max = 0;
  const vistos = new Set<string>();
  let nivel = raices;
  while (nivel.length) {
    max++;
    const sig: Unidad[] = [];
    for (const u of nivel) {
      if (vistos.has(u.id)) continue;
      vistos.add(u.id);
      if (!colapsados?.has(u.id)) sig.push(...(indice.get(u.id) ?? []));
    }
    nivel = sig;
  }
  return max;
}
