import type { Asignacion, Puesto, Unidad, ValorCatalogo } from "../../db/tipos";

// Las lecturas de repos no traen deleted_at; se acepta por si el llamador pasa filas crudas.
type ConBorrado<T> = T & { deleted_at?: string | null };
type U = ConBorrado<Unidad>;

export function indexar(unidades: Unidad[]): Map<string, Unidad> {
  return new Map(unidades.map((u) => [u.id, u]));
}

type Ordenable = { orden: number; nombre: string };
const porOrden = (a: Ordenable, b: Ordenable) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es");

export function hijos(unidades: U[], id: string): Unidad[] {
  return unidades.filter((u) => u.parent_id === id && !u.deleted_at).sort(porOrden);
}

/** Hijos de cada unidad (clave null = raíces) en una sola pasada; mismo filtro y orden que `hijos`. */
export function indiceHijos(unidades: U[]): Map<string | null, Unidad[]> {
  const indice = new Map<string | null, Unidad[]>();
  for (const u of unidades) {
    if (u.deleted_at) continue;
    const lista = indice.get(u.parent_id);
    if (lista) lista.push(u);
    else indice.set(u.parent_id, [u]);
  }
  for (const lista of indice.values()) lista.sort(porOrden);
  return indice;
}

export function ruta(unidades: Unidad[], id: string): Unidad[] {
  const indice = indexar(unidades);
  const camino: Unidad[] = [];
  const vistos = new Set<string>(); // corta si los datos ya traen un ciclo
  for (
    let u = indice.get(id);
    u && !vistos.has(u.id);
    u = u.parent_id ? indice.get(u.parent_id) : undefined
  ) {
    vistos.add(u.id);
    camino.unshift(u);
  }
  return camino;
}

export function rutaTexto(unidades: Unidad[], id: string): string {
  return ruta(unidades, id)
    .map((u) => u.nombre)
    .join(" › ");
}

export function descendientes(unidades: U[], id: string): Set<string> {
  const indice = indiceHijos(unidades);
  const resultado = new Set<string>();
  const pendientes = [id];
  while (pendientes.length) {
    for (const h of indice.get(pendientes.pop()!) ?? []) {
      if (!resultado.has(h.id)) {
        resultado.add(h.id);
        pendientes.push(h.id);
      }
    }
  }
  resultado.delete(id);
  return resultado;
}

export function creaCiclo(unidades: U[], id: string, nuevoPadre: string | null): boolean {
  return nuevoPadre !== null && (nuevoPadre === id || descendientes(unidades, id).has(nuevoPadre));
}

export type Vigentes = Map<string, { titular?: Asignacion; reemplazo?: Asignacion }>;

/** Titular y reemplazo vigentes (hasta = null) de cada puesto, en una pasada. */
export function vigentesPorPuesto(asignaciones: ConBorrado<Asignacion>[]): Vigentes {
  const v: Vigentes = new Map();
  for (const a of asignaciones) {
    if (a.deleted_at || a.hasta !== null) continue;
    v.set(a.puesto_id, { ...v.get(a.puesto_id), [a.tipo]: a });
  }
  return v;
}

/** Dotación = puestos con titular vigente; vacantes = puestos sin titular vigente (un reemplazo no suma). */
export function dotacion(
  unidades: U[],
  puestos: ConBorrado<Puesto>[],
  asignaciones: ConBorrado<Asignacion>[],
  id: string,
): { directa: number; total: number; vacantes: number } {
  const rama = descendientes(unidades, id).add(id);
  const vigentes = vigentesPorPuesto(asignaciones);
  const vivos = puestos.filter((p) => !p.deleted_at);
  const ocupado = (p: Puesto) => !!vigentes.get(p.id)?.titular;
  return {
    directa: vivos.filter((p) => ocupado(p) && p.unidad_id === id).length,
    total: vivos.filter((p) => ocupado(p) && rama.has(p.unidad_id)).length,
    vacantes: vivos.filter((p) => !ocupado(p) && rama.has(p.unidad_id)).length,
  };
}

