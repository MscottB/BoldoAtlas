import type { Puesto, Trabajador, Unidad, ValorCatalogo } from "@/db/tipos";
import { rutasPorTipo, rutaSuperiores, tiposEnUso, type Vigentes } from "@/features/arbol/jerarquia";
import { normalizarTexto } from "@/lib/texto";
import { i18n } from "@/i18n";

export interface ItemUnidad {
  id: string;
  nombre: string;
  /** Superiores por tipo (Gerencia › Área…), en texto. */
  ruta: string;
}
export interface ItemPersona {
  id: string;
  nombre: string;
  /** «Cargo · Unidad» de cada puesto donde tiene una asignación vigente. */
  cargos: string[];
}
export interface ItemVacante {
  /** Id del puesto. */
  id: string;
  cargo: string;
  unidad: string;
}
export interface Accion {
  id: string;
  etiqueta: string;
}

/** Lo que se muestra de cada grupo (tope aplicado) y cuántos coinciden en total. */
export interface Grupo<T> {
  items: T[];
  total: number;
}
export interface ResultadosPaleta<A extends Accion = Accion> {
  unidades: Grupo<ItemUnidad>;
  personas: Grupo<ItemPersona>;
  vacantes: Grupo<ItemVacante>;
  acciones: Grupo<A>;
}

// Cada fila lleva su texto ya normalizado: buscar es un `includes` por fila, sin renormalizar en cada tecla.
type Fila<T> = { norm: string; item: T };
export interface IndicePaleta {
  unidades: Fila<ItemUnidad>[];
  personas: Fila<ItemPersona>[];
  vacantes: Fila<ItemVacante>[];
}

const fila = <T>(texto: string, item: T): Fila<T> => ({
  norm: normalizarTexto(texto),
  item,
});

/** Indexa lo que se ve en el lienzo. Ordenado por nombre una sola vez; hay que rehacerlo solo cuando cambian los datos. */
export function indexarPaleta(d: {
  unidades: Unidad[];
  trabajadores: Trabajador[];
  puestos: Puesto[];
  vigentes: Vigentes;
  cargos: ValorCatalogo[];
  tipos: ValorCatalogo[];
}): IndicePaleta {
  const nombreUnidad = new Map(d.unidades.map((u) => [u.id, u.nombre]));
  const nombreCargo = new Map(d.cargos.map((c) => [c.id, c.nombre]));
  const rutas = rutasPorTipo(d.unidades, d.tipos, new Set(tiposEnUso(d.unidades, d.tipos).map((t) => t.id)));

  const cargosDe = new Map<string, string[]>();
  const vacantes: Fila<ItemVacante>[] = [];
  for (const p of d.puestos) {
    const unidad = nombreUnidad.get(p.unidad_id);
    if (unidad === undefined) continue;
    const cargo = nombreCargo.get(p.cargo_id) ?? "";
    const v = d.vigentes.get(p.id);
    // Igual que la dotación: un reemplazo no cubre el puesto.
    if (!v?.titular) vacantes.push(fila(`${cargo} ${unidad}`, { id: p.id, cargo, unidad }));
    for (const a of [v?.titular, v?.reemplazo])
      if (a)
        cargosDe.set(a.trabajador_id, [...(cargosDe.get(a.trabajador_id) ?? []), `${cargo} · ${unidad}`]);
  }

  // Etiquetas de la interfaz: se ordenan según el idioma activo al indexar (se rehace al cambiar los datos).
  const colador = new Intl.Collator(i18n.global.locale.value);
  const porNombre = (a: Fila<{ nombre: string }>, b: Fila<{ nombre: string }>) =>
    colador.compare(a.item.nombre, b.item.nombre);
  return {
    unidades: d.unidades
      .map((u) =>
        fila(u.nombre, {
          id: u.id,
          nombre: u.nombre,
          ruta: rutaSuperiores(rutas, u)
            .map((x) => x.nombre)
            .join(" › "),
        }),
      )
      .sort(porNombre),
    personas: d.trabajadores
      .map((t) => fila(t.nombre, { id: t.id, nombre: t.nombre, cargos: cargosDe.get(t.id) ?? [] }))
      .sort(porNombre),
    vacantes: vacantes.sort((a, b) =>
      colador.compare(a.item.cargo + a.item.unidad, b.item.cargo + b.item.unidad),
    ),
  };
}

function grupo<T>(filas: Fila<T>[], buscado: string, limite: number): Grupo<T> {
  const items: T[] = [];
  let total = 0;
  for (const f of filas) if (f.norm.includes(buscado) && ++total <= limite) items.push(f.item);
  return { items, total };
}

/**
 * Resultados por grupo para lo escrito (sin tildes ni mayúsculas). Sin texto solo se ofrecen las acciones:
 * listar miles de personas al abrir la paleta no ayuda a nadie.
 */
export function buscarEnPaleta<A extends Accion>(
  indice: IndicePaleta,
  texto: string,
  acciones: A[],
  limite = 20,
): ResultadosPaleta<A> {
  const buscado = normalizarTexto(texto);
  const filasAcciones = acciones.map((a) => fila(a.etiqueta, a));
  if (!buscado)
    return {
      unidades: { items: [], total: 0 },
      personas: { items: [], total: 0 },
      vacantes: { items: [], total: 0 },
      acciones: grupo(filasAcciones, "", limite),
    };
  return {
    unidades: grupo(indice.unidades, buscado, limite),
    personas: grupo(indice.personas, buscado, limite),
    vacantes: grupo(indice.vacantes, buscado, limite),
    acciones: grupo(filasAcciones, buscado, limite),
  };
}
