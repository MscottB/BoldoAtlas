import type { Puesto, Unidad, ValorCatalogo } from "@/db/tipos";
import { indiceHijos, jefeVisible, type Vigentes } from "@/features/arbol/jerarquia";
import { normalizarTexto } from "@/lib/texto";
import { collator, type FilaPersonaUnidad } from "./personas";

/** Puesto sin titular ni reemplazo vigentes. */
export interface VacanteArbol {
  clave: string;
  puestoId: string;
  cargo: string;
}

export interface NodoArbol {
  unidad: Unidad;
  /** Quien encabeza la unidad (va en la fila de la unidad, no bajo ella). */
  jefe: FilaPersonaUnidad | null;
  personas: FilaPersonaUnidad[];
  vacantes: VacanteArbol[];
  hijos: NodoArbol[];
  /** Titulares de toda la rama: la misma cifra que la dotación de la tarjeta. Los reemplazos se ven, pero no suman. */
  total: number;
}

export const claveUnidad = (id: string) => `u:${id}`;
export const claveVacante = (puestoId: string) => `v:${puestoId}`;
/** Una raíz, o varias (el directorio de una organización con más de una). */
export type Raices = NodoArbol | NodoArbol[];

/**
 * El árbol de `raiz` en O(unidades + puestos + filas). `filas` son las de `personasDelAlcance`, ya en el orden pedido;
 * ese orden se conserva dentro de cada unidad. `unidades` son las que pueden colgar de la raíz: sin ellas (`[]`) queda
 * solo la raíz, como «Incluir subunidades» apagado. `jefaturas` son las filas de los puestos de jefatura: un puesto
 * movido a otra unidad sigue siendo su jefatura (la de Resumen), aunque su fila no esté entre las de la unidad.
 */
export function arbolDePersonas(
  raiz: Unidad,
  unidades: Unidad[],
  puestos: Puesto[],
  filas: FilaPersonaUnidad[],
  vigentes: Vigentes,
  cargos: ValorCatalogo[],
  jefaturas: FilaPersonaUnidad[] = [],
): NodoArbol {
  const indice = indiceHijos(unidades);
  const deJefatura = new Map(jefaturas.map((f) => [f.clave, f]));
  const nombreCargo = new Map(cargos.map((c) => [c.id, c.nombre]));
  const agrupar = <T>(grupos: Map<string, T[]>, id: string, x: T) => {
    const lista = grupos.get(id);
    if (lista) lista.push(x);
    else grupos.set(id, [x]);
  };
  const gente = new Map<string, FilaPersonaUnidad[]>();
  for (const f of filas) agrupar(gente, f.unidadId, f);
  const vacios = new Map<string, VacanteArbol[]>();
  for (const p of puestos) {
    const v = vigentes.get(p.id);
    if (!v?.titular && !v?.reemplazo)
      agrupar(vacios, p.unidad_id, {
        clave: claveVacante(p.id),
        puestoId: p.id,
        cargo: nombreCargo.get(p.cargo_id) ?? "",
      });
  }

  const vistos = new Set<string>(); // corta si los datos ya traen un ciclo
  const armar = (unidad: Unidad): NodoArbol => {
    vistos.add(unidad.id);
    const propias = gente.get(unidad.id) ?? [];
    const asignacion = jefeVisible(unidad, vigentes);
    const jefe =
      (asignacion && (propias.find((f) => f.clave === asignacion.id) ?? deJefatura.get(asignacion.id))) ??
      null;
    const hijos = (indice.get(unidad.id) ?? []).filter((h) => !vistos.has(h.id)).map(armar);
    return {
      unidad,
      jefe,
      personas: jefe ? propias.filter((f) => f !== jefe) : propias,
      vacantes: (vacios.get(unidad.id) ?? []).sort((a, b) => collator.compare(a.cargo, b.cargo)),
      hijos,
      total: hijos.reduce((suma, h) => suma + h.total, propias.filter((f) => f.tipo === "titular").length),
    };
  };
  return armar(raiz);
}

/**
 * Lo que se ve con una búsqueda: lo que coincide y sus ancestros. `coinciden` son las claves de las filas que dejó el
 * filtro de la lista (nombre, cargo, unidad o correo; en el directorio, también las vacantes), así ambas vistas muestran
 * lo mismo; `buscado` ya viene normalizado, y vacío no busca en nombres de unidad ni cargos de vacantes. Las subunidades
 * de una unidad que coincide no entran si no coinciden ellas.
 */
