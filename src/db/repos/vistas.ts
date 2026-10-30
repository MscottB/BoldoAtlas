import type { Sentencia } from "@/db/cliente";
import { ahora, nuevoId } from "@/lib/ids";
import { actualizar, fijarBorrado } from "./comun";

// Solo las del árbol completo y las de subárboles guardados vivos (de unidades vivas): si se vuelve a guardar la rama, es otro árbol.
export const SQL_VISTAS = `SELECT id, arbol_id, nombre, config FROM vistas
  WHERE deleted_at IS NULL AND (arbol_id IS NULL OR arbol_id IN (
    SELECT id FROM subarboles_guardados
    WHERE deleted_at IS NULL AND unidad_id IN (SELECT id FROM unidades WHERE deleted_at IS NULL)))
  ORDER BY lower(nombre), created_at`;

/** `arbolId` null = árbol completo. `config` se guarda como JSON; se valida al leer, no aquí. */
export function guardarVista(
  arbolId: string | null,
  nombre: string,
  config: unknown,
): { id: string; sentencias: Sentencia[] } {
  const id = nuevoId();
  const t = ahora();
  return {
    id,
    sentencias: [
      {
        sql: "INSERT INTO vistas (id, arbol_id, nombre, config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        params: [id, arbolId, nombre.trim(), JSON.stringify(config), t, t],
      },
    ],
  };
}

export const renombrarVista = (id: string, nombre: string): Sentencia[] =>
  actualizar("vistas", id, { nombre: nombre.trim() }, ["nombre"]);

export const eliminarVista = (id: string): Sentencia[] => [fijarBorrado("vistas", id, true)];
export const restaurarVista = (id: string): Sentencia[] => [fijarBorrado("vistas", id, false)];
