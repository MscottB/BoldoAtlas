import type { Sentencia } from "@/db/cliente";
import { ahora, nuevoId } from "@/lib/ids";
import type { Unidad } from "@/db/tipos";
import { actualizar, fijarBorrado } from "./comun";

export const SQL_UNIDADES =
  "SELECT id, tipo, nombre, descripcion, parent_id, jefe_id, orden FROM unidades WHERE deleted_at IS NULL ORDER BY orden, nombre";

type DatosUnidad = Pick<Unidad, "tipo" | "nombre"> & Partial<Pick<Unidad, "descripcion" | "parent_id" | "jefe_id" | "orden">>;

export function crearUnidad(datos: DatosUnidad): { id: string; sentencias: Sentencia[] } {
  const id = nuevoId();
  const t = ahora();
  return {
    id,
    sentencias: [
      {
        sql: `INSERT INTO unidades (id, tipo, nombre, descripcion, parent_id, jefe_id, orden, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          id,
          datos.tipo,
          datos.nombre,
          datos.descripcion ?? null,
          datos.parent_id ?? null,
          datos.jefe_id ?? null,
          datos.orden ?? 0,
          t,
          t,
        ],
      },
    ],
  };
}

export function editarUnidad(
  id: string,
  cambios: Partial<Pick<Unidad, "tipo" | "nombre" | "descripcion" | "orden">>,
): Sentencia[] {
  return actualizar("unidades", id, cambios, ["tipo", "nombre", "descripcion", "orden"]);
}

export function moverUnidad(id: string, nuevoPadre: string | null): Sentencia[] {
  return actualizar("unidades", id, { parent_id: nuevoPadre }, ["parent_id"]);
}

export function asignarJefe(id: string, jefeId: string | null): Sentencia[] {
  return actualizar("unidades", id, { jefe_id: jefeId }, ["jefe_id"]);
}

interface Contenido {
  hijos: string[];
  personas: string[];
}

/** Pasa hijos y personas a `destino` (un UPDATE por tabla; vacío no emite nada). */
function reubicar(destino: string | null, { hijos, personas }: Contenido): Sentencia[] {
  const t = ahora();
  const en = (ids: string[]) => ids.map(() => "?").join(", ");
  const s: Sentencia[] = [];
  if (hijos.length)
    s.push({
      sql: `UPDATE unidades SET parent_id = ?, updated_at = ? WHERE id IN (${en(hijos)})`,
      params: [destino, t, ...hijos],
    });
  if (personas.length)
    s.push({
      sql: `UPDATE trabajadores SET unidad_id = ?, updated_at = ? WHERE id IN (${en(personas)})`,
      params: [destino, t, ...personas],
    });
  return s;
}

export function eliminarUnidad(u: Unidad, contenido: Contenido): Sentencia[] {
  return [...reubicar(u.parent_id, contenido), fijarBorrado("unidades", u.id, true)];
}

export function restaurarUnidad(id: string, contenido: Contenido): Sentencia[] {
  return [fijarBorrado("unidades", id, false), ...reubicar(id, contenido)];
}