export function visiblesDeBusqueda(raiz: Raices, coinciden: Set<string>, buscado: string): Set<string> {
  const visibles = new Set<string>();
  const incluye = (s: string) => !!buscado && normalizarTexto(s).includes(buscado);
  const ver = (n: NodoArbol): boolean => {
    const porNombre = incluye(n.unidad.nombre);
    let algo = porNombre || (!!n.jefe && coinciden.has(n.jefe.clave));
    for (const f of n.personas) {
      if (!coinciden.has(f.clave)) continue;
      visibles.add(f.clave);
      algo = true;
    }
    for (const v of n.vacantes) {
      if (!porNombre && !incluye(v.cargo) && !coinciden.has(v.clave)) continue;
      visibles.add(v.clave);
      algo = true;
    }
    for (const h of n.hijos) if (ver(h)) algo = true;
    if (algo) visibles.add(claveUnidad(n.unidad.id));
    return algo;
  };
  for (const r of [raiz].flat()) ver(r);
  return visibles;
}

interface FilaBase {
  clave: string;
  /** Empieza en 1, como `aria-level`. */
  nivel: number;
  posicion: number;
  hermanos: number;
}
export type FilaArbol = FilaBase &
  (
    | { clase: "unidad"; nodo: NodoArbol; /** `undefined`: no tiene nada que desplegar. */ abierta?: boolean }
    | { clase: "persona"; fila: FilaPersonaUnidad }
    | { clase: "vacante"; vacante: VacanteArbol }
  );

/** Las filas a la vista, en orden: bajo cada unidad abierta, sus personas, sus vacantes y luego sus subunidades. */
export function aplanarArbol(
  raiz: Raices,
  abierta: (id: string) => boolean,
  visibles: Set<string> | null,
): FilaArbol[] {
  const filas: FilaArbol[] = [];
  const ve = <T>(lista: T[], clave: (x: T) => string) =>
    visibles ? lista.filter((x) => visibles.has(clave(x))) : lista;
  const agregar = (nodo: NodoArbol, nivel: number, posicion: number, hermanos: number) => {
    const personas = ve(nodo.personas, (f) => f.clave);
    const vacantes = ve(nodo.vacantes, (v) => v.clave);
    const hijos = ve(nodo.hijos, (h) => claveUnidad(h.unidad.id));
    const debajo = personas.length + vacantes.length + hijos.length;
    const abre = debajo > 0 && abierta(nodo.unidad.id);
    const clave = claveUnidad(nodo.unidad.id);
    filas.push({
      clase: "unidad",
      clave,
      nivel,
      posicion,
      hermanos,
      nodo,
      abierta: debajo > 0 ? abre : undefined,
    });
    if (!abre) return;
    const base = { nivel: nivel + 1, hermanos: debajo };
    let i = 1;
    for (const fila of personas)
      filas.push({ ...base, clase: "persona", clave: fila.clave, posicion: i++, fila });
    for (const vacante of vacantes)
      filas.push({ ...base, clase: "vacante", clave: vacante.clave, posicion: i++, vacante });
    for (const h of hijos) agregar(h, nivel + 1, i++, debajo);
  };
  const raices = ve([raiz].flat(), (r) => claveUnidad(r.unidad.id));
  raices.forEach((r, i) => agregar(r, 1, i + 1, raices.length));
  return filas;
}

/** Cada unidad del árbol con su nivel: las raíces son el 1. */
function niveles(raiz: Raices): Map<string, number> {
  const nivel = new Map<string, number>();
  const pendientes: [NodoArbol, number][] = [raiz].flat().map((n) => [n, 1]);
  while (pendientes.length) {
    const [n, k] = pendientes.pop()!;
    nivel.set(n.unidad.id, k);
    for (const h of n.hijos) pendientes.push([h, k + 1]);
  }
  return nivel;
}

/** Ids de las unidades del árbol. */
export const idsDelArbol = (raiz: Raices): string[] => [...niveles(raiz).keys()];

/** Cuántos niveles de unidades tiene el árbol (0 sin unidades): los que ofrece «plegar por niveles». */
export function profundidad(raiz: Raices): number {
  let max = 0;
  for (const k of niveles(raiz).values()) if (k > max) max = k;
  return max;
}

/**
 * Qué está abierto. Sin búsqueda manda `abiertas`; con búsqueda todo parte abierto y manda `cerradas`, que se olvida
 * al cambiar el texto.
 */
export interface Pliegue {
  abiertas: Set<string>;
  cerradas: Set<string>;
}

export const estaAbierta = (p: Pliegue, buscando: boolean, id: string) =>
  buscando ? !p.cerradas.has(id) : p.abiertas.has(id);

export function plegarUnidad(p: Pliegue, buscando: boolean, id: string, abrir: boolean): Pliegue {
  const s = new Set(buscando ? p.cerradas : p.abiertas);
  if (abrir === !buscando) s.add(id);
  else s.delete(id);
  return buscando ? { ...p, cerradas: s } : { ...p, abiertas: s };
}

