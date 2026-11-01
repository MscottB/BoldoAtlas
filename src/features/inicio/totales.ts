import type { Asignacion, Puesto, Trabajador, Unidad } from "@/db/tipos";
import { dotacionPorUnidad } from "@/features/arbol/jerarquia";

export interface Totales {
  unidades: number;
  personas: number;
  vacantes: number;
}

/** Los totales de «Tu organización» en Inicio, en una sola pasada (O(unidades + puestos + asignaciones)). */
export function totalesInicio(e: {
  unidades: Unidad[];
  trabajadores: Trabajador[];
  puestos: Puesto[];
  asignaciones: Asignacion[];
}): Totales {
  const dotacion = dotacionPorUnidad(e.unidades, e.puestos, e.asignaciones);
  // la dotación de una raíz ya suma la de toda su rama
  const vacantes = e.unidades.reduce(
    (n, u) => n + (u.parent_id === null ? (dotacion.get(u.id)?.vacantes ?? 0) : 0),
    0,
  );
  return { unidades: dotacion.size, personas: e.trabajadores.length, vacantes };
}
