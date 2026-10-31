import { dia, type Historico } from "./jerarquia";

export type TipoCambio =
  | "asumio"
  | "dejo"
  | "relevo"
  | "empezoReemplazo"
  | "terminoReemplazo"
  | "unidadCreada"
  | "unidadEliminada"
  | "puestoCreado"
  | "puestoEliminado";

/** Un cambio de un día, con los nombres ya resueltos (también de lo eliminado) para armar la frase. */
export interface Cambio {
  tipo: TipoCambio;
  unidadId: string;
  unidad: string;
  cargo?: string;
  persona?: string;
  /** En un relevo, quien dejó el puesto. */
  anterior?: string;
}

/**
 * Los cambios de cada día (AAAA-MM-DD local), en una pasada: asignaciones que empiezan (`desde`) o terminan (`hasta`),
 * unidades y puestos creados o eliminados. Un titular que sale y otro que entra el mismo día en el mismo puesto quedan
 * como un relevo. Una asignación eliminada (p. ej. al eliminar a la persona) se ve solo hasta el día antes de su baja,
 * como en `instantaneaEn`: ese día termina. El alta de un puesto que ya tenía a alguien antes (y la de su unidad) no cuenta:
 * el lienzo ya los mostraba, y `created_at` es solo el día en que se ingresaron.
 * Mover una unidad o renombrarla no se registra, así que no aparece.
 */
export function cambiosPorDia(h: Historico, cargos: { id: string; nombre: string }[]): Map<string, Cambio[]> {
  const res = new Map<string, Cambio[]>();
  const agregar = (d: string, c: Cambio) => {
    const lista = res.get(d);
    if (lista) lista.push(c);
    else res.set(d, [c]);
  };
  const unidades = new Map(h.unidades.map((u) => [u.id, u.nombre]));
  const personas = new Map(h.trabajadores.map((t) => [t.id, t.nombre]));
  const nombreCargo = new Map(cargos.map((c) => [c.id, c.nombre]));
  const puestos = new Map(
    h.puestos.map((p) => [
      p.id,
      {
        unidadId: p.unidad_id,
        unidad: unidades.get(p.unidad_id) ?? "",
        cargo: nombreCargo.get(p.cargo_id) ?? "",
      },
    ]),
  );

  // Se ve desde `desde` hasta el día antes de su fin: `hasta` o el día de su baja, lo que llegue antes.
  const finDe = (a: Historico["asignaciones"][number]) => {
    const baja = a.deleted_at ? dia(a.deleted_at) : null;
    return !baja ? a.hasta : !a.hasta || baja < a.hasta ? baja : a.hasta;
  };
  const seVio = (a: Historico["asignaciones"][number], fin: string | null) => !fin || fin > a.desde;
  // El lienzo muestra un puesto antes de su alta si tuvo a alguien (y con él su unidad): entonces su alta es solo el día
  // en que se ingresó, no un cambio. Primer `desde` de cada puesto, y los puestos y unidades que ya se veían antes.
  const primerDesde = new Map<string, string>();
  for (const a of h.asignaciones) {
    const d = primerDesde.get(a.puesto_id);
    if (seVio(a, finDe(a)) && (!d || a.desde < d)) primerDesde.set(a.puesto_id, a.desde);
  }
  const yaSeVeia = new Set<string>(); // ids de puestos y de unidades
  for (const p of h.puestos) {
    const d = primerDesde.get(p.id);
    if (p.created_at && d && d < dia(p.created_at)) yaSeVeia.add(p.id).add(p.unidad_id);
  }

  for (const u of h.unidades) {
    const base = { unidadId: u.id, unidad: u.nombre };
    if (u.created_at && !yaSeVeia.has(u.id)) agregar(dia(u.created_at), { tipo: "unidadCreada", ...base });
    if (u.deleted_at) agregar(dia(u.deleted_at), { tipo: "unidadEliminada", ...base });
  }
  for (const p of h.puestos) {
    const base = puestos.get(p.id)!;
    if (p.created_at && !yaSeVeia.has(p.id)) agregar(dia(p.created_at), { tipo: "puestoCreado", ...base });
    if (p.deleted_at) agregar(dia(p.deleted_at), { tipo: "puestoEliminado", ...base });
  }
  // Entradas y salidas de titulares por día y puesto, para juntarlas en un relevo al final.
  type Mov = { c: Cambio; persona: string };
  const titulares = new Map<string, { d: string; dejo: Mov[]; asumio: Mov[] }>();
  const titular = (d: string, puesto: string, lado: "dejo" | "asumio", m: Mov) => {
    const k = `${d}|${puesto}`;
    const t = titulares.get(k) ?? { d, dejo: [], asumio: [] };
    t[lado].push(m);
    titulares.set(k, t);
  };
  for (const a of h.asignaciones) {
    const p = puestos.get(a.puesto_id);
    const fin = finDe(a);
    if (!p || !seVio(a, fin)) continue;
    const base = { ...p, persona: personas.get(a.trabajador_id) ?? "" };
    if (a.tipo === "titular")
      titular(a.desde, a.puesto_id, "asumio", { c: { tipo: "asumio", ...base }, persona: a.trabajador_id });
    else agregar(a.desde, { tipo: "empezoReemplazo", ...base });
    if (fin && a.tipo === "titular")
      titular(fin, a.puesto_id, "dejo", { c: { tipo: "dejo", ...base }, persona: a.trabajador_id });
    else if (fin) agregar(fin, { tipo: "terminoReemplazo", ...base });
  }
  for (const { d, dejo, asumio } of titulares.values()) {
    const [sale, entra] = [dejo[0], asumio[0]];
    if (dejo.length === 1 && asumio.length === 1 && sale.persona !== entra.persona)
      agregar(d, { ...entra.c, tipo: "relevo", anterior: sale.c.persona });
    else [...dejo, ...asumio].forEach((m) => agregar(d, m.c));
  }
  return res;
}

/** Día con cambios más cercano antes (`-1`) o después (`1`) de `desde`, dentro de [min, max]; null si no hay. */
export function diaConCambios(
  dias: string[],
  desde: string,
  sentido: 1 | -1,
  min: string,
  max: string,
): string | null {
  let mejor: string | null = null;
  for (const d of dias) {
    if (d < min || d > max) continue;
    if (sentido === 1 ? d > desde && (!mejor || d < mejor) : d < desde && (!mejor || d > mejor)) mejor = d;
  }
  return mejor;
}
