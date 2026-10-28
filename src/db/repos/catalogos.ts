import type { Sentencia } from "@/db/cliente";
import { ahora, nuevoId } from "@/lib/ids";
import { TABLAS_CATALOGO, type TablaCatalogo } from "@/db/tipos";
import { actualizar, fijarBorrado } from "./comun";

// El nombre de tabla no puede ir como parámetro SQL: solo se interpola si está en la lista blanca.
function validar(tabla: TablaCatalogo): void {
  if (!TABLAS_CATALOGO.includes(tabla)) throw new Error("Catálogo desconocido");
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

export function renombrarValor(tabla: TablaCatalogo, id: string, nombre: string): Sentencia[] {
  validar(tabla);
  return actualizar(tabla, id, { nombre: nombre.trim() }, ["nombre"]);
}

export function moverValor(tabla: TablaCatalogo, id: string, orden: number): Sentencia[] {
  validar(tabla);
  return actualizar(tabla, id, { orden }, ["orden"]);
}

export function desactivarValor(tabla: TablaCatalogo, id: string): Sentencia[] {
  validar(tabla);
  return [fijarBorrado(tabla, id, true)];
}

export function reactivarValor(tabla: TablaCatalogo, id: string): Sentencia[] {
  validar(tabla);
  return [fijarBorrado(tabla, id, false)];
}
