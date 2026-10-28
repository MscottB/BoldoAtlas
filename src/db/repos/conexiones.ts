import type { Sentencia } from "@/db/cliente";
import { ahora, nuevoId } from "@/lib/ids";
import { fijarBorrado } from "./comun";

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
