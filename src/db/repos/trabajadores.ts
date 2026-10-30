import type { Sentencia } from "@/db/cliente";
import { ahora, nuevoId } from "@/lib/ids";
import type { Trabajador } from "@/db/tipos";
import { actualizar, fijarBorrado } from "./comun";

/** Correo vacío o solo espacios es NULL; las mayúsculas se conservan (la unicidad la impone el índice). */
export function normalizarCorreo(c: string | null): string | null {
  return c?.trim() || null;
}

export const SQL_TRABAJADORES = `SELECT id, nombre, correo, telefono, tipo_contrato_id, sede_id, jornada_id,
  foto_png, notas FROM trabajadores WHERE deleted_at IS NULL ORDER BY nombre`;

type DatosTrabajador = Pick<Trabajador, "nombre"> & Partial<Omit<Trabajador, "id" | "nombre">>;

export function crearTrabajador(datos: DatosTrabajador): { id: string; sentencias: Sentencia[] } {
  const id = nuevoId();
  const t = ahora();
  return {
    id,
    sentencias: [
      {
        sql: `INSERT INTO trabajadores (id, nombre, correo, telefono, tipo_contrato_id, sede_id, jornada_id,
                foto_png, notas, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          id,
          datos.nombre,
          normalizarCorreo(datos.correo ?? null),
          datos.telefono ?? null,
          datos.tipo_contrato_id ?? null,
          datos.sede_id ?? null,
          datos.jornada_id ?? null,
          datos.foto_png ?? null,
          datos.notas ?? null,
          t,
          t,
        ],
      },
    ],
  };
}

const EDITABLES = [
  "nombre",
  "correo",
  "telefono",
  "tipo_contrato_id",
  "sede_id",
  "jornada_id",
  "foto_png",
  "notas",
];

export function editarTrabajador(id: string, cambios: Partial<Omit<Trabajador, "id">>): Sentencia[] {
  const c = cambios.correo === undefined ? cambios : { ...cambios, correo: normalizarCorreo(cambios.correo) };
  return actualizar("trabajadores", id, c, EDITABLES);
}

/** Borra la persona y, con la misma marca, sus asignaciones: así no quedan vigentes ocultas que bloqueen el puesto. */
export function eliminarTrabajador(id: string): Sentencia[] {
  const t = ahora();
  return [
    { sql: "UPDATE trabajadores SET deleted_at = ?, updated_at = ? WHERE id = ?", params: [t, t, id] },
    {
      sql: "UPDATE asignaciones SET deleted_at = ?, updated_at = ? WHERE trabajador_id = ? AND deleted_at IS NULL",
      params: [t, t, id],
    },
  ];
}

/** Devuelve la persona y solo las asignaciones borradas con ella (las borradas antes por su cuenta siguen borradas). */
export function restaurarTrabajador(id: string): Sentencia[] {
  return [
    {
      sql: `UPDATE asignaciones SET deleted_at = NULL, updated_at = ?
            WHERE trabajador_id = ? AND deleted_at = (SELECT deleted_at FROM trabajadores WHERE id = ?)`,
      params: [ahora(), id, id],
    },
    fijarBorrado("trabajadores", id, false),
  ];
}
