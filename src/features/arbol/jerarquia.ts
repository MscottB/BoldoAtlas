import type { Asignacion, Puesto, Trabajador, Unidad, ValorCatalogo } from "../../db/tipos";
import { hoyISO } from "../puestos/puestos";

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

/** Alta y baja de una fila: instantes ISO (UTC). */
type Vida = { created_at?: string; deleted_at?: string | null };
// El día de un instante es el local (no el UTC): a la noche en Chile el UTC ya marcaría mañana.
const dia = (instante: string) => hoyISO(new Date(instante));
const sinBajaEn = (f: Vida, fecha: string) => !f.deleted_at || dia(f.deleted_at) > fecha;

/** Existía el día `fecha` (AAAA-MM-DD): creada ese día o antes, y no eliminada ese día ni antes. Sin created_at, desde siempre. */
export const existiaEn = (f: Vida, fecha: string): boolean =>
  (!f.created_at || dia(f.created_at) <= fecha) && sinBajaEn(f, fecha);

/** Asignaciones vigentes el día `fecha`: `desde <= fecha` y (`hasta` NULL o `hasta > fecha`). `created_at` no cuenta: una carga tardía manda por su `desde`. */
export const vigentesEn = <T extends Vida & Pick<Asignacion, "desde" | "hasta">>(
  asignaciones: T[],
  fecha: string,
): T[] =>
  asignaciones.filter(
    (a) => sinBajaEn(a, fecha) && a.desde <= fecha && (a.hasta === null || a.hasta > fecha),
  );

/** Titular y reemplazo vigentes de cada puesto, en una pasada: los de hoy (hasta = null) o, con `fecha`, los de ese día. */
export function vigentesPorPuesto(asignaciones: ConBorrado<Asignacion>[], fecha?: string): Vigentes {
  const v: Vigentes = new Map();
  const vigentes = fecha
    ? vigentesEn(asignaciones, fecha)
    : asignaciones.filter((a) => !a.deleted_at && a.hasta === null);
  for (const a of vigentes) v.set(a.puesto_id, { ...v.get(a.puesto_id), [a.tipo]: a });
  return v;
}

