import type { Sentencia } from "@/db/cliente";
import { ahora, nuevoId } from "@/lib/ids";
import { actualizar, fijarBorrado } from "./comun";

export const SQL_ZONAS = "SELECT id, nombre, color FROM zonas WHERE deleted_at IS NULL ORDER BY nombre";

// Con unidad y zona vivas: un archivo importado puede traer una pertenencia viva de una zona eliminada.
export const SQL_ZONA_UNIDADES = `SELECT zona_id, unidad_id FROM zona_unidades
  WHERE deleted_at IS NULL
    AND unidad_id IN (SELECT id FROM unidades WHERE deleted_at IS NULL)
    AND zona_id IN (SELECT id FROM zonas WHERE deleted_at IS NULL)`;

export function crearZona(nombre: string, color: string): { id: string; sentencias: Sentencia[] } {
  const id = nuevoId();
  const t = ahora();
  return {
    id,
    sentencias: [
      {
        sql: "INSERT INTO zonas (id, nombre, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        params: [id, nombre.trim(), color, t, t],
      },
    ],
  };
}

export const editarZona = (id: string, cambios: { nombre?: string; color?: string }): Sentencia[] =>
  actualizar("zonas", id, { nombre: cambios.nombre?.trim(), color: cambios.color }, ["nombre", "color"]);

export function agregarAZona(zonaId: string, unidadId: string): Sentencia[] {
  const t = ahora();
  return [
    {
      sql: "INSERT INTO zona_unidades (id, zona_id, unidad_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      params: [nuevoId(), zonaId, unidadId, t, t],
    },
  ];
}

export function quitarDeZona(zonaId: string, unidadId: string): Sentencia[] {
  const t = ahora();
  return [
    {
      sql: `UPDATE zona_unidades SET deleted_at = ?, updated_at = ?
            WHERE zona_id = ? AND unidad_id = ? AND deleted_at IS NULL`,
      params: [t, t, zonaId, unidadId],
    },
  ];
}

// Las pertenencias caen con la marca de la fila de la que dependen: restaurar devuelve solo esas, no las quitadas antes.
type Origen = { tabla: "zonas"; columna: "zona_id" } | { tabla: "unidades"; columna: "unidad_id" };
const ZONA: Origen = { tabla: "zonas", columna: "zona_id" };
const UNIDAD: Origen = { tabla: "unidades", columna: "unidad_id" };

/** Va después de dar de baja la fila de origen. */
const caenCon = ({ tabla, columna }: Origen, id: string): Sentencia => ({
  sql: `UPDATE zona_unidades SET deleted_at = (SELECT deleted_at FROM ${tabla} WHERE id = ?), updated_at = ?
        WHERE ${columna} = ? AND deleted_at IS NULL`,
  params: [id, ahora(), id],
});

/** Va antes de restaurar la fila de origen. */
const vuelvenCon = ({ tabla, columna }: Origen, id: string): Sentencia => ({
  sql: `UPDATE zona_unidades SET deleted_at = NULL, updated_at = ?
        WHERE ${columna} = ? AND deleted_at = (SELECT deleted_at FROM ${tabla} WHERE id = ?)`,
  params: [ahora(), id, id],
});

export const bajaConUnidad = (unidadId: string) => caenCon(UNIDAD, unidadId);
export const vuelveConUnidad = (unidadId: string) => vuelvenCon(UNIDAD, unidadId);

export const eliminarZona = (id: string): Sentencia[] => [fijarBorrado("zonas", id, true), caenCon(ZONA, id)];
export const restaurarZona = (id: string): Sentencia[] => [vuelvenCon(ZONA, id), fijarBorrado("zonas", id, false)];
