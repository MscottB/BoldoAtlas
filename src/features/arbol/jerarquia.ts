import type { Trabajador, Unidad } from "../../db/tipos";

// Las lecturas de repos no traen deleted_at; se acepta por si el llamador pasa filas crudas.
type ConBorrado<T> = T & { deleted_at?: string | null };
type U = ConBorrado<Unidad>;

export function indexar(unidades: Unidad[]): Map<string, Unidad> {
  return new Map(unidades.map((u) => [u.id, u]));
}

const porOrden = (a: Unidad, b: Unidad) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es");

export function hijos(unidades: U[], id: string): Unidad[] {
  return unidades.filter((u) => u.parent_id === id && !u.deleted_at).sort(porOrden);
}

/** Hijos de cada unidad (clave null = raíces) en una sola pasada; mismo filtro y orden que `hijos`. */
export function indiceHijos(unidades: U[]): Map<string | null, Unidad[]> {
  const indice = new Map<string | null, Unidad[]>();
  for (const u of unidades) {
    if (u.deleted_at) continue;
    const lista = indice.get(u.parent_id);
    if (lista) lista.push(u);
    else indice.set(u.parent_id, [u]);
  }
  for (const lista of indice.values()) lista.sort(porOrden);
  return indice;
}

export function ruta(unidades: Unidad[], id: string): Unidad[] {
  const indice = indexar(unidades);
  const camino: Unidad[] = [];
  const vistos = new Set<string>(); // corta si los datos ya traen un ciclo
  for (
    let u = indice.get(id);
    u && !vistos.has(u.id);
    u = u.parent_id ? indice.get(u.parent_id) : undefined
  ) {
    vistos.add(u.id);
    camino.unshift(u);
  }
  return camino;
}

export function rutaTexto(unidades: Unidad[], id: string): string {
  return ruta(unidades, id)
    .map((u) => u.nombre)
    .join(" › ");
}

export function descendientes(unidades: U[], id: string): Set<string> {
  const indice = indiceHijos(unidades);
  const resultado = new Set<string>();
  const pendientes = [id];
  while (pendientes.length) {
    for (const h of indice.get(pendientes.pop()!) ?? []) {
      if (!resultado.has(h.id)) {
        resultado.add(h.id);
        pendientes.push(h.id);
      }
    }
  }
  resultado.delete(id);
  return resultado;
}

export function creaCiclo(unidades: U[], id: string, nuevoPadre: string | null): boolean {
  return nuevoPadre !== null && (nuevoPadre === id || descendientes(unidades, id).has(nuevoPadre));
}

export function dotacion(
  unidades: U[],
  trabajadores: ConBorrado<Trabajador>[],
  id: string,
): { directa: number; total: number; vacantes: number } {
  const rama = descendientes(unidades, id).add(id);
  const vivos = trabajadores.filter((t) => !t.deleted_at);
  return {
    directa: vivos.filter((t) => t.estado === "activo" && t.unidad_id === id).length,
    total: vivos.filter((t) => t.estado === "activo" && rama.has(t.unidad_id)).length,
    vacantes: vivos.filter((t) => t.estado === "vacante" && rama.has(t.unidad_id)).length,
  };
}

// Gerencia y área no se guardan en el trabajador: se derivan del ancestro más cercano de cada tipo.
export function gerenciaYArea(
  unidades: Unidad[],
  unidadId: string,
): { gerencia: string | null; area: string | null; subarea: string | null } {
  const camino = ruta(unidades, unidadId).reverse();
  const nombreDe = (tipo: Unidad["tipo"]) => camino.find((u) => u.tipo === tipo)?.nombre ?? null;
  return { gerencia: nombreDe("gerencia"), area: nombreDe("area"), subarea: nombreDe("subarea") };
}
