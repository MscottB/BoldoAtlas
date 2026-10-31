import type { Sentencia } from "@/db/cliente";
import { ahora, nuevoId } from "@/lib/ids";
import { actualizar } from "./comun";

// Lee también las desactivadas: los puestos que las usan siguen resolviéndose. Renombrar, ordenar y desactivar: catalogos.ts.
export const SQL_LEYENDAS =
  "SELECT id, nombre, color, descripcion, orden, deleted_at FROM leyendas ORDER BY orden, nombre";

/** `#rrggbb` en minúsculas, o null si el texto no es un color válido (el esquema lo exige igual). */
export function normalizarColor(texto: string): string | null {
  const c = texto.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(c) ? c : null;
}

const limpiar = (texto: string | null | undefined) => texto?.trim() || null;

export function crearLeyenda(datos: { nombre: string; color: string; descripcion?: string | null }): {
  id: string;
  sentencias: Sentencia[];
} {
  const id = nuevoId();
  const t = ahora();
  return {
    id,
    sentencias: [
      {
        sql: `INSERT INTO leyendas (id, nombre, color, descripcion, orden, created_at, updated_at)
              VALUES (?, ?, ?, ?, (SELECT coalesce(max(orden), 0) + 1 FROM leyendas), ?, ?)`,
        params: [id, datos.nombre.trim(), datos.color.trim().toLowerCase(), limpiar(datos.descripcion), t, t],
      },
    ],
  };
}

export function editarLeyenda(
  id: string,
  cambios: { color?: string; descripcion?: string | null },
): Sentencia[] {
  return actualizar(
    "leyendas",
    id,
    {
      color: cambios.color?.trim().toLowerCase(),
      descripcion: cambios.descripcion === undefined ? undefined : limpiar(cambios.descripcion),
    },
    ["color", "descripcion"],
  );
}
