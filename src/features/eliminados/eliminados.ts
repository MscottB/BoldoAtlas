export type TipoEliminado = "persona" | "unidad" | "puesto";

/** Fila de las consultas de `db/repos/eliminados`; `padre_*` es la unidad del puesto o el superior de la unidad. */
export interface FilaEliminado {
  id: string;
  nombre: string;
  fecha: string;
  padre_nombre: string | null;
  padre_eliminado: number;
}

export interface Eliminado {
  tipo: TipoEliminado;
  id: string;
  nombre: string;
  fecha: string;
  /** Nombre de la unidad eliminada que impide restaurarlo; null si se puede. */
  bloqueo: string | null;
}

/** De lo más reciente a lo más antiguo, sin las personas suprimidas (su fila sigue, vacía, pero no se ofrece). */
export function armarEliminados(
  filas: Record<TipoEliminado, FilaEliminado[]>,
  suprimidas: Set<string>,
): Eliminado[] {
  const todo: Eliminado[] = [];
  for (const tipo of ["persona", "unidad", "puesto"] as const)
    for (const f of filas[tipo]) {
      if (tipo === "persona" && suprimidas.has(f.id)) continue;
      const { id, nombre, fecha } = f;
      todo.push({ tipo, id, nombre, fecha, bloqueo: f.padre_eliminado ? f.padre_nombre : null });
    }
  return todo.sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/** Los ids de `meta.suprimidas` (JSON `[{ id, fecha }]`); un valor vacío o dañado es «ninguna». */
export function leerSuprimidas(meta: Record<string, string>): Set<string> {
  try {
    const l: unknown = JSON.parse(meta.suprimidas || "[]");
    return new Set(Array.isArray(l) ? l.map((x: { id?: unknown }) => String(x?.id)) : []);
  } catch {
    return new Set();
  }
}
