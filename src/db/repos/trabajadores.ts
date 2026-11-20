import type { Sentencia } from "@/db/cliente";
import { ahora, nuevoId } from "@/lib/ids";
import type { Trabajador } from "@/db/tipos";
import { actualizar, fijarBorrado } from "./comun";

/** Correo vacío o solo espacios es NULL; las mayúsculas se conservan (la unicidad la impone el índice). */
export function normalizarCorreo(c: string | null): string | null {
  return c?.trim() || null;
}

export const SQL_TRABAJADORES = `SELECT id, nombre, correo, telefono, tipo_contrato_id, sede_id, jornada_id, updated_at
  FROM trabajadores WHERE deleted_at IS NULL ORDER BY nombre`;

/** Las notas de una persona: se piden al abrir su ficha. */
export const SQL_NOTAS = "SELECT notas FROM trabajadores WHERE id = ?";
/** Las de todas, para la exportación completa a Excel si se marca su columna (también de quien se ve en una fecha). */
export const SQL_NOTAS_EXCEL = "SELECT id, notas FROM trabajadores WHERE notas <> ''";

/** Todo el historial de una persona (también lo terminado y lo de puestos o unidades ya eliminados), para exportar sus datos. */
export const SQL_ASIGNACIONES_PERSONA = `SELECT u.nombre AS unidad, c.nombre AS cargo, a.tipo, a.desde, a.hasta, a.motivo
  FROM asignaciones a JOIN puestos p ON p.id = a.puesto_id
  LEFT JOIN unidades u ON u.id = p.unidad_id LEFT JOIN cargos c ON c.id = p.cargo_id
  WHERE a.trabajador_id = ? AND a.deleted_at IS NULL ORDER BY a.desde, a.created_at`;

/** Lo que la ficha escribe. Las notas no vienen en la lista: `undefined` significa «no se toca». */
export type CamposTrabajador = Pick<
  Trabajador,
  "nombre" | "correo" | "telefono" | "tipo_contrato_id" | "sede_id" | "jornada_id"
> & { notas?: string | null };

type DatosTrabajador = Pick<Trabajador, "nombre"> & Partial<Omit<CamposTrabajador, "nombre">>;

export function crearTrabajador(datos: DatosTrabajador): { id: string; sentencias: Sentencia[] } {
  const id = nuevoId();
  const t = ahora();
  return {
    id,
    sentencias: [
      {
        sql: `INSERT INTO trabajadores (id, nombre, correo, telefono, tipo_contrato_id, sede_id, jornada_id,
                notas, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          id,
          datos.nombre,
          normalizarCorreo(datos.correo ?? null),
          datos.telefono ?? null,
          datos.tipo_contrato_id ?? null,
          datos.sede_id ?? null,
          datos.jornada_id ?? null,
          datos.notas ?? null,
          t,
          t,
        ],
      },
    ],
  };
}

const EDITABLES = ["nombre", "correo", "telefono", "tipo_contrato_id", "sede_id", "jornada_id", "notas"];

export function editarTrabajador(id: string, cambios: Partial<CamposTrabajador>): Sentencia[] {
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
