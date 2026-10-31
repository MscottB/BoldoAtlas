import type { Asignacion, Puesto, Trabajador } from "@/db/tipos";
import type { Vigentes } from "@/features/arbol/jerarquia";
import { normalizarTexto } from "@/lib/texto";

/** Fecha más reciente primero; a igual fecha, la vigente (hasta = null) antes que la cerrada. */
const masReciente = (a: Asignacion, b: Asignacion) =>
  b.desde.localeCompare(a.desde) || Number(b.hasta === null) - Number(a.hasta === null);

export const historialPuesto = (asignaciones: Asignacion[], puestoId: string): Asignacion[] =>
  asignaciones.filter((a) => a.puesto_id === puestoId).sort(masReciente);

/** Personas cuyo nombre contiene `texto` (sin tildes ni mayúsculas), por nombre; `limite` evita pintar miles de filas. */
export function filtrarPersonas(trabajadores: Trabajador[], texto: string, limite = 50): Trabajador[] {
  const buscado = normalizarTexto(texto);
  return trabajadores
    .filter((w) => normalizarTexto(w.nombre).includes(buscado))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
    .slice(0, limite);
}

/** Se ofrece "Crear persona" si hay texto y no existe ya alguien con ese nombre. */
export const puedeCrearPersona = (trabajadores: Trabajador[], texto: string): boolean =>
  !!texto.trim() && !trabajadores.some((w) => normalizarTexto(w.nombre) === normalizarTexto(texto));

/** Reasignar al titular de hoy no cambia nada: no debe dejar una fila nueva en el historial. */
export const esTitularVigente = (vigentes: Vigentes, puestoId: string, trabajadorId: string): boolean =>
  vigentes.get(puestoId)?.titular?.trabajador_id === trabajadorId;

export interface FilaPersona {
  asignacion: Asignacion;
  puesto: Puesto;
}

/** Asignaciones de la persona en puestos vivos: las vigentes y las ya cerradas (historial). */
export function asignacionesDePersona(
  puestos: Puesto[],
  asignaciones: Asignacion[],
  trabajadorId: string,
): { vigentes: FilaPersona[]; cerradas: FilaPersona[] } {
  const porId = new Map(puestos.map((p) => [p.id, p]));
  const filas = asignaciones
    .filter((a) => a.trabajador_id === trabajadorId && porId.has(a.puesto_id))
    .sort(masReciente)
    .map((asignacion) => ({ asignacion, puesto: porId.get(asignacion.puesto_id)! }));
  return {
    vigentes: filas.filter((f) => f.asignacion.hasta === null),
    cerradas: filas.filter((f) => f.asignacion.hasta !== null),
  };
}

/** Descripción a guardar: `undefined` si no cambió (nada que escribir); `null` si quedó vacía. */
export function descripcionPorGuardar(guardada: string | null, escrita: string): string | null | undefined {
  const nueva = escrita.trim() || null;
  return nueva === guardada ? undefined : nueva;
}

/** Un puesto aún sin crear tiene cargo o descripción escritos que se perderían al cerrar. */
export const hayPuestoNuevoPendiente = (cargoId: string | null, descripcion: string): boolean =>
  !!cargoId || !!descripcion.trim();

const dos = (n: number) => String(n).padStart(2, "0");
/** AAAA-MM-DD del día local (no UTC: a la noche en Chile `toISOString` ya marcaría mañana). */
export const hoyISO = (d = new Date()): string =>
  `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;

/** AAAA-MM-DD → fecha corta en el idioma; se arma con partes locales para que la zona horaria no la corra. */
export function formatearFecha(iso: string, idioma: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  const fecha = new Date(2000, m - 1, d);
  fecha.setFullYear(a); // new Date(a, …) lleva los años 0–99 a 1900–1999
  return new Intl.DateTimeFormat(idioma, { dateStyle: "medium" }).format(fecha);
}

/** Primer día que se puede ver en el lienzo. */
export const FECHA_MINIMA = "1900-01-01";

/** Una fecha completa (AAAA-MM-DD) entre FECHA_MINIMA y hoy. Mientras se teclea el año, el campo da 0002-…, 0020-… */
export const fechaElegible = (v: string, hoy: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) && v >= FECHA_MINIMA && v <= hoy;

/** Quien recibe la asignación: una persona existente o el nombre de una por crear. */
export type EleccionPersona = { id: string } | { nombre: string };