/** `dotacion` de todas las unidades vivas en O(unidades + puestos + asignaciones): conteos directos sumados de hojas a raíz. */
export function dotacionPorUnidad(
  unidades: U[],
  puestos: ConBorrado<Puesto>[],
  asignaciones: ConBorrado<Asignacion>[],
): Map<string, { directa: number; total: number; vacantes: number }> {
  const res = new Map<string, { directa: number; total: number; vacantes: number }>();
  for (const u of unidades) if (!u.deleted_at) res.set(u.id, { directa: 0, total: 0, vacantes: 0 });
  const vigentes = vigentesPorPuesto(asignaciones);
  for (const p of puestos) {
    const d = p.deleted_at ? undefined : res.get(p.unidad_id);
    if (d && vigentes.get(p.id)?.titular) d.directa++;
    else if (d) d.vacantes++;
  }
  const indice = indiceHijos(unidades);
  const vistos = new Set<string>(); // corta si los datos ya traen un ciclo
  const sumar = (id: string) => {
    vistos.add(id);
    const d = res.get(id)!;
    d.total = d.directa;
    for (const h of indice.get(id) ?? []) {
      if (vistos.has(h.id)) continue;
      sumar(h.id);
      d.total += res.get(h.id)!.total;
      d.vacantes += res.get(h.id)!.vacantes;
    }
  };
  (indice.get(null) ?? []).forEach((r) => sumar(r.id));
  return res;
}

/** Quien encabeza la unidad: el titular vigente de su puesto de jefatura o, si no hay, el reemplazo vigente. */
export function jefeVisible(unidad: Unidad, vigentes: Vigentes): Asignacion | null {
  const v = unidad.jefe_puesto_id ? vigentes.get(unidad.jefe_puesto_id) : undefined;
  return v?.titular ?? v?.reemplazo ?? null;
}

/** Unidades donde la persona tiene un puesto vigente (titular o reemplazo), sin repetir. */
export function unidadesDePersona(
  puestos: ConBorrado<Puesto>[],
  asignaciones: ConBorrado<Asignacion>[],
  trabajadorId: string,
): string[] {
  const unidadDe = new Map(puestos.filter((p) => !p.deleted_at).map((p) => [p.id, p.unidad_id]));
  const res = new Set<string>();
  for (const a of asignaciones) {
    const u = unidadDe.get(a.puesto_id);
    if (u && a.trabajador_id === trabajadorId && a.hasta === null && !a.deleted_at) res.add(u);
  }
  return [...res];
}

/** Marca de la unidad más cercana hacia arriba (incluida ella) del tipo `nivel` que tenga color o código. */
export function marcaHeredada(
  unidades: Unidad[],
  unidadId: string,
  nivel: Unidad["tipo_id"] | "cualquiera",
): { color: string | null; codigo: string | null } | null {
  const m = ruta(unidades, unidadId)
    .reverse()
    .find((u) => (nivel === "cualquiera" || u.tipo_id === nivel) && (u.marca_color || u.marca_codigo));
  return m ? { color: m.marca_color, codigo: m.marca_codigo } : null;
}

// Gerencia, área, etc. no se guardan en el trabajador: se derivan del ancestro más cercano de cada tipo.
/** Para cada tipo (en orden del catálogo), la unidad más cercana hacia arriba, incluida ella; omite los tipos ausentes. */
export function rutaPorTipo(
  unidades: Unidad[],
  tipos: ValorCatalogo[],
  unidadId: string,
): { tipo: ValorCatalogo; unidad: Unidad }[] {
  const camino = ruta(unidades, unidadId).reverse();
  return [...tipos].sort(porOrden).flatMap((tipo) => {
    const unidad = camino.find((u) => u.tipo_id === tipo.id);
    return unidad ? [{ tipo, unidad }] : [];
  });
}

/** Tipo sugerido para una unidad nueva: el siguiente activo en orden tras el de su superior (el último se repite; sin superior, el primero). */
export function tipoHijo(tipos: ValorCatalogo[], tipoPadreId: string | null): string | undefined {
  const orden = [...tipos].sort(porOrden);
  const activos = orden.filter((t) => !t.deleted_at);
  const i = orden.findIndex((t) => t.id === tipoPadreId);
  return (orden.slice(i + 1).find((t) => !t.deleted_at) ?? activos[activos.length - 1])?.id;
}
