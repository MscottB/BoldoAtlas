import type { Sentencia } from "@/db/cliente";
import { ahora, nuevoId } from "@/lib/ids";
import type { Asignacion } from "@/db/tipos";
import { actualizar } from "./comun";

// Todo el historial, pero solo de puestos y personas vivos: si se restauran, sus asignaciones vuelven con ellos.
export const SQL_ASIGNACIONES = `SELECT id, puesto_id, trabajador_id, tipo, desde, hasta, motivo FROM asignaciones
  WHERE deleted_at IS NULL
    AND puesto_id IN (SELECT id FROM puestos WHERE deleted_at IS NULL)
    AND trabajador_id IN (SELECT id FROM trabajadores WHERE deleted_at IS NULL)
  ORDER BY desde, created_at`;

function insertar(
  puestoId: string,
  trabajadorId: string,
  tipo: Asignacion["tipo"],
  desde: string,
  hasta: string | null,
): { id: string; sentencia: Sentencia } {
  const id = nuevoId();
  const t = ahora();
  return {
    id,
    sentencia: {
      sql: `INSERT INTO asignaciones (id, puesto_id, trabajador_id, tipo, desde, hasta, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [id, puestoId, trabajadorId, tipo, desde, hasta, t, t],
    },
  };
}

/** Nuevo titular desde `desde`; la titular vigente se cierra ese mismo día y queda en el historial. */
export function asignarTitular(
  puestoId: string,
  trabajadorId: string,
  desde: string,
): { id: string; sentencias: Sentencia[] } {
  const { id, sentencia } = insertar(puestoId, trabajadorId, "titular", desde, null);
  const cerrar: Sentencia = {
    sql: `UPDATE asignaciones SET hasta = ?, updated_at = ?
          WHERE puesto_id = ? AND tipo = 'titular' AND hasta IS NULL AND deleted_at IS NULL`,
    params: [desde, ahora(), puestoId],
  };
  return { id, sentencias: [cerrar, sentencia] };
}

export function registrarReemplazo(
  puestoId: string,
  trabajadorId: string,
  desde: string,
  hasta: string | null = null,
): { id: string; sentencias: Sentencia[] } {
  const { id, sentencia } = insertar(puestoId, trabajadorId, "reemplazo", desde, hasta);
  return { id, sentencias: [sentencia] };
}

export function terminarAsignacion(id: string, hasta: string, motivo?: string | null): Sentencia[] {
  return actualizar("asignaciones", id, { hasta, motivo }, ["hasta", "motivo"]);
}
