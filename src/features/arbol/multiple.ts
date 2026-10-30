import type { Puesto, Unidad } from "@/db/tipos";
import { indexar, indiceHijos } from "./jerarquia";

type ConBorrado<T> = T & { deleted_at?: string | null };

/** De las `ids`, las que no cuelgan de otra seleccionada: mover o duplicar una arrastra su rama. Conserva el orden dado. */
export function soloCimas(unidades: Unidad[], ids: Iterable<string>): string[] {
  const elegidas = new Set(ids);
  const porId = indexar(unidades);
  return [...elegidas].filter((id) => {
    for (let p = porId.get(id)?.parent_id; p; p = porId.get(p)?.parent_id) if (elegidas.has(p)) return false;
    return true;
  });
}

export interface Seleccion {
  ids: Set<string>;
  /** La última tocada: desde ella siguen las flechas. null = no queda ninguna. */
  foco: string | null;
}

/** Ctrl+clic (`alternar`): la unidad entra o sale. Shift+clic: solo entra. */
export function sumar(actuales: ReadonlySet<string>, id: string, alternar: boolean): Seleccion {
  const ids = new Set(actuales);
  if (alternar && ids.delete(id)) return { ids, foco: [...ids].pop() ?? null };
  ids.add(id);
  return { ids, foco: id };
}

export interface Baja {
  id: string;
  /** Superior al que pasa su contenido; null solo si no tiene contenido. */
  destino: string | null;
  contenido: { hijos: string[]; puestos: string[] };
}

/**
 * Qué pasa al eliminar `ids` de una vez. El contenido de cada una (subunidades que no se eliminan y puestos) pasa a su
 * superior más cercano que no se elimina. Una con contenido y sin ese superior (una raíz) se omite, y con ella las
 * que ya no tendrían a dónde ir. Las unidades que no existen se ignoran.
 */
export function planEliminar(
  unidades: ConBorrado<Unidad>[],
  puestos: ConBorrado<Puesto>[],
  ids: string[],
): { bajas: Baja[]; omitidas: string[] } {
  const porId = indexar(unidades.filter((x) => !x.deleted_at));
  const indice = indiceHijos(unidades);
  const quedan = ids.filter((id) => porId.has(id));
  const borrar = new Set(quedan);
  const destinoDe = (u: Unidad) => {
    let p = u.parent_id;
    while (p && borrar.has(p)) p = porId.get(p)?.parent_id ?? null;
    return p;
  };
  const contenidoDe = (id: string) => ({
    hijos: (indice.get(id) ?? []).filter((h) => !borrar.has(h.id)).map((h) => h.id),
    puestos: puestos.filter((x) => x.unidad_id === id && !x.deleted_at).map((x) => x.id),
  });
  const omitidas: string[] = [];
  for (let cambio = true; cambio;) {
    cambio = false;
    for (const id of borrar) {
      const c = contenidoDe(id);
      if (destinoDe(porId.get(id)!) === null && (c.hijos.length || c.puestos.length)) {
        borrar.delete(id);
        omitidas.push(id);
        cambio = true;
      }
    }
  }
  return {
    bajas: quedan
      .filter((id) => borrar.has(id))
      .map((id) => ({ id, destino: destinoDe(porId.get(id)!), contenido: contenidoDe(id) })),
    omitidas,
  };
}