/** El nivel que se ve: el de la unidad más honda a la vista (0 sin filas). Sigue a lo que se pliega a mano. */
export function nivelALaVista(filas: FilaArbol[]): number {
  let max = 0;
  for (const f of filas) if (f.clase === "unidad" && f.nivel > max) max = f.nivel;
  return max;
}

/** Cuántas personas (jefaturas incluidas) y vacantes tiene el árbol o, con `coinciden`, cuántas de ellas coinciden. */
export function contarFilas(raiz: Raices, coinciden: Set<string> | null): number {
  const cuenta = (clave: string) => (!coinciden || coinciden.has(clave) ? 1 : 0);
  let n = 0;
  const pendientes = [raiz].flat();
  while (pendientes.length) {
    const nodo = pendientes.pop()!;
    if (nodo.jefe) n += cuenta(nodo.jefe.clave);
    for (const f of nodo.personas) n += cuenta(f.clave);
    for (const v of nodo.vacantes) n += cuenta(v.clave);
    pendientes.push(...nodo.hijos);
  }
  return n;
}

/** Se ven las unidades hasta el nivel `nivel`, cerradas las de ese nivel: como los niveles del lienzo. */
export function abrirHastaNivel(p: Pliegue, buscando: boolean, raiz: Raices, nivel: number): Pliegue {
  const ids = (cerrada: boolean) =>
    new Set([...niveles(raiz)].filter(([, k]) => k >= nivel === cerrada).map(([id]) => id));
  return buscando ? { ...p, cerradas: ids(true) } : { ...p, abiertas: ids(false) };
}

export const expandirTodo = (p: Pliegue, buscando: boolean, raiz: Raices) =>
  abrirHastaNivel(p, buscando, raiz, Infinity);

/** Deja la raíz con su primer nivel: como la carpeta raíz de un explorador, ella sigue abierta. */
export const contraerTodo = (p: Pliegue, buscando: boolean, raiz: Raices) =>
  abrirHastaNivel(p, buscando, raiz, 2);

/** El árbol pasa a partir de `id`: lo abierto se conserva, para volver atrás con las mismas ramas abiertas. */
export function cambiarRaiz(p: Pliegue, id: string): Pliegue {
  return { abiertas: new Set([...p.abiertas, id]), cerradas: new Set() };
}

export type AccionFila =
  | { tipo: "persona"; fila: FilaPersonaUnidad }
  | { tipo: "vacante"; puestoId: string }
  | { tipo: "unidad"; id: string }
  | { tipo: "nada" };

/**
 * Lo que hace una fila al pulsarla. Con `jefatura` (Mayús+Enter), una unidad abre a quien la encabeza, si tiene. Una
 * vacante abre su puesto donde se puede (el directorio); en la pestaña Personas no hace nada.
 */
export function accionFila(f: FilaArbol, jefatura = false): AccionFila {
  if (f.clase === "persona") return { tipo: "persona", fila: f.fila };
  if (f.clase === "vacante") return { tipo: "vacante", puestoId: f.vacante.puestoId };
  return jefatura && f.nodo.jefe
    ? { tipo: "persona", fila: f.nodo.jefe }
    : { tipo: "unidad", id: f.nodo.unidad.id };
}

export type AccionTecla =
  AccionFila | { tipo: "ir"; indice: number } | { tipo: "plegar"; id: string; abrir: boolean };

/** Patrón «tree» de WAI-ARIA sobre las filas aplanadas. `null`: la tecla no es del árbol. */
export function accionTecla(filas: FilaArbol[], i: number, tecla: string, mayus = false): AccionTecla | null {
  const f = filas[i];
  const ir = (indice: number): AccionTecla =>
    indice >= 0 && indice < filas.length ? { tipo: "ir", indice } : { tipo: "nada" };
  switch (tecla) {
    case "Enter":
    case " ":
      return accionFila(f, mayus);
    case "ArrowDown":
      return ir(i + 1);
    case "ArrowUp":
      return ir(i - 1);
    case "Home":
      return ir(0);
    case "End":
      return ir(filas.length - 1);
    case "ArrowRight":
      if (f.clase !== "unidad" || f.abierta === undefined) return { tipo: "nada" };
      return f.abierta ? ir(i + 1) : { tipo: "plegar", id: f.nodo.unidad.id, abrir: true };
    case "ArrowLeft": {
      if (f.clase === "unidad" && f.abierta) return { tipo: "plegar", id: f.nodo.unidad.id, abrir: false };
      let padre = i - 1;
      while (padre >= 0 && filas[padre].nivel >= f.nivel) padre--;
      return ir(padre);
    }
    default:
      return null;
  }
}
