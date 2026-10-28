import type { Sentencia } from "@/db/cliente";
import { ahora } from "@/lib/ids";

/** UPDATE parcial de una tabla de negocio. `tabla` y las columnas salen de código, nunca del usuario. */
export function actualizar(
  tabla: string,
  id: string,
  cambios: Record<string, unknown>,
  permitidas: readonly string[],
): Sentencia[] {
  const cols = Object.entries(cambios).filter(([, v]) => v !== undefined);
  const ajena = cols.find(([c]) => !permitidas.includes(c));
  if (ajena) throw new Error(`Columna no editable: ${ajena[0]}`);
  const sets = [...cols.map(([c]) => `${c} = ?`), "updated_at = ?"].join(", ");
  return [{ sql: `UPDATE ${tabla} SET ${sets} WHERE id = ?`, params: [...cols.map(([, v]) => v), ahora(), id] }];
}

/** Borrado lógico (borrado = true) o su reversión. */
export function fijarBorrado(tabla: string, id: string, borrado: boolean): Sentencia {
  const t = ahora();
  return { sql: `UPDATE ${tabla} SET deleted_at = ?, updated_at = ? WHERE id = ?`, params: [borrado ? t : null, t, id] };
}
