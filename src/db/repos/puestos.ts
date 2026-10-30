import type { Sentencia } from "@/db/cliente";
import { ahora, nuevoId } from "@/lib/ids";
import type { Puesto } from "@/db/tipos";
import { actualizar, fijarBorrado } from "./comun";

export const SQL_PUESTOS =
  "SELECT id, unidad_id, cargo_id, descripcion, leyenda_id, orden, created_at FROM puestos WHERE deleted_at IS NULL ORDER BY orden";

type DatosPuesto = Pick<Puesto, "unidad_id" | "cargo_id"> &
  Partial<Pick<Puesto, "descripcion" | "leyenda_id" | "orden">>;

export function crearPuesto(datos: DatosPuesto): { id: string; sentencias: Sentencia[] } {
  const id = nuevoId();
  const t = ahora();
  return {
    id,
    sentencias: [
      {
        sql: `INSERT INTO puestos (id, unidad_id, cargo_id, descripcion, leyenda_id, orden, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          id,
          datos.unidad_id,
          datos.cargo_id,
          datos.descripcion ?? null,
          datos.leyenda_id ?? null,
          datos.orden ?? 0,
          t,
          t,
        ],
      },
    ],
  };
}

export function editarPuesto(id: string, cambios: Partial<Omit<Puesto, "id">>): Sentencia[] {
  return actualizar("puestos", id, cambios, ["unidad_id", "cargo_id", "descripcion", "leyenda_id", "orden"]);
}

export const eliminarPuesto = (id: string): Sentencia[] => [fijarBorrado("puestos", id, true)];

export const restaurarPuesto = (id: string): Sentencia[] => [fijarBorrado("puestos", id, false)];
