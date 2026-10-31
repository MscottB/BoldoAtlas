import type { Sentencia } from "@/db/cliente";
import { ahora, nuevoId } from "@/lib/ids";
import { fijarBorrado } from "./comun";

// Solo conexiones entre unidades vivas: si se restaura una unidad, sus conexiones vuelven con ella.
export const SQL_CONEXIONES = `SELECT id, origen_id, destino_id, etiqueta FROM conexiones
  WHERE deleted_at IS NULL
    AND origen_id IN (SELECT id FROM unidades WHERE deleted_at IS NULL)
    AND destino_id IN (SELECT id FROM unidades WHERE deleted_at IS NULL)`;

export function crearConexion(
  origen: string,
  destino: string,
  etiqueta: string | null,
): { id: string; sentencias: Sentencia[] } {
  const id = nuevoId();
  const t = ahora();
  return {
    id,
    sentencias: [
      {
        sql: "INSERT INTO conexiones (id, origen_id, destino_id, etiqueta, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        params: [id, origen, destino, etiqueta, t, t],
      },
    ],
  };
}

export const eliminarConexion = (id: string): Sentencia[] => [fijarBorrado("conexiones", id, true)];
