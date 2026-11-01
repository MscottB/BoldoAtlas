import type { Asignacion, Puesto, Trabajador, Unidad, ValorCatalogo } from "@/db/tipos";
import { descendientes, type Vigentes } from "@/features/arbol/jerarquia";
import { asignacionesDePersona, type FilaPersona } from "@/features/puestos/puestos";
import { normalizarTexto } from "@/lib/texto";

/** Una asignación vigente (titular o reemplazo) en un puesto del alcance: una persona con dos puestos da dos filas. */
export interface FilaPersonaUnidad {
  /** Id de la asignación. */
  clave: string;
  personaId: string;
  nombre: string;
  correo: string | null;
  foto: string | null;
  puestoId: string;
  cargo: string;
  tipo: Asignacion["tipo"];
  unidadId: string;
  unidad: string;
}

/** Los puestos de la unidad o, con `rama`, de ella y todo lo que cuelga de ella. O(unidades + puestos). */
export function puestosDelAlcance(
  unidades: Unidad[],
  puestos: Puesto[],
  id: string,
  rama: boolean,
): Puesto[] {
  const alcance = rama ? descendientes(unidades, id).add(id) : new Set([id]);
  return puestos.filter((p) => alcance.has(p.unidad_id));
}

/** Titulares y reemplazos vigentes de esos puestos (los de `vigentes`: hoy o la fecha que se ve). */
export function personasDelAlcance(
  puestos: Puesto[],
  vigentes: Vigentes,
  trabajadores: Trabajador[],
  cargos: ValorCatalogo[],
  porId: Map<string, Unidad>,
): FilaPersonaUnidad[] {
  const persona = new Map(trabajadores.map((w) => [w.id, w]));
  const cargo = new Map(cargos.map((c) => [c.id, c.nombre]));
  const filas: FilaPersonaUnidad[] = [];
  for (const p of puestos) {
    const v = vigentes.get(p.id);
    for (const a of [v?.titular, v?.reemplazo]) {
      const w = a && persona.get(a.trabajador_id);
      if (!a || !w) continue;
      filas.push({
        clave: a.id,
        personaId: w.id,
        nombre: w.nombre,
        correo: w.correo,
        foto: w.foto_png,
        puestoId: p.id,
        cargo: cargo.get(p.cargo_id) ?? "",
        tipo: a.tipo,
        unidadId: p.unidad_id,
        unidad: porId.get(p.unidad_id)?.nombre ?? "",
      });
    }
  }
  return filas;
}

export type OrdenPersonas = "nombre" | "cargo" | "unidad";
export const collator = new Intl.Collator("es");

/** Filas cuyo nombre, cargo, unidad o correo contienen `texto` (sin tildes ni mayúsculas), ordenadas; empates por nombre. */
export function filtrarPersonasUnidad(
  filas: FilaPersonaUnidad[],
  texto: string,
  orden: OrdenPersonas,
): FilaPersonaUnidad[] {
  const buscado = normalizarTexto(texto);
  return filas
    .filter(
      (f) =>
        !buscado ||
        [f.nombre, f.cargo, f.unidad, f.correo].some((x) => !!x && normalizarTexto(x).includes(buscado)),
    )
    .sort((a, b) => collator.compare(a[orden], b[orden]) || collator.compare(a.nombre, b.nombre));
}

export interface ResumenCargo {
  cargoId: string;
  cargo: string;
  puestos: number;
  /** Puestos sin titular vigente. */
  vacantes: number;
  /** De las vacantes, las que cubre un reemplazo vigente. */
  cubiertas: number;
}

/** Por cargo (en orden alfabético): cuántos puestos hay en el alcance y cuántos están vacantes. */
export function resumenPorCargo(
  puestos: Puesto[],
  vigentes: Vigentes,
  cargos: ValorCatalogo[],
): ResumenCargo[] {
  const nombre = new Map(cargos.map((c) => [c.id, c.nombre]));
  const porCargo = new Map<string, ResumenCargo>();
  for (const p of puestos) {
    const r = porCargo.get(p.cargo_id) ?? {
      cargoId: p.cargo_id,
      cargo: nombre.get(p.cargo_id) ?? "",
      puestos: 0,
      vacantes: 0,
      cubiertas: 0,
    };
    const v = vigentes.get(p.id);
    r.puestos++;
    if (!v?.titular) r.vacantes++;
    if (!v?.titular && v?.reemplazo) r.cubiertas++;
    porCargo.set(p.cargo_id, r);
  }
  return [...porCargo.values()].sort((a, b) => collator.compare(a.cargo, b.cargo));
}

/** Correos distintos y no vacíos, en el orden de las filas (sin distinguir mayúsculas). */
export function correosUnicos(filas: FilaPersonaUnidad[]): string[] {
  const vistos = new Map<string, string>();
  for (const f of filas) {
    const c = f.correo?.trim();
    if (c && !vistos.has(c.toLowerCase())) vistos.set(c.toLowerCase(), c);
  }
  return [...vistos.values()];
}

/**
 * Puestos de la persona para la vista previa: los vigentes y el historial, de hoy o, con `fecha`, de ese día
 * (lo que empezó después no se ve; lo que terminó después de la fecha cuenta como vigente).
 */
export function puestosDePersona(
  puestos: Puesto[],
  asignaciones: Asignacion[],
  personaId: string,
  fecha?: string,
): { vigentes: FilaPersona[]; cerradas: FilaPersona[] } {
  const r = asignacionesDePersona(puestos, asignaciones, personaId);
  if (!fecha) return r;
  const filas = [...r.vigentes, ...r.cerradas].filter((f) => f.asignacion.desde <= fecha);
  const vigente = (f: FilaPersona) => f.asignacion.hasta === null || f.asignacion.hasta > fecha;
  return { vigentes: filas.filter(vigente), cerradas: filas.filter((f) => !vigente(f)) };
}
