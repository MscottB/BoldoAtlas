import type { Sentencia } from "@/db/cliente";
import { ahora, nuevoId } from "@/lib/ids";
import { TABLAS_CATALOGO, type TablaCatalogo } from "@/db/tipos";
import { actualizar, fijarBorrado } from "./comun";

/** Tablas con nombre y orden cuyas filas se renombran, reordenan y desactivan igual que un mantenedor. */
export type TablaOrdenable = TablaCatalogo | "leyendas";
const TABLAS: readonly TablaOrdenable[] = [...TABLAS_CATALOGO, "leyendas"];

// El nombre de tabla no puede ir como parámetro SQL: solo se interpola si está en la lista blanca.
function validar(tabla: TablaOrdenable): void {
  if (!TABLAS.includes(tabla)) throw new Error("Catálogo desconocido");
}

/** Lectura de un mantenedor: incluye los desactivados (deleted_at) para que las fichas que los usan sigan resolviéndose. */
export function sqlValores(tabla: TablaCatalogo): string {
  validar(tabla);
  return `SELECT id, nombre, orden, deleted_at FROM ${tabla} ORDER BY orden, nombre`;
}

export function crearValor(tabla: TablaCatalogo, nombre: string): { id: string; sentencias: Sentencia[] } {
  validar(tabla);
  const id = nuevoId();
  const t = ahora();
  return {
    id,
    sentencias: [
      {
        sql: `INSERT INTO ${tabla} (id, nombre, orden, created_at, updated_at)
              VALUES (?, ?, (SELECT coalesce(max(orden), 0) + 1 FROM ${tabla}), ?, ?)`,
        params: [id, nombre.trim(), t, t],
      },
    ],
  };
}

export function renombrarValor(tabla: TablaOrdenable, id: string, nombre: string): Sentencia[] {
  validar(tabla);
  return actualizar(tabla, id, { nombre: nombre.trim() }, ["nombre"]);
}

export function moverValor(tabla: TablaOrdenable, id: string, orden: number): Sentencia[] {
  validar(tabla);
  return actualizar(tabla, id, { orden }, ["orden"]);
}

export function desactivarValor(tabla: TablaOrdenable, id: string): Sentencia[] {
  validar(tabla);
  return [fijarBorrado(tabla, id, true)];
}

export function reactivarValor(tabla: TablaOrdenable, id: string): Sentencia[] {
  validar(tabla);
  return [fijarBorrado(tabla, id, false)];
}
