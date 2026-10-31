import type { Sentencia } from "@/db/cliente";
import { ahora, nuevoId } from "@/lib/ids";

export const SQL_ETIQUETAS =
  "SELECT id, nombre, color FROM etiquetas WHERE deleted_at IS NULL ORDER BY nombre";

// Solo asignaciones a unidades vivas: si se restaura la unidad, vuelven con ella.
export const SQL_UNIDAD_ETIQUETAS = `SELECT unidad_id, etiqueta_id FROM unidad_etiquetas
  WHERE deleted_at IS NULL AND unidad_id IN (SELECT id FROM unidades WHERE deleted_at IS NULL)`;

export function crearEtiqueta(nombre: string, color: string): { id: string; sentencias: Sentencia[] } {
  const id = nuevoId();
  const t = ahora();
  return {
    id,
    sentencias: [
      {
        sql: "INSERT INTO etiquetas (id, nombre, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        params: [id, nombre.trim(), color, t, t],
      },
    ],
  };
}

export function etiquetarUnidad(unidadId: string, etiquetaId: string): Sentencia[] {
  const t = ahora();
  return [
    {
      sql: "INSERT INTO unidad_etiquetas (id, unidad_id, etiqueta_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      params: [nuevoId(), unidadId, etiquetaId, t, t],
    },
  ];
}

export function quitarEtiqueta(unidadId: string, etiquetaId: string): Sentencia[] {
  const t = ahora();
  return [
    {
      sql: `UPDATE unidad_etiquetas SET deleted_at = ?, updated_at = ?
            WHERE unidad_id = ? AND etiqueta_id = ? AND deleted_at IS NULL`,
      params: [t, t, unidadId, etiquetaId],
    },
  ];
}
