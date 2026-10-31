import type { Sentencia } from "@/db/cliente";
import { ahora, nuevoId } from "@/lib/ids";
import { actualizar, fijarBorrado } from "./comun";

// Solo ramas de unidades vivas: si se restaura la unidad, su rama guardada vuelve con ella.
export const SQL_SUBARBOLES = `SELECT id, unidad_id, nombre, orden FROM subarboles_guardados
  WHERE deleted_at IS NULL AND unidad_id IN (SELECT id FROM unidades WHERE deleted_at IS NULL)
  ORDER BY orden`;

const aNombre = (nombre: string | null) => nombre?.trim() || null; // vacío = usa el nombre de la unidad

export function guardarSubarbol(
  unidadId: string,
  nombre: string | null = null,
): { id: string; sentencias: Sentencia[] } {
  const id = nuevoId();
  const t = ahora();
  return {
    id,
    sentencias: [
      {
        sql: `INSERT INTO subarboles_guardados (id, unidad_id, nombre, orden, created_at, updated_at)
              VALUES (?, ?, ?, (SELECT coalesce(max(orden), 0) + 1 FROM subarboles_guardados), ?, ?)`,
        params: [id, unidadId, aNombre(nombre), t, t],
      },
    ],
  };
}

export const renombrarSubarbol = (id: string, nombre: string | null): Sentencia[] =>
  actualizar("subarboles_guardados", id, { nombre: aNombre(nombre) }, ["nombre"]);

/** Si otro subárbol ya ocupa `orden`, toma el lugar que este deja (el orden no se repite). */
export const moverSubarbol = (id: string, orden: number): Sentencia[] => [
  {
    sql: `UPDATE subarboles_guardados SET orden = (SELECT orden FROM subarboles_guardados WHERE id = ?), updated_at = ?
          WHERE orden = ? AND id <> ? AND deleted_at IS NULL`,
    params: [id, ahora(), orden, id],
  },
  ...actualizar("subarboles_guardados", id, { orden }, ["orden"]),
];

export const quitarSubarbol = (id: string): Sentencia[] => [fijarBorrado("subarboles_guardados", id, true)];