/** Dotación = puestos con titular vigente; vacantes = puestos sin titular vigente (un reemplazo no suma). */
export function dotacion(
  unidades: U[],
  puestos: ConBorrado<Puesto>[],
  asignaciones: ConBorrado<Asignacion>[],
  id: string,
  fecha?: string,
): { directa: number; total: number; vacantes: number } {
  const rama = descendientes(unidades, id).add(id);
  const vigentes = vigentesPorPuesto(asignaciones, fecha);
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
  fecha?: string,
): Map<string, { directa: number; total: number; vacantes: number }> {
  const res = new Map<string, { directa: number; total: number; vacantes: number }>();
  for (const u of unidades) if (!u.deleted_at) res.set(u.id, { directa: 0, total: 0, vacantes: 0 });
  const vigentes = vigentesPorPuesto(asignaciones, fecha);
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

/** Lo que lee «ver a una fecha»: todas las filas, también las eliminadas. */
export interface Historico {
  unidades: (Unidad & Vida)[];
  puestos: (Puesto & Vida)[];
  asignaciones: (Asignacion & Vida)[];
  trabajadores: Trabajador[];
}

/**
 * El organigrama el día `fecha`: unidades y puestos que existían (lo eliminado después reaparece como vivo; si su superior
 * no se ve, queda como raíz) y el historial completo de sus asignaciones (`vigentesPorPuesto(…, fecha)` elige las de ese día).
 * Los cambios de superior no se registran: la forma es la de hoy. Las personas se dejan todas, solo se leen sus nombres.
 */
export function instantaneaEn(h: Historico, fecha: string) {
  const vivas = h.unidades.filter((u) => existiaEn(u, fecha));
  const vistas = new Set(vivas.map((u) => u.id));
  const unidades = vivas.map((u) => ({
    ...u,
    deleted_at: null,
    parent_id: u.parent_id && vistas.has(u.parent_id) ? u.parent_id : null,
  }));
  const puestos = h.puestos
    .filter((p) => vistas.has(p.unidad_id) && existiaEn(p, fecha))
    .map((p) => ({ ...p, deleted_at: null }));
  const deLosPuestos = new Set(puestos.map((p) => p.id));
  const asignaciones = h.asignaciones.filter((a) => deLosPuestos.has(a.puesto_id) && sinBajaEn(a, fecha));
  return { unidades, puestos, asignaciones, trabajadores: h.trabajadores };
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

/** Valor derivado de cada unidad viva a partir del de su superior, en una sola pasada de raíces a hojas. */
function heredar<T>(unidades: U[], inicial: T, paso: (u: Unidad, delSuperior: T) => T): Map<string, T> {
  const indice = indiceHijos(unidades);
  const res = new Map<string, T>();
  const visitar = (u: Unidad, delSuperior: T) => {
    if (res.has(u.id)) return; // corta si los datos ya traen un ciclo
    const v = paso(u, delSuperior);
    res.set(u.id, v);
    for (const h of indice.get(u.id) ?? []) visitar(h, v);
  };
  (indice.get(null) ?? []).forEach((r) => visitar(r, inicial));
  return res;
}

/** Marca efectiva de una unidad y la unidad que la define. */
export interface Marca {
  color: string | null;
  codigo: string | null;
  unidad: Unidad;
}

/** `marcaHeredada` de todas las unidades vivas para un tipo, en O(n); null = sin marca. */
export function marcasPorUnidad(unidades: U[], nivel: string): Map<string, Marca | null> {
  return heredar<Marca | null>(unidades, null, (u, arriba) =>
    u.tipo_id === nivel && (u.marca_color || u.marca_codigo)
      ? { color: u.marca_color, codigo: u.marca_codigo, unidad: u }
      : arriba,
  );
}

/** Marcas distintas de las unidades dadas, una por unidad que la define, en el orden en que aparecen. */
export function leyendaDeMarcas(marcas: Map<string, Marca | null>, nodos: Unidad[]): Marca[] {
  const definidas = new Set<string>();
  const res: Marca[] = [];
  for (const n of nodos) {
    const m = marcas.get(n.id);
    if (m && !definidas.has(m.unidad.id)) {
      definidas.add(m.unidad.id);
      res.push(m);
    }
  }
  return res;
}

/** `rutaPorTipo` de todas las unidades vivas para los tipos elegidos (en orden del catálogo), en O(n). */
export function rutasPorTipo(
  unidades: U[],
  tipos: ValorCatalogo[],
  elegidos: Set<string>,
): Map<string, Unidad[]> {
  const rango = new Map([...tipos].sort(porOrden).map((t, i) => [t.id, i]));
  return heredar<Unidad[]>(unidades, [], (u, arriba) =>
    elegidos.has(u.tipo_id)
      ? [...arriba.filter((x) => x.tipo_id !== u.tipo_id), u].sort(
          (a, b) => (rango.get(a.tipo_id) ?? 0) - (rango.get(b.tipo_id) ?? 0),
        )
      : arriba,
  );
}

/** De `rutasPorTipo`, solo los superiores de la unidad: la ruta de su padre (la propia unidad taparía a un superior de su mismo tipo). */
export function rutaSuperiores(rutas: Map<string, Unidad[]>, unidad: Unidad): Unidad[] {
  return (unidad.parent_id && rutas.get(unidad.parent_id)) || [];
}

/** Tipos que alguna unidad viva usa, en el orden del catálogo. */
export function tiposEnUso(unidades: U[], tipos: ValorCatalogo[]): ValorCatalogo[] {
  const usados = new Set(unidades.filter((u) => !u.deleted_at).map((u) => u.tipo_id));
  return tipos.filter((t) => usados.has(t.id)).sort(porOrden);
}
